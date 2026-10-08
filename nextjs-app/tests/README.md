# Tests

| Layer | Command | Needs | Where |
|---|---|---|---|
| Unit | `npm test` | nothing | `tests/unit/**` |
| Integration (RLS, storage) | `npm run test:integration` | Supabase keys in `.env.local`; creates and deletes real test users | `tests/integration/**` |
| End to end | `npm run test:e2e` (first time: `npx playwright install chromium`) | Public-page tests: nothing. Signed-in tests: `RUN_E2E_AUTH=1` and Supabase keys | `tests/e2e/**` |
| AI evaluation | `npm run eval -- --suite=E11,E3` | Foundry (or `FOUNDRY_MOCK=true` to check the plumbing) | `tests/eval/**` |
| Release gate | `npm run eval:gate -- --report=eval-reports/<run> --stage=beta` | an eval report | `tests/eval/gate.ts` |

## Critical cross-cutting tests (docs/specs/15 §2)

| ID | What it proves | Where |
|---|---|---|
| X1 | Another user cannot read or change any table or storage object | `tests/integration/rls.test.ts` |
| X2 | A child's sheet data never contains answers, skills or levels | `tests/unit/services/worksheets.service.test.ts` |
| X3 | An unverified worksheet does not exist for parents | same file |
| X4 | Unconfirmed answers change no levels | `tests/unit/calibration/engine.test.ts`, `tests/unit/eval/e11.test.ts` |
| X5 | One step per cycle; reading moves only on reading evidence | `tests/unit/calibration/engine.test.ts`, `tests/unit/eval/e11.test.ts` |
| X6 | The paywall decides from the subscription before any model call | `tests/unit/services/entitlements.service.test.ts` |
| X8 | (partly) banned wording never reaches parents | `tests/unit/copy/banned-words.test.ts` |
| X10 | Job idempotency | **not yet covered**: needs a database; see below |

Not yet covered: X7 (client bundle has no secrets: check with a `next build` plus a search of `.next/static`),
X9 (log redaction), X10 (replaying a job runner creates no duplicate rows), the photo-to-results end-to-end path,
and the load test. They need a running database and are listed in the hand-over notes.
