# 05 — Azure AI Foundry Integration

**Covers:** EDD §8.1–8.3, §8.9; PRD s6–s9; FR-14, FR-15. **Depends on:** 04. **Used by:** 06–10.

## 1. Resources to provision (one-time, manual)

| Resource | Setting |
|---|---|
| Foundry project | Region where a vision-capable GPT-4.1/4o-class model supports File Search and Code Interpreter together (verify in the v0.1 spike; EDD Appendix B #5) |
| Model deployments | `FOUNDRY_MODEL_DEPLOYMENT` (default) and `FOUNDRY_GRADER_DEPLOYMENT` (initially the same) |
| Vector store | `testready-kb`, id → `FOUNDRY_VECTOR_STORE_ID`; populated by `npm run kb:sync` |
| Agent | `testready-agent`, id → `FOUNDRY_AGENT_ID`; tools: `file_search` (bound to the vector store) + `code_interpreter`; instructions = `prompts/<version>/system.md` (created/updated by `npm run agent:sync`, **never edited in the portal**) |
| Identity | Service principal with the "Azure AI User" role on the project → `AZURE_TENANT_ID/CLIENT_ID/CLIENT_SECRET` |
| Data handling | Confirm in Azure that prompts/outputs are not used for training; record the setting in the privacy review |

## 2. Knowledge base (`kb/`)

| File | Content |
|---|---|
| `syllabus_grade1.md`, `syllabus_grade2.md` | Domain → skill id (`G1.NO.01` format) → prerequisites → levels M1–M4 with "can do" descriptors |
| `sample_questions.md` | 3–5 anchor questions per skill per level, with answers and reading band |
| `iready_interpretation.md` | Score ranges and placement meanings per grade and window; domain → skill mapping; **Lexile → R-band table**; fallback bands |
| `worksheet_template.md` | Letter/A4 layout spec (optional) |
| `skills_catalog.json` | Machine-readable skills extracted from the syllabus files by `npm run kb:build` (validated against the zod `skillCatalogSchema`); source for the `skills_catalog` table (spec 07 §3) |

Chunking: Markdown headings per skill so a File Search chunk is one skill-level. `kb_version` = first 12 chars of a SHA-256 over the sorted file contents, computed by `scripts/kb-version.ts` and stored with every diagnosis and worksheet. Content ownership/licensing must be settled before v0.1 exit (EDD Appendix B #2).

## 3. Prompt repository (`prompts/v1.0/`)

```
system.md        role, tone, guardrails, grounding rules (from TestReady-Foundry-Instructions.md + Agent-Instructions.md §1, §5, §6)
modes/parse.md   modes/diagnose.md   modes/generate.md   modes/grade.md   modes/explain.md
schemas/*.json   JSON Schema files generated from the zod schemas (npm run prompts:schemas)
fewshot/parse-*.json   fewshot/generate-*.json
VERSION          e.g. 1.0.0
```
Every model call sends `system.md` (as agent instructions) + the relevant `modes/*.md` as the first user content block + the JSON input contract (§4). `prompt_version` is persisted with each diagnosis/worksheet. Changing any prompt requires: version bump, eval run (spec 15) passing the release gate, PR review.

System-prompt rules that are *also* enforced in code (defence in depth): max 10 items; answers never on student output; only skill ids from the catalogue; no diagnosis/score prediction language; "still building" tone; scope Grades 1–2 math only; decline non-iReady/non-worksheet uploads politely with `status: 'rejected_input'`.

## 4. Call contract

```ts
// src/lib/foundry/types.ts
type Mode = 'parse' | 'diagnose' | 'generate' | 'grade' | 'explain';

interface FoundryRequest<M extends Mode> {
  mode: M;
  input: ModeInput[M];                // JSON, validated by zod before sending
  images?: { url: string; mime: 'image/png'|'image/jpeg'|'image/webp'|'image/gif'; label: string }[]; // signed read URLs or base64
  childProfile?: ChildProfile;        // spec 00 §7 — sent on every call that concerns a child
  deployment?: 'default' | 'grader';
  maxOutputTokens?: number;           // defaults per mode (§5)
  jobId: string;                      // for usage accounting and idempotency
}
interface FoundryResult<T> { data: T; raw: string; usage: { inputTokens: number; outputTokens: number; codeInterpreterSessions: number }; model: string; durationMs: number; toolEvents: ToolEvent[] }
```

`input` always includes the **input contract** from PRD s8: `{ grade, score_or_placement, report_images?, lexile?, child_nickname, child_profile, … mode-specific fields }`. The frontend enforces required fields; the agent only flags missing/contradictory values via `flags: string[]` in its output.

Images are passed as time-limited signed URLs (TTL 10 min) generated server-side or as base64 data if the SDK requires; only the four allowed MIME types are accepted by `assertAgentImage()`. Nothing else about the user (email, user id) is ever sent.

### Client wrapper (`src/lib/foundry/client.ts`)
1. `AIProjectClient` created lazily with `DefaultAzureCredential` (service principal from env). `import 'server-only'`.
2. `callAgent(request)`: create thread → add user message(s) → create run with `model` override per deployment, `temperature`, `max_completion_tokens` → poll run until `completed` (timeout `FOUNDRY_API_TIMEOUT_MS`) → read last assistant message → delete thread (finally).
3. Parse: extract the fenced JSON block labelled `json` (the response also carries the five-part human-readable structure: Summary, Key Data, Gaps/Results, Recommendations, Next Step — kept as `narrative`). Validate with the mode's zod schema.
4. **Invalid JSON/schema → one corrective retry** in the same thread with the user message `Return only the JSON that matches the schema. Errors: {zodIssues}`; second failure → throw `AppError('AI_INVALID_OUTPUT')`.
5. Transport retries: 429/5xx/network/timeout → up to 3 attempts, delays 1 s, 3 s, 8 s (± 20% jitter), honouring `Retry-After`. Content-filter blocks are **not** retried (`AI_INVALID_OUTPUT` with log).
6. Records usage via `usage.record({ event: 'foundry.' + mode, tokens, estCostUsd })` (spec 14).
7. `FOUNDRY_MOCK=true` swaps in `mock-client.ts` returning fixtures by `mode` and a fixture key in `input._fixture` — used in all automated tests.

## 5. Per-mode settings (PRD s6/s8)

| Mode | Deployment | Temp | Max output tokens | Tools | Retrieval query |
|---|---|---|---|---|---|
| `parse` | default | 0.1 | 1,500 | none (vision) | — |
| `diagnose` | default | 0.2 | 1,500 | file_search | grade + domains in report |
| `generate` | default | 0.6 (wording) | 4,000 | file_search + code_interpreter | skills in the axis plan |
| `grade` | grader | 0.1 | 2,500 | vision (+ code_interpreter optional) | — |
| `explain` | default | 0.3 | 600 | none | — |

Image count per call: parse ≤ 5; grade ≤ 4. Hard cap enforced in the client wrapper.

## 6. Output schemas (zod, `src/lib/foundry/schemas/`)

```ts
const fieldConf = z.number().min(0).max(1);

export const parseOutput = z.object({
  status: z.enum(['ok','rejected_input']),            // rejected_input = not an iReady Math report
  rejectReason: z.string().nullable(),
  window: z.enum(['BOY','MOY','EOY']).nullable(),
  overallScore: z.number().int().nullable(),
  placement: z.string().nullable(),
  domains: z.array(z.object({ domain: z.string(), placement: z.string().nullable(), score: z.number().nullable() })),
  confidence: z.object({ window: fieldConf, overallScore: fieldConf, placement: fieldConf, domains: fieldConf }),
  flags: z.array(z.string()),
});

export const diagnoseOutput = z.object({
  dataConfidence: z.enum(['high','medium','low']),
  summary: z.string().max(600),
  gaps: z.array(z.object({ domain: z.string(), skillId: skillId.nullable(), skillName: z.string().nullable(), evidence: z.string(), gapLevel: z.enum(['small','moderate','large']), priority: z.number().int().min(1), suggestedMathLevel: mathLevel, likely: z.boolean() })).max(12),
  strengths: z.array(z.object({ skillId, note: z.string() })).max(8),
  recommendations: z.array(z.string()).max(6),
  unmapped: z.array(z.string()),                       // things the agent could not map to a catalogue skill
  estimatedReadingBand: readingBand.nullable(),
  flags: z.array(z.string()),
});

export const generateOutput = z.object({
  items: z.array(z.object({
    position: z.number().int().min(1).max(10), skillId, domain: z.string(), mathLevel, readingBand,
    pairId: z.string().nullable(), isStretch: z.boolean(), isReadingProbe: z.boolean(),
    structure: z.string(), context: z.string(), numberSet: z.array(z.number()),
    questionText: z.string().max(600), answerType: z.enum(['integer','text','choice']),
    correctAnswer: z.string(), acceptedAnswers: z.array(z.string()), working: z.string(),
    verification: z.object({ expression: z.string().nullable(), expected: z.string(), passed: z.boolean(), method: z.enum(['code_interpreter','reasoned']) }),
    ambiguous: z.boolean(),
  })).min(1).max(10),
  flags: z.array(z.string()),
});

export const gradeOutput = z.object({
  sheetId: z.string().nullable(), sheetIdConfidence: fieldConf,
  qualityAssessment: z.enum(['good','poor','unreadable']),
  items: z.array(z.object({
    position: z.number().int().min(1).max(10), extractedAnswer: z.string().nullable(), extractionConfidence: fieldConf,
    boundingBox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number(), page: z.number().int() }).nullable(), // normalised 0-1
    status: itemStatus, errorType: errorType.nullable(), methodEvidence: z.string().max(300).nullable(), methodSound: z.boolean().nullable(),
  })),
  flags: z.array(z.string()),
});

export const explainOutput = z.object({ text: z.string().max(500) });
```
The `explain` input is the engine's structured change list (spec 10); the model writes plain-language wording only and must not add levels not in the input (checked by comparing numbers/levels mentioned against the input; failure → fall back to the template string).

## 7. Cost accounting
`estCostUsd = inputTokens/1e6 * FOUNDRY_PRICE_INPUT_PER_1M_USD + outputTokens/1e6 * FOUNDRY_PRICE_OUTPUT_PER_1M_USD + codeInterpreterSessions * FOUNDRY_CODE_INTERPRETER_SESSION_USD`. Logged per call in `usage_events`. Image tokens are included in the SDK's reported usage.

## 8. Edge cases

| Case | Behaviour |
|---|---|
| Agent returns prose around the JSON | Extractor takes the first fenced ```json block; none → corrective retry |
| Agent cites a `skillId` not in `skills_catalog` | Validation layer (specs 07/08) treats as unmapped/invalid; never trusted |
| Content filter / refusal on a child photo | Job fails `AI_INVALID_OUTPUT`; UI suggests retake or manual entry |
| Model deprecated/renamed | Only env deployment names change; eval suite must pass first |
| Thread cleanup fails | Logged and ignored; weekly script deletes threads older than 24 h |
| Tool outage (Code Interpreter unavailable) | `generate` fails retryably; no unverified items are produced |
| Parent uploads non-iReady/non-worksheet image | `status: 'rejected_input'` → UI message; no charge against cycle caps |

## 9. Acceptance criteria
1. With real credentials, each mode returns schema-valid output on fixtures.
2. Invalid-JSON fixture triggers exactly one corrective retry then succeeds; two failures raise `AI_INVALID_OUTPUT`.
3. 429 fixture retries with backoff and succeeds on attempt 3; permanent 500 fails after 3 attempts.
4. The browser bundle contains no Azure variables or SDK (check:secrets + bundle analyser).
5. `prompt_version`, `kb_version`, `model` are stored on every diagnosis and worksheet.
6. Only PNG/JPEG/WEBP/GIF reach the agent (HEIC attempt throws before the call).
7. Per-call usage rows exist with non-zero tokens and cost estimates.

## 10. Tests
Unit: JSON extractor, retry policy, cost calculator, schema parsing with golden fixtures. Integration: client against MSW-stubbed Foundry (success, invalid JSON, 429, 500, timeout). Smoke (manual/nightly, real Foundry): one call per mode.
