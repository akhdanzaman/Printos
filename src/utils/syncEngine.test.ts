import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncEngine } from './syncEngine';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function fakeServer(initialRevision = 0) {
  let revision = initialRevision;
  let workspace: unknown = { marker: `rev-${initialRevision}` };
  const calls: { method: string; body?: any }[] = [];

  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, body });

    if (method === 'GET') {
      return json({ ok: true, revision, updatedAt: '2026-10-31T00:00:00.000Z', workspace });
    }
    if (method === 'PUT') {
      if (body.force !== true && body.expectedRevision !== revision) {
        return json(
          { ok: false, error: 'REVISION_CONFLICT', currentRevision: revision },
          409
        );
      }
      revision += 1;
      workspace = body.workspace;
      return json({ ok: true, revision, updatedAt: '2026-10-31T00:00:01.000Z' });
    }
    return json({ ok: false }, 405);
  }) as unknown as typeof fetch;

  return {
    fetchImpl,
    calls,
    get revision() {
      return revision;
    },
    get workspace() {
      return workspace;
    },
    bump() {
      revision += 1;
      workspace = { marker: `external-${revision}` };
    },
  };
}

const engineFor = (server: ReturnType<typeof fakeServer>, extra: Record<string, unknown> = {}) =>
  createSyncEngine({
    url: 'https://example.test/api/workspace',
    token: 'token-123',
    debounceMs: 250,
    retryDelaysMs: [1, 1, 1],
    fetchImpl: server.fetchImpl,
    storage: null,
    ...extra,
  });

test('repeated changes inside the debounce window produce exactly one PUT', async () => {
  const server = fakeServer();
  const engine = engineFor(server);

  engine.schedulePush({ a: 1 });
  engine.schedulePush({ a: 2 });
  engine.schedulePush({ a: 3 });
  await new Promise((resolve) => setTimeout(resolve, 400));

  assert.equal(server.calls.filter((c) => c.method === 'PUT').length, 1);
  assert.deepEqual(server.workspace, { a: 3 });
  engine.dispose();
});

test('push sends expectedRevision and adopts the revision returned by the server', async () => {
  const server = fakeServer(3);
  const engine = engineFor(server);
  await engine.pull();
  assert.equal(engine.getSnapshot().revision, 3);

  engine.schedulePush({ a: 1 });
  await engine.flush();
  const put = server.calls.find((c) => c.method === 'PUT');
  assert.equal(put?.body.expectedRevision, 3);
  assert.equal(engine.getSnapshot().revision, 4);
  assert.equal(engine.getSnapshot().status, 'synced');
  engine.dispose();
});

test('a stale revision gets 409 and never retries by itself', async () => {
  const server = fakeServer(0);
  const engine = engineFor(server);
  await engine.pull();
  server.bump();

  engine.schedulePush({ a: 1 });
  await engine.flush();

  const snapshot = engine.getSnapshot();
  assert.equal(snapshot.status, 'conflict');
  assert.equal(snapshot.conflictRemoteRevision, 1);
  assert.equal(snapshot.hasPendingChanges, true);
  assert.equal(server.calls.filter((c) => c.method === 'PUT').length, 1);
  engine.dispose();
});

test('keep-local resends the pending state with force and clears the conflict', async () => {
  const server = fakeServer(0);
  const engine = engineFor(server);
  await engine.pull();
  server.bump();
  engine.schedulePush({ a: 1 });
  await engine.flush();
  assert.equal(engine.getSnapshot().status, 'conflict');

  await engine.resolveConflict('keep-local');

  const puts = server.calls.filter((c) => c.method === 'PUT');
  assert.equal(puts.length, 2);
  assert.equal(puts[1].body.force, true);
  assert.equal(engine.getSnapshot().status, 'synced');
  assert.deepEqual(server.workspace, { a: 1 });
  engine.dispose();
});

test('take-remote hands the server workspace back and drops local pending', async () => {
  const server = fakeServer(0);
  const received: unknown[] = [];
  const engine = engineFor(server, {
    onRemote: (workspace: unknown) => received.push(workspace),
  });
  await engine.pull();
  server.bump();
  engine.schedulePush({ local: true });
  await engine.flush();
  assert.equal(engine.getSnapshot().status, 'conflict');

  await engine.resolveConflict('take-remote');

  assert.equal(received.length, 2, 'initial pull + conflict resolution');
  assert.deepEqual(received[1], { marker: 'external-1' });
  assert.equal(engine.getSnapshot().hasPendingChanges, false);
  assert.equal(engine.getSnapshot().status, 'synced');
  engine.dispose();
});

test('401 marks the engine unauthorized and stops further pushes', async () => {
  const calls: string[] = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(init?.method || 'GET');
    return json({ ok: false, error: 'Token tidak valid' }, 401);
  }) as unknown as typeof fetch;

  const engine = createSyncEngine({
    url: 'https://example.test/api/workspace',
    token: 'bad',
    debounceMs: 250,
    fetchImpl,
    storage: null,
  });
  await engine.pull();
  assert.equal(engine.getSnapshot().status, 'unauthorized');

  engine.schedulePush({ a: 1 });
  await engine.flush();
  assert.equal(calls.filter((m) => m === 'PUT').length, 0);
  engine.dispose();
});

test('network failures retry then settle as offline, and recover on the next push', async () => {
  let failing = true;
  let puts = 0;
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      puts += 1;
      if (failing) throw new Error('network down');
      return json({ ok: true, revision: 7, updatedAt: '2026-10-31T00:00:02.000Z' });
    }
    return json({ ok: true, revision: 6, updatedAt: '2026-10-31T00:00:00.000Z', workspace: {} });
  }) as unknown as typeof fetch;

  const engine = createSyncEngine({
    url: 'https://example.test/api/workspace',
    token: 'token',
    debounceMs: 250,
    retryDelaysMs: [1, 1, 1],
    fetchImpl,
    storage: null,
  });

  engine.schedulePush({ a: 1 });
  await engine.flush();
  assert.equal(engine.getSnapshot().status, 'offline');
  assert.equal(puts, 4, 'initial attempt + three retries');

  failing = false;
  engine.schedulePush({ a: 2 });
  await engine.flush();
  assert.equal(engine.getSnapshot().status, 'synced');
  assert.equal(engine.getSnapshot().revision, 7);
  engine.dispose();
});

test('an unchanged workspace is never pushed twice', async () => {
  const server = fakeServer(0);
  const engine = engineFor(server);
  engine.schedulePush({ a: 1 });
  await engine.flush();
  assert.equal(server.calls.filter((c) => c.method === 'PUT').length, 1);

  engine.schedulePush({ a: 1 });
  await engine.flush();
  assert.equal(server.calls.filter((c) => c.method === 'PUT').length, 1);
  engine.dispose();
});

test('an empty token disables the engine without touching the network', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return json({ ok: true });
  }) as unknown as typeof fetch;

  const engine = createSyncEngine({ url: 'https://x', token: '', fetchImpl, storage: null });
  await engine.pull();
  engine.schedulePush({ a: 1 });
  await engine.flush();

  assert.equal(engine.getSnapshot().status, 'disabled');
  assert.equal(calls, 0);
  engine.dispose();
});

test('disabling stops scheduled pushes until re-enabled', async () => {
  const server = fakeServer(0);
  const engine = engineFor(server);
  engine.setEnabled(false);
  assert.equal(engine.getSnapshot().status, 'disabled');

  engine.schedulePush({ a: 1 });
  await engine.flush();
  assert.equal(server.calls.length, 0);

  engine.setEnabled(true);
  engine.schedulePush({ a: 2 });
  await engine.flush();
  assert.equal(server.calls.filter((c) => c.method === 'PUT').length, 1);
  engine.dispose();
});

test('a snapshot received from the server is not pushed back (echo suppression)', async () => {
  const server = fakeServer(4);
  const engine = engineFor(server);
  const pulled = await engine.pull();
  assert.equal(pulled.ok, true);

  engine.schedulePush(pulled.workspace);
  await engine.flush();

  assert.equal(server.calls.filter((c) => c.method === 'PUT').length, 0);
  assert.equal(engine.getSnapshot().status, 'synced');
  engine.dispose();
});

test('a pull does not silently resolve a pending conflict', async () => {
  const server = fakeServer(0);
  const engine = engineFor(server);
  await engine.pull();
  server.bump();
  engine.schedulePush({ local: true });
  await engine.flush();
  assert.equal(engine.getSnapshot().status, 'conflict');

  const before = server.calls.length;
  const pulled = await engine.pull();

  assert.equal(pulled.ok, false);
  assert.equal(pulled.error, 'conflict');
  assert.equal(server.calls.length, before, 'no GET while a conflict awaits a decision');
  assert.equal(engine.getSnapshot().status, 'conflict');
  assert.equal(engine.getSnapshot().hasPendingChanges, true);
  engine.dispose();
});

test('take-remote adopts the remote revision and clears the conflict', async () => {
  const server = fakeServer(0);
  const engine = engineFor(server);
  await engine.pull();
  server.bump();
  engine.schedulePush({ local: true });
  await engine.flush();
  assert.equal(engine.getSnapshot().conflictRemoteRevision, 1);

  await engine.resolveConflict('take-remote');

  assert.equal(engine.getSnapshot().revision, 1);
  assert.equal(engine.getSnapshot().conflictRemoteRevision, null);
  assert.equal(engine.getSnapshot().hasPendingChanges, false);
  engine.dispose();
});

test('a newer remote snapshot does not overwrite pending local edits', async () => {
  const server = fakeServer(0);
  const received: unknown[] = [];
  const engine = engineFor(server, { onRemote: (workspace: unknown) => received.push(workspace) });
  await engine.pull();
  server.bump();
  engine.schedulePush({ local: true });

  const pulled = await engine.pull();

  assert.equal(pulled.ok, false);
  assert.equal(pulled.error, 'conflict');
  assert.equal(engine.getSnapshot().status, 'conflict');
  assert.equal(engine.getSnapshot().conflictRemoteRevision, 1);
  assert.equal(engine.getSnapshot().hasPendingChanges, true);
  assert.equal(received.length, 1, 'remote is not applied over pending work');
  engine.dispose();
});

test('a stale remote snapshot (lower revision) never replaces newer local state on first load', async () => {
  const server = fakeServer(2);
  const received: unknown[] = [];
  const persisted = new Map<string, string>([['printos_bridge_revision_v1', '5']]);
  const engine = createSyncEngine({
    url: 'https://example.test/api/workspace',
    token: 'token',
    fetchImpl: server.fetchImpl,
    storage: {
      getItem: (key: string) => persisted.get(key) ?? null,
      setItem: (key: string, value: string) => {
        persisted.set(key, value);
      },
    },
    onRemote: (workspace: unknown) => received.push(workspace),
  });

  const result = await engine.pull();

  assert.equal(result.ok, true);
  assert.equal(received.length, 0, 'stale snapshot must not be applied');
  assert.equal(engine.getSnapshot().revision, 2);
  engine.dispose();
});
