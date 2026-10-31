# Task: implement Phase 1 (auto-sync + revision guard) for PrintOS

You are working in a React 19 + Vite + TypeScript (strict) repo at the current directory.
Read `docs/PLAN-SIDE-BY-SIDE.md` (Phase 1) first. Implement exactly Phase 1. Nothing else.

## Context you need

- The app keeps its whole workspace in one `PrintOSState` object held in React state in `src/App.tsx`.
- There is an existing manual bridge: `src/utils/hermesBridge.ts` with `loadBridgeConfig()` (localStorage keys `printos_bridge_url_v1`, `printos_bridge_token_v1`), `pushWorkspace`, `pullWorkspace`, `mergeWorkspace`.
- The serverless endpoint is `api/workspace.js`:
  - `GET` → `{ ok: true, revision: number, updatedAt: string, workspace }` (401 without bearer token).
  - `PUT` body `{ workspace }` → `{ ok: true, revision, updatedAt }`, overwrites the stored snapshot.
  - `POST` body `{ action, payload }` for add-task / add-content / add-publication / move-content-stage / log-stage.
- Parsing/migration: `migratePrintOSState(raw)` from `src/utils/contentStudio.ts` returns `{ status: 'ok' | ..., state, errorMessage }`.
- Tests run with `tsx --test` (`npm test`), lint is `tsc --noEmit` (`npm run lint`), build is `npm run build`.

## Deliverable 1 — server revision guard (`api/workspace.js`)

`PUT` must accept an optional `expectedRevision` (number) in the body.

- If `expectedRevision` is provided and does not equal the stored revision → respond `409` with
  `{ ok: false, error: 'REVISION_CONFLICT', currentRevision: <number>, updatedAt: <iso> }` and write nothing.
- If the store is empty and `expectedRevision` is provided and is not `0` → also 409 with `currentRevision: 0`.
- If `expectedRevision` is absent → behave exactly as today (backwards compatible).
- Keep the existing token auth and the 4 MB payload limit.

## Deliverable 2 — `src/utils/syncEngine.ts` (new, framework-free, testable)

Export a factory:

```ts
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'conflict' | 'unauthorized' | 'disabled';

export interface SyncEngineOptions {
  url: string;
  token: string;
  debounceMs?: number;      // default 2500
  fetchImpl?: typeof fetch; // injectable for tests
  now?: () => number;
}

export function createSyncEngine(options: SyncEngineOptions): {
  pull(): Promise<{ ok: boolean; revision?: number; workspace?: unknown; error?: string }>;
  schedulePush(state: unknown): void;
  flush(): Promise<void>;                 // forces an immediate push, used by tests/unload
  resolveConflict(strategy: 'take-remote' | 'keep-local'): Promise<void>;
  getStatus(): SyncStatus;
  getRevision(): number | null;
  getLastSyncedAt(): string | null;
  setEnabled(enabled: boolean): void;
  subscribe(listener: (s: { status: SyncStatus; revision: number | null; lastSyncedAt: string | null; hasPendingChanges: boolean }) => void): () => void;
  dispose(): void;
};
```

Behaviour requirements:

1. **Change detection**: do not push when the serialized state is identical to the last pushed/pulled snapshot. Hash with a cheap stable stringify — do not add dependencies.
2. **Debounce**: repeated `schedulePush` calls inside `debounceMs` produce exactly one PUT.
3. **Revision guard**: every PUT sends `expectedRevision` = last known revision (use `0` when none). On `409`, set status `conflict`, keep the pending state in memory, do NOT retry automatically.
4. **Conflict resolution**:
   - `take-remote`: fetch latest, return it to the caller via a `pendingRemote` accessor or the `onRemote` callback (add `onRemote?: (workspace: unknown, revision: number) => void` to options), reset revision, clear pending.
   - `keep-local`: PUT the pending state with `force: true` (add `force` to the PUT body: when true the server ignores `expectedRevision`) — update the server accordingly.
5. **Auth/network**: `401/403` → `unauthorized` and stop retrying until `setEnabled(true)` or a new pull. Network failure → `offline`, retry no more than 3 times with backoff (1s, 2s, 4s), then stay `offline` until the next `schedulePush`/`pull`.
6. **Disabled**: empty token or `setEnabled(false)` → status `disabled`, all methods no-op except getters.
7. **No unhandled rejections**: every public method resolves; never throws.
8. **Dispose** clears timers.

## Deliverable 3 — wire into `src/App.tsx`

- Create the engine once when a bridge token exists; store it in a ref.
- On mount: `pull()`. If the remote revision is newer than the local one, call `migratePrintOSState` on the remote payload and apply it via `setState` **without** triggering a push loop.
- On `visibilitychange` / `focus`: pull, throttled to at most once per 30 s.
- On state change: `schedulePush(state)`, but skip the push that would be caused by applying a remote snapshot (use a `applyingRemoteRef` flag).
- Conflict: the engine's status must reach the UI; do not silently overwrite. Keep local state intact until the user chooses.
- Keep the existing Hermes Bridge panel and Google Sheets save/fetch working unchanged.

## Deliverable 4 — `src/components/SyncStatusBar.tsx` (new)

Small header bar (Tailwind, same visual language as the app):

- Shows status dot + label: Synced / Syncing / Offline / Conflict / Disabled, plus `rev N` and last-synced time (relative or HH:mm).
- Toggle to enable/disable auto-sync (persisted in localStorage `printos_autosync_v1`, default enabled).
- When status is `conflict`: show two buttons, "Muat versi server" (take-remote) and "Timpa dengan versi lokal" (keep-local), plus text stating local changes are still in memory.
- No modal; it must never block the rest of the app.

## Deliverable 5 — tests (`src/utils/syncEngine.test.ts`)

Use `tsx --test` + `node:assert/strict`, fake `fetchImpl`, no network.

Cover at least:

1. debounce coalescing (3 schedulePush calls → 1 PUT),
2. push sends `expectedRevision` and updates revision on success,
3. 409 → status conflict, no retry, pending preserved,
4. `keep-local` re-sends with `force: true` and recovers,
5. `take-remote` returns server workspace via `onRemote` and clears pending,
6. 401 → unauthorized, no further PUT attempts,
7. network error → offline after retries, then successful retry on next schedulePush,
8. identical state is not pushed twice,
9. empty token → disabled and no fetch calls.

## Constraints

- No new npm dependencies.
- Do not change the `PrintOSState` schema, do not touch printing/inventory logic.
- Do not remove or weaken the manual Save/Fetch to Google Sheets.
- TypeScript strict: no `any` in exported signatures; no non-null assertions on possibly-undefined network results.
- Keep the UI copy in Indonesian, code comments in English.

## Definition of done

- `npm run lint` clean, `npm test` all passing (existing 34 + your new ones), `npm run build` succeeds.
- Do not commit, do not push, do not deploy.
- Final message: list files changed, the exact contract of the new PUT fields, what you did not implement, and any risk you noticed.
