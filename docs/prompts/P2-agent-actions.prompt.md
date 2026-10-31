# Task: Phase 2 — typed agent actions for the PrintOS bridge

Repo: this working tree (React 19 + Vite + TS strict, ESM, `"type": "module"`).
Read `docs/PLAN-SIDE-BY-SIDE.md` → Phase 2. Implement only that.

## Why

Today Hermes can only replace the whole workspace (PUT) or use five ad-hoc POST actions.
Phase 2 adds small, typed, idempotent operations so an agent can add one research note or one
metric without touching any other collection.

## Deliverable 1 — `api/_actions.js` (new, ESM, no dependencies)

Export:

```js
export const AGENT_ACTIONS = ['add-research', 'update-research', 'update-metric'];
export function applyAgentAction(workspace, action, payload, now = new Date())
//   → { workspace, created, deduped }
//   throws Error with a human message on invalid input
```

Rules:

- **Idempotency.** `payload.requestId` (string, optional). Keep a capped ledger at
  `workspace.bridgeRequests` (array, newest first, max 200 entries shaped
  `{ requestId, action, resultId, at }`). If the same `requestId` was already applied:
  return `{ workspace (unchanged), created: <existing record or null>, deduped: true }`.
  Without `requestId`, always apply.
- **Never mutate other collections.** Only append/update inside the target array.

### `add-research`

Payload: `{ title, sourcePlatform, sourceAccount?, sourceUrl?, researchType, pillar, seriesId?, coreFinding, rawEvidence?: {commentQuotes?, metricsSnapshot?, screenshotRef?}, verificationMethod?, epistemicStatus?, confidenceLevel?, validityDays?, openQuestion?, decisionReason?, links?, requestId? }`

- Validate: `title` non-empty (≥4 chars), `coreFinding` ≥ 10 chars, `sourcePlatform` and
  `researchType` and `pillar` present.
- Build a complete `ContentResearchNote` (see `src/types/printos.ts`) with defaults:
  `decision: 'undecided'`, `testOutcome` omitted, `timesUsed: 0`, `validityDays: 60`,
  `capturedDate` = Jakarta date of `now`, `expiresAtDate` = capturedDate + validityDays,
  `linkedContentItemIds: []`, `links: []`, `rawEvidence` filled with empty strings,
  `updatedAt` = capturedDate. `id` = `rsr-<base36 timestamp>-<4 random chars>`.
- Push to `workspace.contentResearchNotes`.

### `update-research`

Payload: `{ researchId, decision?, decisionReason?, testOutcome?, testResultSummary?, timesUsed?, willUseAgain?, validityDays?, openQuestion?, requestId? }`

- Find by id — throw `Riset tidak ditemukan: <id>` when missing.
- Apply only the provided fields; when `validityDays` changes, recompute `expiresAtDate`
  from `capturedDate`. Always bump `updatedAt` to the Jakarta date of `now`.
- Validate `decision` against `undecided|test_as_content|postponed|rejected` and
  `testOutcome` against `in_testing|proven_winner|inconclusive|disproven`.

### `update-metric`

Payload: `{ contentItemId, publicationId, channel, window, views?, likes?, comments?, shares?, saves?, watchTimeSeconds?, completionRatePercent?, profileVisits?, productClicks?, qualitativeNotes?, requestId? }`

- Validate `window` is `24h` or `7d`, `channel` is one of the app's platform values.
- Numbers may be `null` (unknown) — do not coerce `null` to 0.
- Push a complete `MetricSnapshot` with `recordedAtJakarta` = `YYYY-MM-DD HH:mm` of `now`.

## Deliverable 2 — `api/_actions.d.ts`

Hand-written declarations for the three functions plus `AGENT_ACTIONS` and the result shape,
so TypeScript tests can import the JS module without `allowJs`.

## Deliverable 3 — wire into `api/workspace.js`

In the POST branch, before the `else` that returns 400, add:

```js
} else if (AGENT_ACTIONS.includes(action)) {
  const result = applyAgentAction(workspace, action, payload, new Date());
  created = { ...result.created, deduped: result.deduped };
}
```

Keep every existing action working. Add the three names to the 400 `allowed` list.

## Deliverable 4 — CLI (`tools/printos-hermes.mjs`)

Add three commands mirroring the existing style (`requireYes()`, `request('POST', ...)`):

- `add-research --title … --platform TikTok --type Audience --pillar personal --finding "…" [--account …] [--url …] [--series …] [--request-id …] --yes`
- `update-research --research-id … [--decision test_as_content] [--outcome in_testing] [--reason "…"] [--request-id …] --yes`
- `update-metric --content-id … --publication-id … --channel TikTok --window 24h [--views 1200] [--saves 30] [--request-id …] --yes`

## Deliverable 5 — tests (`src/utils/agentActions.test.ts`)

`tsx --test`, import `../../api/_actions.js`, build a minimal workspace object. Cover:

1. `add-research` creates a complete note (expiry = captured + validity, decision undecided) and leaves other arrays untouched.
2. the same `requestId` twice creates exactly one note and returns `deduped: true`.
3. `add-research` without `requestId` twice creates two notes.
4. `add-research` with a 3-character title or empty finding throws a readable error.
5. `update-research` changes only the provided fields and bumps `updatedAt`; unknown id throws.
6. `update-research` rejects an invalid `decision`.
7. `update-metric` keeps `null` as `null` (not 0) and records `recordedAtJakarta` in `YYYY-MM-DD HH:mm`.
8. the ledger is capped at 200 entries.

Add the new test file to the `test` script in `package.json`.

## Constraints

- No new dependencies. No schema changes to `src/types/printos.ts` (the fields already exist).
- Do not touch the sync engine, the Sheets code, or the printing/inventory logic.
- Do not commit, do not push, do not deploy, do not run `vercel`.
- `npm run lint`, `npm test`, `npm run build` must all pass.

Final message: files changed, the exact request/response contract, test counts, and anything you
deliberately left out.
