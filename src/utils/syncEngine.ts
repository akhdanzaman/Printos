/**
 * Framework-free sync engine for the PrintOS ↔ Hermes bridge.
 *
 * Responsibilities:
 *  - debounce local changes into a single PUT
 *  - never overwrite a newer remote revision (server returns 409)
 *  - expose a small, observable status for the UI
 *
 * It never throws: every public method resolves with a result object.
 */

export type SyncStatus =
  | 'disabled'
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'conflict'
  | 'unauthorized';

export interface SyncSnapshot {
  status: SyncStatus;
  revision: number | null;
  lastSyncedAt: string | null;
  hasPendingChanges: boolean;
  conflictRemoteRevision: number | null;
  enabled: boolean;
}

export interface SyncEngineOptions {
  url: string;
  token: string;
  debounceMs?: number;
  retryDelaysMs?: number[];
  fetchImpl?: typeof fetch;
  onRemote?: (workspace: unknown, revision: number) => void;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
}

export interface SyncEngine {
  pull(): Promise<{ ok: boolean; revision?: number; workspace?: unknown; error?: string }>;
  schedulePush(state: unknown): void;
  flush(): Promise<void>;
  resolveConflict(strategy: 'take-remote' | 'keep-local'): Promise<void>;
  setEnabled(enabled: boolean): void;
  getSnapshot(): SyncSnapshot;
  subscribe(listener: (snapshot: SyncSnapshot) => void): () => void;
  dispose(): void;
}

const REVISION_KEY = 'printos_bridge_revision_v1';
const RETRY_DELAYS_MS = [1000, 2000, 4000];

/** Deterministic stringify so equal workspaces always produce an equal hash. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(',')}}`;
}

export function hashWorkspace(value: unknown): string {
  const text = stableStringify(value);
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 33) ^ text.charCodeAt(i);
  }
  return `${text.length}:${(hash >>> 0).toString(36)}`;
}

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  const fetchImpl: typeof fetch = options.fetchImpl ?? ((...args) => fetch(...args));
  const debounceMs = Math.max(250, options.debounceMs ?? 2500);
  const retryDelays = options.retryDelaysMs ?? RETRY_DELAYS_MS;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;

  let enabled = Boolean(options.token && options.token.trim());
  let status: SyncStatus = enabled ? 'idle' : 'disabled';
  let revision: number | null = null;
  let lastSyncedAt: string | null = null;
  let pending: unknown = null;
  let lastSyncedHash = '';
  let conflictRemoteRevision: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let hasPulled = false;
  const listeners = new Set<(snapshot: SyncSnapshot) => void>();

  try {
    const raw = storage?.getItem(REVISION_KEY);
    const parsed = raw ? Number(raw) : NaN;
    revision = Number.isFinite(parsed) ? parsed : null;
  } catch {
    revision = null;
  }

  const snapshot = (): SyncSnapshot => ({
    status,
    revision,
    lastSyncedAt,
    hasPendingChanges: pending !== null,
    conflictRemoteRevision,
    enabled,
  });

  const emit = () => {
    if (disposed) return;
    const value = snapshot();
    listeners.forEach((listener) => {
      try {
        listener(value);
      } catch {
        /* a broken listener must not break the engine */
      }
    });
  };

  const setStatus = (next: SyncStatus) => {
    if (status === next) return;
    status = next;
    emit();
  };

  const persistRevision = (value: number | null) => {
    try {
      if (value === null) return;
      storage?.setItem(REVISION_KEY, String(value));
    } catch {
      /* storage is best effort */
    }
  };

  const headers = (): Record<string, string> => ({
    Authorization: `Bearer ${options.token.trim()}`,
    'Content-Type': 'application/json',
  });

  const readJson = async (res: Response): Promise<Record<string, unknown>> => {
    try {
      const body = await res.json();
      return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  };

  const pullInternal = async (): Promise<{
    ok: boolean;
    revision?: number;
    workspace?: unknown;
    error?: string;
  }> => {
    if (!enabled || disposed) return { ok: false, error: 'disabled' };
    setStatus('syncing');
    try {
      const res = await fetchImpl(options.url, { method: 'GET', headers: headers() });
      if (res.status === 401 || res.status === 403) {
        setStatus('unauthorized');
        return { ok: false, error: 'unauthorized' };
      }
      if (!res.ok) {
        setStatus('offline');
        return { ok: false, error: `HTTP ${res.status}` };
      }
      const body = await readJson(res);
      const remoteRevision = Number(body.revision);
      const isNewer =
        !Number.isFinite(remoteRevision) || revision === null || remoteRevision > revision;
      lastSyncedAt =
        typeof body.updatedAt === 'string' ? body.updatedAt : new Date().toISOString();
      // A newer remote snapshot must not replace local edits that are still waiting
      // in the push queue. Treat it as a conflict and let the user decide.
      if (body.workspace && pending !== null && isNewer) {
        conflictRemoteRevision = Number.isFinite(remoteRevision) ? remoteRevision : null;
        hasPulled = true;
        setStatus('conflict');
        emit();
        return { ok: false, error: 'conflict' };
      }
      if (Number.isFinite(remoteRevision)) {
        revision = remoteRevision;
        persistRevision(remoteRevision);
      }
      if (body.workspace && isNewer) {
        lastSyncedHash = hashWorkspace(body.workspace);
        conflictRemoteRevision = null;
        options.onRemote?.(body.workspace, revision ?? 0);
      }
      hasPulled = true;
      setStatus('synced');
      emit();
      return { ok: true, revision: revision ?? undefined, workspace: body.workspace };
    } catch {
      setStatus('offline');
      return { ok: false, error: 'network' };
    }
  };

  const pull = async (): Promise<{
    ok: boolean;
    revision?: number;
    workspace?: unknown;
    error?: string;
  }> => {
    if (status === 'conflict' && pending !== null) {
      return { ok: false, error: 'conflict' };
    }
    return pullInternal();
  };

  const flushInternal = async (force: boolean): Promise<void> => {
    if (!enabled || disposed) return;
    if (status === 'unauthorized') return;
    if (pending === null) return;

    const payload = pending;
    const payloadHash = hashWorkspace(payload);
    if (!force && payloadHash === lastSyncedHash) {
      pending = null;
      emit();
      return;
    }

    const body: Record<string, unknown> = {
      workspace: payload,
      expectedRevision: revision ?? 0,
    };
    if (force) body.force = true;

    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      if (disposed) return;
      setStatus('syncing');
      try {
        const res = await fetchImpl(options.url, {
          method: 'PUT',
          headers: headers(),
          body: JSON.stringify(body),
        });

        if (res.status === 409) {
          const conflict = await readJson(res);
          const current = Number(conflict.currentRevision);
          conflictRemoteRevision = Number.isFinite(current) ? current : null;
          setStatus('conflict');
          return;
        }
        if (res.status === 401 || res.status === 403) {
          setStatus('unauthorized');
          return;
        }
        if (!res.ok) {
          if (attempt >= retryDelays.length) {
            setStatus('offline');
            return;
          }
          await sleep(retryDelays[attempt]);
          continue;
        }

        const saved = await readJson(res);
        const nextRevision = Number(saved.revision);
        if (Number.isFinite(nextRevision)) {
          revision = nextRevision;
          persistRevision(nextRevision);
        }
        lastSyncedAt =
          typeof saved.updatedAt === 'string' ? saved.updatedAt : new Date().toISOString();
        lastSyncedHash = payloadHash;
        conflictRemoteRevision = null;
        if (pending === payload) pending = null;
        setStatus('synced');
        emit();
        return;
      } catch {
        if (attempt >= retryDelays.length) {
          setStatus('offline');
          return;
        }
        await sleep(retryDelays[attempt]);
      }
    }
  };

  const schedulePush = (state: unknown) => {
    if (!enabled || disposed) return;
    pending = state;
    emit();
    if (status === 'conflict' || status === 'unauthorized') return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flushInternal(false);
    }, debounceMs);
  };

  return {
    pull,
    schedulePush,
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await flushInternal(false);
    },
    async resolveConflict(strategy) {
      if (!enabled || disposed) return;
      if (strategy === 'take-remote') {
        pending = null;
        conflictRemoteRevision = null;
        setStatus('idle');
        emit();
        await pullInternal();
        return;
      }
      await flushInternal(true);
    },
    setEnabled(next: boolean) {
      enabled = next && Boolean(options.token && options.token.trim());
      if (!enabled) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        setStatus('disabled');
        return;
      }
      setStatus('idle');
      if (pending !== null) void flushInternal(false);
    },
    getSnapshot: snapshot,
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      listeners.clear();
    },
  };
}
