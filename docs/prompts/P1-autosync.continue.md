# Continue Phase 1 implementation (partial work already in this branch)

Read `docs/PLAN-SIDE-BY-SIDE.md` (Phase 1) and `docs/prompts/P1-autosync.prompt.md` (the full spec).
This branch already contains a partial Phase 1 implementation. Your job is to review it against the spec, finish what is missing, and verify the whole thing.

## What already exists (uncommitted, in the working tree)

- `src/utils/syncEngine.ts` — framework-free engine: debounce, `expectedRevision` push, 409 conflict, take-remote/keep-local, retries with backoff, status snapshot, subscribe/dispose.
- `src/utils/syncEngine.test.ts` — 10 tests covering the spec (all passing right now).
- `src/components/SyncStatusBar.tsx` — header status popover with toggle + conflict buttons.
- `src/hooks/useAutoSync.ts` — React hook: creates the engine from `loadBridgeConfig()`, pulls on mount, pushes on state change (suppressed while applying a remote snapshot), pulls on focus throttled to 30 s.
- `api/workspace.js` — `PUT` now accepts `expectedRevision` (409 `REVISION_CONFLICT` with `currentRevision`) and `force: true`.
- `package.json` — test script includes `src/utils/syncEngine.test.ts`.

## What is still missing (do this)

1. **Wire it into `src/App.tsx`.** The hook and the bar are not referenced yet.
   - Call `useAutoSync({ state, onRemote })` after the `state`/`setState` declarations.
   - In `onRemote`, parse with `migratePrintOSState(JSON.stringify(workspace), INITIAL_PRINTOS_STATE)` and only `setState` when `status === 'ok'`.
   - Render `<SyncStatusBar snapshot={...} onToggle={...} onTakeRemote={...} onKeepLocal={...} />` as the first child of the header's right-hand action group (`<div className="flex items-center gap-2 sm:gap-3 shrink-0">`), before the search input.
2. **Review the existing engine against the spec** and fix any gap you find, especially:
   - do not push while `applyingRemoteRef` is true (no echo loop),
   - `take-remote` must clear pending and adopt the server revision,
   - a 409 must never auto-retry.
3. **Add a test** that the hook/engine combination does not push a snapshot that came from the server (echo suppression can be tested at the engine level by asserting an equal payload after `pull()` is not re-sent).
4. Run `npm run lint`, `npm test`, `npm run build`. All must pass.

## Constraints

- No new dependencies. Do not change `PrintOSState` schema. Do not touch printing/inventory logic.
- Keep the manual Google Sheets Save/Fetch working exactly as it is.
- Do not commit, do not push, do not deploy, do not run `vercel`.
- If a test in the existing suite fails because of your change, fix the change, not the test.
- Final message: files changed, what you fixed versus what already worked, test results (paste the counts), and anything you deliberately left out.
