# TestReady_PRD_v2

# TestReady — Product Requirements Document

**Date:** October 6, 2026
**Author:** Product Team
**Status:** Draft
**Version:** 2.0 (extends v1.0 “First Iteration”: Problem + Solution Definition)
**Grades in Scope:** 1st and 2nd grade Math (i-Ready Math Diagnostic: BOY / MOY / EOY)
**Agent Platform:** Azure AI Foundry (Agent Service)

> **What changed from v1.0:** Sections 1–4 are retained and tightened. Sections 5–13 (Constraints, Technical Requirements, Grounding, Prompt Strategy, Hallucination Guardrails, Evaluation, Production Readiness, Pricing, Assumptions) are new. The Foundry agent design, input contract, two-axis calibration model and 3-screen frontend are folded in from the build work. Items that conflict with or extend v1.0 are listed in [Section 14](about:blank#14-changes-from-v10--open-decisions).
> 

---

## Table of Contents

1. [Problem](about:blank#1-problem)
2. [User](about:blank#2-user)
3. [Core Metrics, Prioritisation & Roadmap](about:blank#3-core-metrics-prioritisation--roadmap)
4. [MVP Features](about:blank#4-mvp-features)
5. [Constraints](about:blank#5-constraints)
6. [Technical Requirements](about:blank#6-technical-requirements)
7. [Grounding Strategy](about:blank#7-grounding-strategy)
8. [Prompt Strategy](about:blank#8-prompt-strategy)
9. [Hallucination Guardrails](about:blank#9-hallucination-guardrails)
10. [Evaluation Strategy](about:blank#10-evaluation-strategy)
11. [Production Readiness Criteria & Metrics (HHH)](about:blank#11-production-readiness-criteria--metrics-hhh)
12. [Pricing](about:blank#12-pricing)
13. [Assumptions](about:blank#13-assumptions)
14. [Changes from v1.0 & Open Decisions](about:blank#14-changes-from-v10--open-decisions)

---

## 1. Problem

### What problem is this solving?

Parents of 1st and 2nd graders receive an i-Ready Math diagnostic result from school: a scale score, a placement level, and a domain breakdown (Number & Operations, Algebra & Algebraic Thinking, Geometry, Measurement & Data). The report says where the child stands today. It does not tell the parent what to practise tonight.

With a score and no next step, parents do one of three things: nothing; buy a broad subscription (TestingMom, IXL) that treats their child like every other subscriber; or hunt for free worksheets on Pinterest or Teachers Pay Teachers that have no link to what the child actually got wrong.

**Job-to-be-done:** “Turn my child’s confusing test score into practice that fixes exactly what they got wrong, without another big subscription and without me becoming their curriculum designer.”

TestReady is a closed loop:

1. The parent enters the i-Ready result (report preferred, overall score or placement as the minimum).
2. TestReady translates it into concept gaps mapped to the Grade 1/2 syllabus.
3. It generates a printable worksheet of **fresh word problems**, each set to a specific **math difficulty** and a specific **reading difficulty**.
4. The child completes it on paper. The parent photographs it.
5. TestReady reads the handwriting, judges correctness, infers mastery, and **recalibrates math and reading independently**, session over session, for that child.

### Why is this problem worth solving?

**Quantified pain (figures from v1.0, sourced there; verify before external use):**

- i-Ready is used by 12M+ K–8 students in the US (Curriculum Associates, 2024). The diagnostic runs at least three times a year, so the “confusing score, no next step” moment recurs for millions of families every season.
- Independent score-explainer sites exist because reports “do not clearly explain what those numbers mean in simple language.” None of them turns the interpretation into practice.
- TestingMom (450,000+ questions, free tier capped at 100) and IXL sell broad catalogues that are the same for every subscriber and not anchored to a child’s diagnosed result.

**Market gap (competitive snapshot, supplied by the product team):**

|  | TestPrep-Online | Testing Mom | IXL | **TestReady** |
| --- | --- | --- | --- | --- |
| i-Ready specificity | Explicit i-Ready PrepPacks per grade | General skills, broad test prep | Skill alignment, not i-Ready packs | **Built from the child’s own i-Ready result** |
| Content | 340–520+ static questions, full-length practice tests | 450,000+ static questions, 30+ tests | Thousands of adaptive skills, videos, games | **Fresh word problems generated per child, per cycle** |
| Personalisation | By grade pack | None | Adaptive on-screen practice | **Gap-driven; reads handwritten paper work; two-axis recalibration** |
| Format | Screen | Screen | Screen | **Paper-first (print, write, photograph)** |
| Pricing | $59 (3 mo), $79 (6 mo), $149 family 1 yr | From ~$7 to $16/mo | $9.95 to $19.95/mo; ~+$4/mo per sibling | See [Section 12](about:blank#12-pricing) |

**MOAT:**

1. **Child-specific closed loop:** the system reacts to the child’s actual handwritten performance instead of serving from a static bank.
2. **Longitudinal mastery data:** per-child mastery on two independent axes accumulates across BOY → MOY → EOY. A first-touch competitor has no such history.
3. **Paper-first, no-screen-for-the-child format:** it removes a common objection (screen time) and fits how 6–8 year olds actually work.
4. **Transparent calibration:** every question is tagged with its skill and difficulty, and the parent can see why difficulty changed.

*Honest caveat (carried from v1.0):* the generation mechanic alone is not hard to copy. The moat becomes real only as mastery data and trust accumulate. It is treated as an assumption to be tested, not a proven claim.

### Why Agentic AI?

| Dimension | Detail |
| --- | --- |
| **What unstructured data is involved?** | (a) Generation side: open-ended word problems produced across two independent continuous axes (math level, reading/Lexile level) and several domains. (b) Input side: photos of a 6–8 year old’s handwriting (inconsistent digits, reversals like 5/S and 6/9, erasures, poor lighting, skewed angles), and i-Ready report PDFs/screenshots with tables and charts |
| **Why rule-based systems fail** | A static bank cannot produce fresh problems at a precise math-by-reading difficulty combination, and a bank can be memorised. Template or keyword matching cannot reliably read young children’s handwriting. Report layouts vary by district and year |
| **Why LLMs (with vision) are necessary** | A multimodal model can (1) write a word problem at a given skill and readability simultaneously, (2) read a photographed worksheet and judge correctness despite messy handwriting, (3) reason about what a pattern of right and wrong answers implies for a sub-skill, and (4) read an i-Ready report image |
| **Why not just ChatGPT?** | A chat assistant gives one-off output. It cannot leave the chat window and land on paper as a print-ready sheet, cannot hold persistent per-child structured state across weeks, cannot track two difficulty axes independently, and cannot verify answers programmatically. TestReady’s value is the **workflow and persistent state around the model calls**, not the model’s ability to write a word problem |
| **Why an agent (not a single prompt)?** | The task needs tools and decisions in sequence: retrieve syllabus context (File Search), compute and verify answers and build the PDF (Code Interpreter), read images (vision), and decide the next calibration. One-shot generation fails the “verify the answer key” and “adapt to this child” requirements |

---

## 2. User

### Who are you solving this problem for?

**Primary persona: The Parent of a 1st/2nd grader with an underwhelming i-Ready Math score**

- **Role:** Parent or guardian who is school-involved, not a teacher by profession
- **Behaviour:** Received the BOY/MOY/EOY report; may have used a score-explainer site; wants a concrete action, not more explanation
- **Pain:** The score explains what happened but not what to do. Existing subscriptions are broad and generic. Resistant to adding another monthly subscription
- **Tooling today:** Free, non-personalised worksheets (TPT/Pinterest), or a paid catalogue where only a small fraction is relevant
- **Device:** Phone (to photograph the sheet) and a home printer

**Secondary persona: Tutor / Homeschool instructor**

- **Role:** Manages 3–10 students across grades and skill levels
- **Behaviour:** Needs differentiated worksheets weekly, not tied to a single testing season
- **Pain:** Manual prep per student; generic packs do not differentiate by mastery
- **Scope:** P2 (multi-child management); not in MVP beyond the family sibling support described in Section 4

**Not the user:** the child. The child never logs in or sees a screen. All data entry and review is done by the adult.

---

## 3. Core Metrics, Prioritization & Roadmap

### How will you know the problem is solved? (Core Metrics)

**North Star Metric:** share of a child’s BOY-flagged weak domains that move up at least one i-Ready placement tier by the next diagnostic (MOY).

- **Baseline:** 0% (no comparable tool)
- **Target:** ≥ 50% of flagged domains improve ≥ 1 tier
- **Tracked via:** parent-entered MOY score at the start of the next cycle, compared against BOY flags. This is a real but imperfect proxy (self-reported, many other factors affect the child’s score)

**Primary Metrics:**

| Metric | Baseline | Target | How tracked |
| --- | --- | --- | --- |
| Grading agreement (system-proposed vs parent-confirmed) | 0% | > 90% | Compare system grade to parent confirm/override on every item |
| Question generation correctness and concepts covered | — | new questions (no repetition)| questions map to skill gap - across following categories -  Number and Operations,  Algebra and Algebraic Thinking,  Measurement and Data, Geometric & Spatial Reasoning | From questions generated and student improvement across across following categories -  Number and Operations,  Algebra and Algebraic Thinking,  Measurement and Data, Geometric & Spatial Reasoning |
| Answer-key correctness (worksheet generation) | — | 100% of keys verified by code before release | Code Interpreter recomputation logged per sheet |
| Full-loop completion (score entered → second worksheet generated) | — | > 60% of started cycles | Event tracking: score → print → upload → next sheet |
| Time from score entry to first printable worksheet | — | ≤ 90 seconds P95 | Server-side timing |

**Secondary Metrics:**

| Metric | Baseline | Target | How tracked |
| --- | --- | --- | --- |
| 30-day active-loop retention (in a testing window) | — | > 40% | Product analytics |
| Parent confidence (“I know what my child needs to work on”) | — | > 4 / 5 | Pre/post in-app survey |
| Cost per full cycle (generate + grade + recalibrate) | — | ≤ $0.25 (hard cap $0.50 from v1.0) | Foundry/Azure billing logs |
| Parent override rate on graded items | — | ≤ 10% | overrides / graded items |
| Reading-level fit (generated text within target band) | — | ≥ 90% of items | Automated readability check |
| Households saying they would not have paid for another subscription | — | > 50% | Quarterly survey |
| Paid conversion from free diagnostic | — | ≥ 8% | Funnel analytics |

### Prioritization

#### Breaking the Agentic Workflow into Components

1. **Component A — User Authentication & Session Management**** (Supabase Auth)
2. **Component B — iReady Report Upload & Report Parsing** (PDF,JPEG,GIF,PNG → page images; vision read of iReady report)(Supabase Storage + code interpreter + pdf-parse)
3. **Component C — Gap Diagnosis** (score/domains → syllabus skills)**via OpenAI**** (GPT-4o structured output)
4. **Component D — Worksheet Generation** (dual-axis word problems + answer key + PDF)
5. **Component E — Worksheet Grading** (vision read of handwritten sheet, correctness, error type)
6. **Component F — Mastery & Recalibration** (per-skill math level; reading level; trend)
7. **Component G — Dashboard & History** (per-domain trend, sheet history, Progress Record)
8. **Component H — Parent Review & Feedback** (confirm/override low-confidence items; rate sheet)

| Component | Input | Output | AI or not | Where it runs | Main tables / storage |
| --- | --- | --- | --- | --- | --- |
| **A: User Authentication & Session Management**** | Email, password; child nickname, grade | Session, `children` row | No AI | Supabase Auth + frontend | `children` (user_id, nickname, grade) |
| **B: Report Upload & Parsing** | Report as PDF, JPEG, GIF or PNG; or typed score/placement | Parsed JSON (score, placement, domain results, window) with per-field confidence | Vision | Browser converts PDF pages to PNG with pdf.js; images go to Storage; Edge Function sends them to the agent | `uploads` bucket; `reports` |
| **C: Gap Diagnosis** (score/domains → syllabus skills) | Confirmed scores, grade, knowledge base | Gap table (skill, evidence, priority), strengths, data-confidence label | Yes | Foundry agent + File Search | `diagnoses` |
| **D: Worksheet Generation** (dual-axis —> math score + lexile score —> word problems + answer key + PDF) | Gap plan, Child Profile, reading band, question history | Student Sheet PDF + Parent Answer Key; every answer verified by code | Yes | Foundry agent + File Search + Code Interpreter; PDFs saved to Storage | `worksheets` bucket; `worksheets`, `worksheet_items`, `question_history` |
| **E: Worksheet Grading** (vision read of handwritten sheet, correctness, error type) | Photo of completed sheet, Sheet ID, stored answer key | Per-item extracted answer, correct/partial/incorrect/blank, error type, extraction confidence | Vision | Foundry agent (vision); Edge Function loads the key | `graded_items` |
| **F: Mastery & Recalibration** (per-skill math level; reading level; trend) | Confirmed item results, Child Profile | New skill levels, reading band, trend, plain-language reason | Rules in code, with model-written rationale | Edge Function (TypeScript); no model call for the level math | `skill_mastery`, `cycles` |
| **G: Dashboard & History** (per-domain trend, sheet history, Progress Record) | `child_id` | Per-domain trend, sheet history, progress summary | No AI | Frontend + Supabase queries | Reads `cycles`, `skill_mastery`, `worksheets` |
| **H: Parent Review & Feedback** (confirm/override low-confidence items; rate sheet) | Flagged items, parent corrections, rating | Corrected items released to Component F; rating stored | No AI | Frontend + Supabase writes | `graded_items` (override fields), `feedback` |

#### Risk Assessment per Component

| Component | Check | Result | Explanation |
| --- | --- | --- | --- |
| B — Report Parsing | Is ML necessary? | PASS | Report layouts vary by district and year; tables and charts are best read visually |
| B — Report Parsing | Do we have data? | PARTIAL | Need 15+ real redacted iReady reports (BOY/MOY/EOY, Grade 1 and 2) for test and few-shot |
| B — Report Parsing | Accuracy | PARTIAL | Misread scores would mis-target everything. Mitigation: parent confirms parsed values on screen before generation |
| B — Report Parsing | Bias | PASS | Low risk; structured numeric data |
| D — Worksheet Generation | Is ML necessary? | PASS | Fresh problems at two continuous difficulty settings cannot be pre-authored |
| D — Worksheet Generation | Data to train | PASS | No training needed; knowledge base + few-shot sample questions |
| D — Worksheet Generation | Accuracy | PARTIAL | LLMs make arithmetic and “one-correct-answer” errors. Mitigation: Code Interpreter recomputes every answer; unverifiable items are dropped |
| D — Worksheet Generation | Transparency | PASS | Skill, math level and reading level tagged per item (visible in parent answer key) |
| D — Worksheet Generation | Bias / appropriateness | PARTIAL | Contexts and names must be age-appropriate and culturally neutral |
| E — Worksheet Grading | Is ML necessary? | PASS | Handwriting recognition on young children’s writing needs vision |
| E — Worksheet Grading | Accuracy | PARTIAL | Digit reversals and erasures cause misreads. Mitigation: per-item confidence; low confidence routed to parent before it affects mastery |
| E — Worksheet Grading | Bias | PARTIAL | Handwriting style varies by child; evaluate across a range of writers |
| E — Worksheet Grading | Laws / privacy | PARTIAL | Photos may show the child’s name; see Responsible AI. Child data handling (COPPA/FERPA-adjacent) needs legal review |
| F — Recalibration | Is ML necessary? | PARTIAL | Update rules are deterministic and live in app code; the LLM only proposes error classification and rationale |
| F — Recalibration | Can it be judged? | PASS | Parent override and next-cycle performance provide direct signal |

#### Overall Risk Summary

| Component | Risk Level | Mitigation |
| --- | --- | --- |
| A — Intake & Profile | Low | Form validation; required fields enforced by the frontend, not the prompt |
| B — Report Parsing | Medium | Show parsed values for parent confirmation; convert PDF to images first; fall back to manual entry |
| C — Gap Diagnosis | Medium | Grounded in knowledge base; “likely” labels when only overall score available |
| D — Worksheet Generation | Medium-High | Code-verified answer keys; duplicate check against question history; readability check; parent can regenerate |
| E — Worksheet Grading | Medium-High | Per-item confidence; review queue; never update mastery on unconfirmed items |
| F — Recalibration | Medium | Deterministic rules with one-step-per-cycle limit; require repeated evidence before changing level |
| G — Dashboard & History | Low | Simple queries; no AI |
| H — Parent Review & Feedback | Low | Form-to-database write |

#### Prioritised Stories (MVP Scope)

| Story ID | Title | Priority | Points | Status |
| --- | --- | --- | --- | --- |
| US-001 | Enter iReady result + grade (form, report upload, or placement) | P0 | 5 | To Do |
| US-008 | Confirm parsed report values before generation | P0 | 3 | To Do |
| US-009 | Gap analysis mapped to syllabus skills | P0 | 5 | To Do |
| US-002 | Print-ready worksheet (10 questions max, A4/Letter) + separate answer key | P0 | 8 | To Do |
| US-003 | Photograph/upload completed sheet and get it graded | P0 | 8 | To Do |
| US-004 | Confirm or correct low-confidence answers | P0 | 4 | To Do |
| US-005 | Next worksheet recalibrated on two independent axes | P1 | 8 | To Do |
| US-006 | Progress dashboard (per-domain trend, why difficulty moved) | P1 | 5 | To Do |
| US-010 | Child profiles for siblings (up to 3 on Family plan) | P1 | 3 | To Do |
| US-011 | “Too hard / too easy” manual override | P1 | 2 | To Do |
| US-012 | Free diagnostic + paywall at second worksheet | P1 | 4 | To Do |
| US-007 | Tutor account with up to 10 children | P2 | 5 | Backlog |
| US-013 | Season reminders before MOY/EOY test windows | P2 | 2 | Backlog |

### Roadmap

| Release | Features Included | Duration |
| --- | --- | --- |
| **v0.1 — Foundation** | Foundry project, model deployment, vector store with syllabus/sample questions/iReady guide; single agent with instructions; playground tests; knowledge base content review | Weeks 1–2 |
| **v0.2 — Diagnose + Generate** | Frontend screen 1 (intake) and screen 2 (gaps + worksheet); PDF-to-image conversion; report parsing with parent confirmation; gap analysis; worksheet + answer key with Code Interpreter verification; print-ready PDF | Weeks 3–5 |
| **v0.3 — Grade + Recalibrate** | Frontend screen 3 (upload + results); handwriting extraction with per-item confidence; review queue; error classification; math and reading axis recalibration; Progress Record stored per child | Weeks 6–8 |
| **v0.4 — Quality & Safety** | Question-history dedupe; readability check; evaluation suite on labelled worksheets; photo-quality pre-checks; privacy review (name-field masking); error states and retries | Weeks 9–10 |
| **v1.0 — Launch** | Auth and payments; free diagnostic + subscription; dashboard trend; “not an official assessment” disclosures; accessibility review; cost alerts; legal review of terms and child-data policy | Weeks 11–13 |
| **v1.1 — Iteration** | Split into connected agents (diagnostic / worksheet / grader) if eval shows benefit; grader on a stronger model; seasonal reminders; sibling profiles polish | Weeks 14–17 |
| **v1.2 — Growth** | Tutor account (up to 10 children); Kindergarten and Grade 3 syllabus; Spanish-language worksheets; MOY/EOY comparison reports | Weeks 18–24 |

**Dependencies:**

- Azure subscription with Foundry Agent Service and a vision-capable model deployment approved in the chosen region
- Licensed or authored Grade 1/2 syllabus and sample question content (the knowledge base); legal check that content is original or licensed
- At least 15 redacted iReady reports and 30 completed worksheets for evaluation
- Legal review of terms, privacy policy and child-data handling before public launch

**External Dependencies:**

| Dependency | Risk | Mitigation |
| --- | --- | --- |
| Azure AI Foundry / model availability | Outage or quota limits block generation and grading | Retry with backoff (3 attempts); clear “try again” message; keep the last worksheet downloadable |
| Model pricing and deprecation | Cost increase or model retirement | Monitor monthly; keep the model name in config; re-run eval before any model swap |
| Foundry tool behaviour (Code Interpreter, File Search, file types) | Playground accepts images only for chat attachments; PDFs need file-tool route or conversion | Convert report PDFs to page images in the backend; add a test for every accepted file type |
| Printer / paper variance | Layout breaks on A4 vs Letter, ink-heavy sheets | Black-and-white layout; test both paper sizes |
| Phone camera quality | Blurry, skewed or dim photos reduce grading accuracy | In-app capture guidance; photo quality check before submission; allow retake |
| Curriculum Associates changes report formats | Parsing breaks | Manual entry fallback; parsing evaluation on each new report format |

**Internal Risks:**

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Wrong answer key ships | Medium | High | Code-verified keys; reject unverifiable items; parent can flag an item as wrong and it is excluded from calibration |
| Handwriting misread lowers a child’s recorded mastery | Medium | High | Per-item confidence; unconfirmed items never update mastery; parent review UI |
| Reading axis blamed for math errors (and vice versa) | Medium | Medium | Paired diagnostic items; reading axis updated only on reading-attributable evidence |
| Parent coaches the child or reads aloud during the sheet, skewing data | High | Medium | Ask parent to tick “read aloud?” per sheet; exclude those items from the reading axis |
| Cost per cycle drifts above target (retries, long outputs) | Medium | Medium | Token caps; cost alert at 80% of budget; cap regenerations per sheet |
| Child data privacy concern or incident | Low | Critical | Data minimisation (nickname only); name-field masking; deletion on request; privacy review before launch |
| Over-claiming (“fixes your child’s score”) | Medium | High | Copy review; never predict iReady scores; “practice support, not an official assessment” |

---

## 4. MVP Features

### User Flows

The frontend is **three screens**. All AI work happens behind them in the Foundry agent.

#### Flow 1 — Screen 1: Set Up Child & Enter Results

```
Open app → Add child (nickname, grade) → Enter iReady Math result
→ Upload report (optional) or enter score/placement → Optional Lexile
→ Confirm parsed values → Continue
```

1. Parent chooses **Grade 1 or Grade 2** and gives a first name or nickname only.
2. Parent provides **one of**: iReady Math report (PDF or image, preferred), overall scale score, or placement (for example “Mid Grade 1” or “One Grade Level Below”). At least one is required.
3. Optional: **Lexile score** from the iReady Reading report.
4. If a report is uploaded, the backend converts PDF pages to images and the agent reads them. The screen shows the **parsed values** (overall score, placement, domain results, window) for the parent to confirm or correct before continuing.
5. Free diagnostic: the first run is free, no payment details.

#### Flow 2 — Screen 2: Gap Analysis & Worksheet

```
Gap summary → Choose focus (default recommended) → Generate worksheet
→ Preview → Download Student Sheet (PDF) + Parent Answer Key (PDF)
```

1. **Gap analysis** shows: Summary; Key Data (scores, window, data confidence); Concept Gaps table (domain, skill, evidence, priority); Strengths; Recommendations.
2. Parent clicks **Generate worksheet**. A progress indicator shows steps: reading profile → choosing skills → writing problems → verifying answers → building PDF.
3. **Student Sheet:** maximum **10 word problems per sheet**, each in a numbered box with an answer line and a large “Show your work” space; Sheet ID, child nickname, date, cycle number; no answers. Layout is black-and-white friendly, 14pt+ text. Paper size A4 or US Letter (see Section 14).
4. **Parent Answer Key:** answers, worked solutions, skill, math level, reading level per question, and tips to tell a reading error from a math error.
5. Parent can regenerate once per cycle, or mark “too hard / too easy”.

#### Flow 3 — Screen 3: Upload, Results & Progress

```
Child completes on paper → Parent photographs sheet → Upload → Grading
→ Review flagged answers → Results + mastery by skill → Next worksheet
```

1. Parent photographs the completed sheet (guidance shown: flat, well-lit, whole page). The app checks image quality and asks for a retake if poor.
2. The grader matches the **Sheet ID**, reads each handwritten answer and work, and returns per-item results: correct / partial / incorrect / blank, an extraction confidence, and an error type (calculation slip, concept gap, reading difficulty, unclear).
3. **Review queue:** any answer with low extraction confidence is shown cropped beside the extracted value (“Is this 12 or 17?”). The parent confirms or corrects in one tap. Unconfirmed items do **not** update mastery.
4. **Results** show Summary, Item Results, Mastery by Skill (Secure / Developing / Not yet / Not enough evidence), a Reading-vs-Math read-out, and Recommendations.
5. **Calibration update** is shown in plain language (for example “missed 3 of 4 regrouping problems, so the next sheet adds scaffolded regrouping at an easier reading level”).
6. **Progress** tab shows per-domain trend across cycles. Parent clicks **Next worksheet** to start the next cycle.

### Functional Requirements

**User Stories:**

| ID | User Story | Acceptance Criteria | Priority |
| --- | --- | --- | --- |
| US-001 | As a parent, I want to enter my child’s iReady Math result and grade so the system targets their actual gaps | Form requires grade plus one of report / score / placement; Lexile optional; invalid or contradictory input (for example a placement for the wrong grade) is rejected with a clear message | P0 |
| US-008 | As a parent, I want to confirm the values the system read from the report so a misread score doesn’t mis-target practice | Parsed values shown before generation; every field editable; generation blocked until confirmed | P0 |
| US-009 | As a parent, I want to see which concepts my child is struggling with so I know what to practise | Gap table maps each gap to a named syllabus skill; data confidence shown; “likely” shown when only an overall score is available | P0 |
| US-002 | As a parent, I want a print-ready worksheet so my child can complete it on paper | ≤ 10 questions per sheet; “Show your work” space per question; Sheet ID printed; no answers on student copy; separate answer key; ≥ 3 domains when the gap plan has ≥ 3 | P0 |
| US-003 | As a parent, I want to photograph the completed sheet and have it graded so I don’t check each answer | Accepts JPEG/PNG/HEIC; grading returns within 60 seconds P95; each item shows extracted answer and status | P0 |
| US-004 | As a parent, I want to confirm answers the system is unsure about so my child’s data stays accurate | Items below the confidence threshold are queued; one-tap confirm or edit; mastery updates only after confirmation | P0 |
| US-005 | As a parent, I want the next worksheet to adapt to what my child got wrong, at the right reading level | Math level and reading level update independently; ≤ 1 level step per skill per cycle; skills missed twice are prioritised | P1 |
| US-006 | As a parent, I want to see progress over weeks | Dashboard shows per-domain trend using i-Ready domain names and plain-language reasons for each change | P1 |
| US-010 | As a parent with more than one child, I want a profile per child | Up to 3 child profiles on Family plan; separate mastery, history and question history per child | P1 |
| US-011 | As a parent, I want to say a sheet was too hard or too easy | Override adjusts next-cycle targets and is logged separately from graded evidence | P1 |
| US-012 | As a new user, I want to try one diagnostic free | First gap analysis and first worksheet are free; paywall appears before the second worksheet cycle | P1 |
| US-007 | As a tutor, I want to manage up to 10 children | Multi-child dashboard; batch generation | P2 |
| US-013 | As a parent, I want a reminder before the next test window | Optional email before typical MOY/EOY windows | P2 |

**Functional Requirements Table:**

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| FR-01 | Intake accepts grade (1st or 2nd), and one of: iReady report (image or PDF), overall scale score, or placement; optional Lexile; child nickname only | P0 | Required fields are enforced by the frontend. The agent receives structured JSON and only flags missing or contradictory values |
| FR-02 | PDF reports must be converted to page images before reaching the model; chat-style image upload accepts PNG/JPG/JPEG/WEBP/GIF only | P0 | Foundry playground chat attachments accept images only; the backend performs PDF → PNG |
| FR-03 | Parsed report values must be shown to the parent and confirmed before generation | P0 | Prevents a misread score from driving the plan |
| FR-04 | Every gap, question and recommendation must map to a named syllabus skill from the knowledge base | P0 | If a skill cannot be mapped, the agent says so rather than inventing a standard |
| FR-05 | Each worksheet has ≤ 10 questions, covers ≥ 3 domains where the gap plan allows, includes ≥ 2 diagnostic pairs (same skill, different reading load), and allows 1–2 review or stretch items | P0 | 60–70% gap items, 20–30% near-mastery items for confidence |
| FR-06 | Math level and reading level are set independently per item; never raise both for the same skill in the same cycle | P0 | Keeps errors attributable |
| FR-07 | Every answer in the key must be recomputed by code (Code Interpreter) and each question must have one defensible answer; unverifiable items are replaced | P0 | LLM mental arithmetic is not trusted |
| FR-08 | The Question History per child is checked so no question, number set or context-plus-structure combination repeats within the last 4 cycles | P0 | Freshness; prevents memorising |
| FR-09 | Student Sheet and Parent Answer Key are separate files; student sheet carries a Sheet ID and no answers | P0 | Sheet ID links an upload to its answer key and metadata |
| FR-10 | Grader extracts each handwritten answer with an extraction confidence; items below threshold go to the parent review queue and are excluded from mastery updates until confirmed | P0 | Core hallucination safeguard |
| FR-11 | Grader classifies each wrong answer as calculation slip, concept gap, reading difficulty, attention/copying, or unclear | P1 | Uses answer-key metadata and diagnostic pairs |
| FR-12 | Mastery labels per skill: Secure (≥ 2 correct with sound method), Developing, Not yet (≥ 2 incorrect with consistent pattern), Not enough evidence | P0 | One item is never enough |
| FR-13 | Math level moves ≤ 1 step per skill per cycle and only after repeated evidence; reading level moves only on reading-attributable evidence | P1 | Deterministic rules in app code; LLM supplies classification and rationale |
| FR-14 | Child Profile (grade, baseline, reading band, skill levels, cycle history, question history) is stored by the app and sent with every agent call; the agent returns an updated record in a fixed block | P0 | Replaces the paste-back Progress Record used in playground testing |
| FR-15 | Agent responses use a fixed structure: Summary, Key Data, Gaps/Results, Recommendations, Next Step; machine-readable JSON for UI rendering | P0 | Frontend renders each part |
| FR-16 | Parent can mark “read aloud” per sheet; read-aloud items are excluded from the reading axis | P1 | Keeps reading calibration honest |
| FR-17 | Parent can delete a child profile and all associated data at any time | P0 | Privacy requirement |
| FR-18 | If no Lexile is provided, the reading level is a conservative grade-based estimate labelled “estimated” and calibrated from the first sheet | P0 | Never present an estimate as a measured value |
| FR-19 | Every results page carries: “Practice support, not an official assessment. Ask your child’s teacher for the full picture.” | P0 | Disclosure |
| FR-20 | Cost guard: max tokens per call, max 1 regeneration per sheet by default, per-user daily cycle cap | P1 | Protects margin |

### Agent Capabilities & System Behaviour

| Component | Input | Output | Autonomy Level | Human-in-Loop Trigger |
| --- | --- | --- | --- | --- |
| Report Parser (vision) | iReady report page images | Parsed JSON: overall score, placement, domain results, window (BOY/MOY/EOY) with per-field confidence | Autonomous + review | Parent always confirms parsed values before generation |
| Gap Diagnostician | Confirmed scores, grade, knowledge base | Concept gap table (skill, evidence, priority), strengths, data-confidence rating | Fully autonomous | If data confidence is Low, gaps labelled “likely” |
| Worksheet Generator | Gap plan, grade, reading band, Child Profile, question history | Student Sheet PDF + Parent Answer Key (verified by code) | Fully autonomous | Parent may regenerate or flag “too hard / too easy” |
| Grader (vision) | Photo of completed sheet, Sheet ID, Answer Key metadata | Per-item extracted answer, correctness, error type, extraction confidence | Autonomous + review | Any item below confidence threshold goes to parent before it affects mastery |
| Mastery & Recalibration | Confirmed item results, Child Profile | Skill status, proposed math and reading level changes with reasons, updated Child Profile | Rules in code, rationale from model | Parent can manually override a skill’s level |
| Progress Reporter | Cycle history | Per-domain trend and plain-language explanation | Fully autonomous | — |

---

## 5. Constraints

**Performance constraints:**

- Report parsing and gap analysis: ≤ 30 seconds P95.
- Worksheet generation (including code verification and PDF build): ≤ 90 seconds P95.
- Grading of a 10-question sheet: ≤ 60 seconds P95 (excluding parent review time).
- Upload photo size limit 10 MB; report upload up to 5 pages.

**Content & scope constraints:**

- **Grades 1 and 2 Math only** at MVP. Other grades and subjects are politely declined.
- English-language word problems at MVP.
- Maximum **10 questions per sheet** (A4 or US Letter), one sheet per cycle.
- Content must stay inside the supplied Grade 1/2 syllabus; at most 1–2 deliberate review or stretch items per sheet at an adjacent level.
- Reading difficulty is controlled with readability constraints (sentence count and length, vocabulary, decodability) per band; Lexile mapping comes from the knowledge base.

**Cost constraints:**

- Cost per full cycle (generate + grade + recalibrate) target ≤ $0.25; hard cap $0.50 (from v1.0).
- Free diagnostic limited to one gap analysis and one worksheet per household to cap acquisition cost.

**Scalability constraints:**

- 100 concurrent cycles in beta without degradation; design to scale to 1,000 concurrent users post-launch.
- Foundry model quota and rate limits must be sized for **seasonal spikes** (the weeks after BOY, MOY and EOY reports arrive).

**Reliability & security constraints:**

- 99.5% uptime for the web app. Model errors are caught and shown in plain language with a retry option; no silent failures.
- Data encrypted at rest and in transit. Per-user data isolation enforced in the data layer.
- API keys and Foundry credentials are held only in the backend, never in the browser.

**Usability & compliance constraints:**

- Parents are the only users who log in. The child never signs in or sees a screen.
- Plain language throughout; jargon explained at first use. WCAG 2.1 AA.
- Data minimisation: first name or nickname only. No surname, school, birthdate, location or photos of the child. The upload guidance tells parents to cover or crop the name field on worksheets and reports where possible.
- Retention: uploaded images deleted after processing (default 30 days, parent can delete any time); structured mastery data kept until the parent deletes the profile.
- Compliance: COPPA/FERPA-adjacent and GDPR/UK Children’s Code considerations apply to child-related data. Legal review is required before public launch. No parent or child data is used to train models.

---

## 6. Technical Requirements

### Architecture Overview

A thin web app calls the Foundry agent. Required fields and structured state live in the app; judgement, generation and vision live in the agent.

**Component layers:**

- **Frontend (React SPA, 3 screens):** intake and confirmation; gap analysis and worksheet; upload, review and progress. Renders structured agent output; does not talk to the model directly.
- **Backend API (Azure Functions or Node.js):** validates inputs, converts PDF reports to page images, calls the Foundry Agent Service, stores results, assembles the Child Profile payload, enforces cost guards.
- **Azure AI Foundry Agent Service:** the agent runs with a vision-capable model, **File Search** (vector store of syllabus, sample questions, iReady guide) and **Code Interpreter** (answer verification, readability checks, PDF generation).
- **Data store:** child profiles, cycles, question history, graded items, feedback, with per-user isolation. Blob storage for generated PDFs and uploaded images (time-limited access links).
- **Auth:** email/password or an identity provider; adult accounts only.
- **Payments:** a hosted checkout provider; no card data touches the app.

**Agent design (MVP → later):**

| Stage | Design | Why |
| --- | --- | --- |
| MVP | **One agent** with the instruction set (Section 8), File Search and Code Interpreter | Matches the baseline pattern; fastest to test and iterate |
| v1.1 (if eval shows benefit) | **Orchestrator + 3 connected agents**: `diagnostic`, `worksheet`, `grader` | Separates concerns; lets the grader use a stronger model; keeps the answer key out of the grader’s generation context; independent evaluation per agent |

Connected agents are called through the orchestrator; specialists do not call each other. The Child Profile / Progress Record is passed through the orchestrator.

### Model Requirements

| Criteria | Requirement | Rationale |
| --- | --- | --- |
| Model | Vision-capable GPT-4.1 / GPT-4o class deployment in Foundry as the default; evaluate a stronger or reasoning model for the grader | Vision is required for handwriting and reports; must support File Search and Code Interpreter in Agent Service. Confirm against your region’s catalogue |
| Image input | PNG, JPG, JPEG, WEBP, GIF as chat image input; PDFs converted to images in the backend | Foundry playground/chat image input accepts these types only |
| Response format | Structured JSON for each mode plus the five-part summary | Frontend renders sections; schema validated before storing |
| Temperature | Low (0.1–0.2) for parsing, grading and answer keys; 0.5–0.7 for problem wording variety | Determinism where it matters; variety for freshness |
| Max tokens per call | Parsing ≤ 1,500 output; worksheet ≤ 4,000; grading ≤ 2,500 | Cost control |
| Latency | See Section 5 | — |
| Cost per full cycle | Target ≤ $0.25 | See Section 12 unit economics |

### Model Selection & Cost Trade-offs

| Item | What we use | Why | Trade-off |
| --- | --- | --- | --- |
| LLM | GPT-4.1 / GPT-4o class (vision) via Foundry | Vision + tools + low cost per cycle | Handwriting and arithmetic still need safeguards; model deprecation risk |
| Grader upgrade path | Stronger or reasoning model for grading only (v1.1) | Higher accuracy where errors hurt most | Higher cost per cycle; mitigate with confidence gating and per-agent models |
| Arithmetic verification | Code Interpreter | Deterministic answer keys | Adds tool time and session cost |
| Knowledge retrieval | File Search over a vector store | Keeps content grounded in the syllabus and samples | Retrieval quality depends on file chunking and naming |
| PDF generation | Code Interpreter output (PDF/DOCX) or backend renderer | Single place for layout rules | Layout fidelity on A4 vs Letter needs testing; a backend renderer may be more reliable |
| PDF report handling | Backend PDF → PNG conversion | Avoids the image-only upload limit | Extra backend step and storage |
| State | App-side Child Profile sent every call | Reliable, auditable, no parent copy-paste | Payload size grows with history; summarise old cycles |
| Hosting | Static web hosting + serverless functions | Low ops overhead; scales with seasonal spikes | Cold-start latency acceptable within latency budget |

---

## 7. Grounding Strategy

TestReady’s trust guarantee: **content comes from the knowledge base and the child’s actual data, not from the model’s general memory of “what second graders learn.”**

- **Knowledge base as source of truth:** the Grade 1/2 math syllabus (domains, skills, prerequisite order, difficulty levels), sample questions (style and difficulty anchors), and the iReady interpretation guide (score and placement meaning, BOY/MOY/EOY, domain results). The agent must not invent standards, skill names or score cut-offs.
- **Every output is tagged:** each gap, question and recommendation carries a syllabus skill ID. If a skill cannot be mapped, the agent says so.
- **Missing knowledge is declared:** if a score-to-grade cut-off or Lexile mapping is absent from the knowledge base, the agent gives a labelled estimate and asks the parent to confirm against their report.
- **Child data as grounding:** the Child Profile (baseline, skill levels, reading band, question history) is passed in on every call. The agent treats a missing profile as a new child and never fabricates history.
- **Answer keys grounded in computation:** answers are recomputed by code, not trusted from the generating pass.
- **Grading grounded in the Sheet ID and Answer Key:** the grader compares the child’s handwriting against the stored key and metadata for that exact sheet. Without a Sheet ID match it can score answers but cannot attribute errors by skill and says so.
- **Reading difficulty grounded in bands:** reading-band constraints and the Lexile-to-band table come from the knowledge base. Without a Lexile, the band is marked “estimated”.
- **Full-context approach:** knowledge files are small enough to be retrieved by File Search per call; the full Child Profile (summarised) is included rather than retrieved.

---

## 8. Prompt Strategy

The agent is configured with a compact instruction set (the Foundry instruction file in this repo is the source of truth). Because the frontend collects inputs, the “collect inputs” step is replaced by an **input contract**.

| Task | Technique | Output Format | Rationale |
| --- | --- | --- | --- |
| Input handling | Input contract in the system prompt: JSON with `grade`, `score_or_placement`, optional `report_images`, optional `lexile`, `child_nickname`, `child_profile`; flag missing or contradictory values instead of guessing | Short validation note or proceed | Frontend enforces required fields; agent only guards against surprises |
| Report parsing | Zero-shot with schema + 2–3 few-shot examples of report layouts | JSON: overall score, placement, domain results, window, per-field confidence | Structured, confirmable by the parent |
| Gap diagnosis | Grounded retrieval + rules: map domains to skills by prerequisite order | Gap table + strengths + data-confidence rating | Plain and auditable |
| Worksheet generation | Few-shot from sample questions; explicit dual-axis spec (math level M, reading band R); coverage rules; freshness rules; verification via Code Interpreter | JSON: questions with metadata (skill, M, R, pair id, answer, working) + rendered Student Sheet and Answer Key | Controlled, verifiable, reproducible |
| Reading-level control | Band constraints (sentence count, length, vocabulary, decodability) injected per item | Same | Meets the Lexile axis without relying on the model’s vague sense of “easy” |
| Grading | Vision extraction first, judgement second; two-step: transcribe handwriting with confidence, then compare to key | JSON per item: extracted answer, confidence, status, error type, method evidence | Separates “what did the child write” from “is it right” |
| Mastery inference | Rubric prompt: evidence thresholds per label; rationale text only | JSON: status per skill + rationale | Deterministic rules in code decide level changes |
| Recalibration rationale | Template-assisted explanation | Plain-language “why difficulty moved” | Transparency for the parent |
| Error recovery | One automatic retry on invalid JSON (“Return only the JSON”) | JSON | Same pattern as ContractIQ |

**Response structure (all modes):** Summary · Key Data · Gaps / Results · Recommendations · Next Step, plus a machine-readable JSON block for the UI.

**Prompt improvement plan:**

- Version the instruction set (v1.0, v1.1, …) in the repo; no ad-hoc edits in the portal.
- Monthly review of parent overrides and rejected worksheets; trigger a prompt review if override rate exceeds 10% in any 7-day window.
- Re-run the full eval suite before any model or prompt change.

---

## 9. Hallucination Guardrails

For TestReady, “hallucination” shows up as: a **wrong answer key**, a **fabricated syllabus claim**, a **misread handwritten digit**, or a **made-up score cut-off**. Guardrails operate at each layer.

**Generation-layer guardrails:**

- **Code-verified answers:** every answer is recomputed in Code Interpreter. Items that fail verification or have more than one defensible answer are replaced.
- **Knowledge-base only for standards:** the agent may not cite a standard, skill or score cut-off that is not in the knowledge base.
- **Readability check:** generated text is checked against the target band; out-of-band items are rewritten.
- **Freshness and duplicate check** against Question History.
- **Age-appropriate contexts:** no frightening, commercial or culturally narrow scenarios; names and settings neutral.
- **Parent-visible tags:** skill, math level and reading level per item in the Answer Key.

**Grading-layer guardrails:**

- **Per-item extraction confidence:** low-confidence items are never silently guessed. They go to the parent review queue with the cropped handwriting.
- **No mastery update on unconfirmed items.**
- **Evidence thresholds:** one item is never enough to label a skill “Secure” or “Not yet”.
- **Honest error typing:** “unclear” is allowed and preferred over forcing a label.
- **Photo quality gate:** blurry, dark or partial photos are rejected with retake guidance rather than graded.

**Parsing-layer guardrails:**

- **Parent confirmation of parsed report values** before anything is generated.
- **Uncertain fields** are highlighted and left blank for manual entry.

**Calibration-layer guardrails:**

- **One step per cycle** and repeated-evidence rule for level changes.
- **Reading axis changes only on reading-attributable evidence.**
- **Read-aloud flag** removes contaminated items from reading calibration.
- **Manual override** by the parent, logged separately.

**UI / human-in-the-loop guardrails:**

- **Disclosure on every results page:** “Practice support, not an official assessment. Ask your child’s teacher for the full picture.”
- **No score predictions** and no claims that worksheets change an iReady score.
- **Gentle escalation:** if patterns persist across many cycles without progress, suggest once that the parent share the sheets with the child’s teacher. No diagnostic or learning-disability language.
- **Child-appropriate framing:** “still building” rather than “weak” or “behind”.

---

## 10. Evaluation Strategy

### Ground truth sources

- 15+ redacted iReady Math reports (Grade 1 and 2; BOY/MOY/EOY; varied layouts) with hand-labelled values
- 30+ completed worksheets from real children (with parental consent, names removed), hand-labelled by a teacher or tutor SME for each answer and error type
- Teacher-reviewed syllabus and sample question set, with difficulty levels agreed by an educator
- Parent overrides and confirmations (opt-in, anonymised) as ongoing signal

### Evaluation Plan

| Eval Type | Method | Target | Cadence |
| --- | --- | --- | --- |
| Report parsing accuracy | Field-level accuracy vs hand-labelled values | ≥ 95% on overall score and placement; ≥ 90% on domain results | Every release |
| Gap mapping quality | Educator review: are gaps and priorities sensible for each report? | ≥ 85% rated “appropriate” | Every release |
| Answer-key correctness | Independent recomputation of 100 generated sheets | 100% correct; 0 ambiguous items | Every release |
| Math level fidelity | Educator rating that items match the intended skill and level | ≥ 90% match | Every release |
| Reading level fit | Automated readability metric plus educator spot check | ≥ 90% of items within target band | Every release |
| Freshness | Duplicate and near-duplicate detection across 10 simulated cycles per child | 0 repeated question, number set, or context+structure in 4 cycles | Every release |
| Handwriting extraction accuracy | Per-item agreement with SME transcription across ≥ 300 items | ≥ 92% exact; > 90% of errors flagged low-confidence | Every release |
| Confidence calibration | Calibration curve: extraction confidence vs actual accuracy | Error ≤ 0.10 | Monthly |
| Grading agreement | System vs parent-confirmed grades in beta | > 90% | Beta + monthly |
| Error-type attribution | SME agreement on error type (slip, concept, reading) | ≥ 75% agreement; “unclear” allowed | Monthly |
| Recalibration sanity | Simulated child profiles: no more than one level step per cycle; reading axis unchanged when only math errors | 100% rule compliance | Every release |
| End-to-end latency | P95 timing per mode | Within Section 5 targets | Every release |
| Cost per cycle | Billing logs over 100 cycles | ≤ $0.25 average | Monthly |
| Parent usefulness (beta) | Survey: “Does this tell me what to practise?” | ≥ 80% Yes | Beta |

### AI Performance Monitoring (Post-Launch)

- Automated regression suite on every deploy using the labelled reports and worksheets
- Weekly drift check: sample 10 parent-overridden items and compare with expected grading
- Alert if override rate exceeds 10% in any 7-day window; alert on cost per cycle above $0.35 (rolling 7 days)
- Monthly educator audit of 10 random generated worksheets (answer correctness, level fit, tone)
- Seasonal load check before each BOY/MOY/EOY window

### Evaluation Spreadsheet

[Link to evaluation spreadsheet — to be created before beta] — Columns: `Sheet_ID | Grade | Skill | Math_Level | Reading_Band | Expected_Answer | Child_Written | AI_Extracted | Extraction_Confidence | Match | SME_Error_Type | AI_Error_Type | Parent_Override | Notes`

---

## 11. Production Readiness Criteria & Metrics (HHH)

### HHH Evaluation

| Pillar | Strength | Risk | Mitigation |
| --- | --- | --- | --- |
| **Helpful** | Converts a vague score into a specific, printable plan within minutes; adapts week to week; no screen for the child | Parents may feel overwhelmed by data, or the plan may be too hard or too easy | Plain-language summary; one clear next step; “too hard / too easy” override; ≤ 10 questions per sheet |
| **Honest** | Shows parsed values for confirmation; labels estimates and “likely” gaps; per-item confidence; reasons shown for difficulty changes | Handwriting or report misreads; model over-states mastery from little evidence | Confidence gating; evidence thresholds; “not enough evidence” is a valid result; disclosure on every results page |
| **Harmless** | Low-stakes practice content; child never uses a screen; no diagnosis | Child stress or shame from labels; a wrong key teaches a wrong answer; data privacy issues | Encouraging language only; code-verified keys; data minimisation and deletion on request; no score predictions |

### Launch Criteria

| Stage | Helpful | Honest | Harmless | Go Criteria |
| --- | --- | --- | --- | --- |
| Internal Alpha (team only) | Intake → gaps → worksheet works end-to-end | Parsed values shown for confirmation | Disclosure present | No crashes on 10 sample reports; answer keys 100% verified |
| Measurement Beta (≤ 50 households) | ≥ 75% say it tells them what to practise | Grading agreement ≥ 85%; override rate ≤ 15% | 0 wrong-key incidents reaching a child unflagged; privacy review passed | Latency within 1.5× targets; handwriting accuracy ≥ 88%; cost ≤ $0.35/cycle |
| Public Launch | ≥ 80% usefulness; full-loop completion > 60% | Grading agreement > 90%; calibration error ≤ 0.10 | Legal review of terms and child-data policy complete; deletion flow tested | Eval targets in Section 10 met; payments tested; seasonal load test passed |

### Responsible AI

**Accountability:**

| Question | Answer |
| --- | --- |
| Efficacy & limitations | TestReady maps iReady results to Grade 1/2 syllabus gaps and generates targeted practice. It is not an official assessment, does not diagnose learning difficulties, does not predict iReady scores, and cannot read heavily damaged or illegible handwriting reliably |
| Compliance policies for sensitive data | Data relates to children. Collect nickname and grade only; mask names on uploads; encrypt at rest and in transit; parent consent and privacy notice; legal review for COPPA/FERPA-adjacent obligations and GDPR/UK Children’s Code if serving those users |
| How is sensitive data managed | Uploaded images are deleted after processing (default 30 days). Structured mastery data persists until the parent deletes the profile. No data is used for model training |
| Human oversight and control | Parent confirms parsed values, reviews low-confidence answers, can override levels, and can regenerate or discard any worksheet. No automatic action affects the child outside the printable worksheet |

**Transparency:**

| Question | Answer |
| --- | --- |
| Direct and indirect use cases | Direct: parents (and tutors) practising Grade 1/2 math. Indirect misuse: using results to label or pressure a child, or to compare children. Mitigation: encouraging language, no rankings, no percentile or score predictions |
| How are results generated | iReady report/score → knowledge-base-grounded gap mapping → generated problems verified by code → child writes on paper → vision reads answers → rules and model rationale update mastery |
| Benchmarks shared with users | Publish grading agreement and answer-key verification rates on a trust page after beta |
| Disclosures required | “Practice support, not an official assessment”; “Powered by AI; please review flagged answers”; per-item skill and level tags visible in the Answer Key; estimated reading level labelled as estimated |

**Fairness:**

| Question | Answer |
| --- | --- |
| Which groups are underrepresented | Children with atypical handwriting, left-handed writers, children with dysgraphia or motor differences; English-language learners; non-US curricula and families who don’t use i-Ready |
| Why they don’t work well and the plan | Handwriting models and word problems are tuned to typical English-speaking US classrooms. Plan: include diverse handwriting in the eval set; allow “circle the answer” and one-digit-per-box formats; offer lower-reading-load bands and an optional read-aloud flag; add Spanish in v1.2 |
| Test/feedback loop | Monthly audit of agreement and override rates segmented by grade, reading band, and (opt-in) language at home |

**Reliability & Safety:**

| Question | Answer |
| --- | --- |
| Acceptable error rates | Answer-key errors: 0 released to parents; grading overrides ≤ 10%; critical failures (data exposed to another user) 0 |
| Consequences of bad input | Blurry or partial photo → retake prompt, nothing stored. Wrong or non-iReady report → polite message and manual entry option. Wrong sheet ID → grade answers but skip skill attribution and say so |
| Recovery plan if system fails | Retry with backoff (3 attempts); show “try again”; keep the last generated worksheet and answer key available; store status so users don’t re-upload |
| How is system health monitored | Azure and Foundry usage dashboards, application logs, uptime monitoring, cost alerts, weekly override and drift review |
| Customer communication plan | P0 incident (data exposure or outage during a testing window): in-app banner and email within 1 hour. P1 incident: banner within 2 hours |

---

## 12. Pricing

### Competitive Pricing Benchmark

|  | TestPrep-Online | Testing Mom | IXL | TestReady (proposed) |
| --- | --- | --- | --- | --- |
| Structure | One-time pack, licence 3–12 months | Recurring (monthly/quarterly/annual) | Recurring (monthly/annual) | Free diagnostic → seasonal pass or subscription |
| Entry price | $59 / 3 months | ~$11/mo (Essentials); ~$6.99/mo effective annual | $9.95/mo ($79/yr) single subject | $0 first diagnostic; $29 per 12-week Season Pass |
| Mid tier | $79 / 6 months | ~$16.19/mo (Pro) | $15.95/mo math + ELA | $9.99/mo or $79/yr Family |
| Family / siblings | $149 for up to 5 tests/1 year | Typically covers family | +$4/mo or +$40/yr per sibling | Up to 3 children included in Family |
| What you pay for | Static questions and practice tests | Large static bank | Adaptive on-screen practice | **Personalised plan, fresh sheets, handwriting grading, recalibration** |

### Recommended Pricing Technique

**Hybrid: free diagnostic + seasonal pass + family subscription (“value-based, usage-capped, season-aligned”).** Reasons:

1. **Free first diagnostic (land-and-expand).** The gap analysis plus one worksheet proves value on the parent’s own child’s score. This answers the “I don’t want another subscription” objection and costs cents (see unit economics).
2. **Season Pass for test-window demand.** Demand is bursty: it spikes after BOY, MOY and EOY reports. A 12-week pass fits that rhythm and anchors against TestPrep-Online’s one-time packs, at a lower price point and with personalisation.
3. **Family subscription for the habit.** Recalibration across weeks and cycles is the real moat, so a recurring plan fits the value. The annual option rewards commitment and improves retention.
4. **Siblings included (up to 3) on Family.** IXL charges per sibling; including siblings is a visible differentiator and cheap to serve.
5. **Fair-use cycle caps, not per-token billing.** Parents see simple limits (worksheets per month), which protects margin without usage anxiety.
6. **Value anchor:** “Less than one tutoring session a month, and the practice is built from your child’s own report.”

### Directional Plans

| Plan | Price | Includes | Target User |
| --- | --- | --- | --- |
| Free Diagnostic | $0 | Report/score analysis, concept gap summary, 1 worksheet + answer key, 1 graded upload | All new users |
| Season Pass | $29 / 12 weeks (one child) | Up to 12 worksheets, grading and recalibration, progress dashboard | Parents prepping for the next test window |
| Family | $9.99 / month or $79 / year | Up to 3 children, up to 12 worksheets per child per month, grading, recalibration, full history | Parents with ongoing practice habit or siblings |
| Tutor | $24.99 / month | Up to 10 children, batch generation (v1.2) | Tutors and homeschool instructors |

*All prices are directional and to be validated by a pricing sensitivity survey and A/B tests in beta (Assumption 13). Paid plans start at the second worksheet cycle.*

### Unit Economics (assumed; verify against Foundry billing)

| Item | Estimate per full cycle |
| --- | --- |
| Worksheet generation (File Search + wording + answer-key verification) | $0.04 to $0.08 |
| Grading (1 vision pass for ~10 items + review rationale) | $0.03 to $0.06 |
| Report parsing (one-time per diagnostic) | $0.02 to $0.04 |
| Code Interpreter sessions, storage, PDF build | $0.02 to $0.05 |
| **Total per cycle** | **≈ $0.10 to $0.20** (target ≤ $0.25; hard cap $0.50) |
- A Family subscriber doing 4 cycles a month costs about **$0.40 to $0.80 per month**, against $9.99 revenue (> 90% gross margin before payment fees and infrastructure).
- A Season Pass user with 12 cycles costs about $1.20 to $2.40 against $29 revenue.
- Cost stays low only if cost guards hold (token caps, one regeneration per sheet, daily cycle cap). Seasonal spikes mainly stress quota and rate limits, not cost.

### Development Costs (One-Time / MVP — 13-week build)

| Item | Estimated Cost |
| --- | --- |
| Azure / Foundry credits during build and testing (≈ 3,000 test cycles) | $600 |
| Hosting and database (dev + staging, 3 months) | $150 |
| Domain, SSL, tooling (design, repo, analytics) | $150 |
| Educator SME time to label evaluation data and review the syllabus | $3,000 |
| **Infrastructure and content subtotal** | **$3,900** |

| Role | Qty | Monthly (assumed) | Duration | Subtotal |
| --- | --- | --- | --- | --- |
| Product Manager | 1 | $8,000 | 3 months | $24,000 |
| Full-stack Engineer | 1 | $10,000 | 3 months | $30,000 |
| AI / Prompt Engineer (part-time) | 0.5 | $9,000 | 3 months | $13,500 |
| QA / DevOps | 0.5 | $6,000 | 3 months | $9,000 |
| UX Designer | 0.5 | $7,000 | 2 months | $7,000 |
| **Manpower subtotal** |  |  |  | **$83,500** |
| **Total one-time (MVP)** |  |  |  | **~$87,400** |

### Operational Costs (Monthly, at 2,000 paying households + free users)

| Item | Monthly Cost |
| --- | --- |
| Foundry model usage (2,000 households × ~4 cycles × $0.15) | $1,200 |
| Free diagnostics (assumed 6,000 per month × $0.10) | $600 |
| Hosting, database, blob storage, monitoring | $250 |
| Payment processing (≈ 3% + fixed fee on ~$20,000 revenue) | $700 |
| **Total monthly operational** | **~$2,750** |

At ~$20,000 monthly revenue, this leaves a gross margin above 85% before team costs.

### Market Size (assumptions; validate)

- **TAM:** ~$190M. Roughly 2.7M US 1st and 2nd graders on i-Ready (assuming about 2/9 of the 12M K–8 users) × ~$70 annual spend.
- **SAM:** ~$75M. About 40% of those children flagged below grade level or “underwhelming” (assumed), reachable through direct-to-parent channels.
- **SOM:** ~$0.65M within 24 months. About 10,000 paying households at ~$65 blended annual revenue.

### Revenue Potential

| Scenario | Paying Households (Year 2) | ARPU | ARR |
| --- | --- | --- | --- |
| Conservative | 2,000 | $55 | $110,000 |
| Target | 10,000 | $65 | $650,000 |
| Optimistic | 25,000 | $70 | $1,750,000 |

### Pricing Models Considered

| Model | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| One-time pack (TestPrep-Online style) | Low commitment; fits test seasons | No recurring revenue; undermines the longitudinal moat | Variant adopted: time-boxed **Season Pass** |
| Monthly subscription | Predictable revenue; habit formation; matches multi-week recalibration | Churn after test windows; “another subscription” objection | **Primary model** (Family) |
| Per-child per-month (IXL style) | Simple to explain | Penalises siblings; competitor pain point | Rejected; siblings included |
| Per-worksheet / pay-as-you-go | Low friction | Discourages the repeated loop that creates value | Possible add-on credit pack only |
| Freemium (permanent free tier) | Large top-of-funnel | Free users cost money; weak conversion | Free **first diagnostic** only, not a permanent free tier |
| Usage-based on tokens | Scales with cost | Confusing to parents | Not recommended |
| School / district licensing | Large contracts | Different sales motion, compliance heavy | Future consideration (v2+) |

---

## 13. Assumptions

Each assumption is a risk item to validate before the matching phase begins.

1. **A vision-capable Foundry model reads children’s handwriting at ≥ 92% exact accuracy** on 1st and 2nd grade worksheets with the answer formats we constrain (one digit per box or circle the answer). If false, switch the grader to a stronger model or constrain answer formats further.
2. **Code Interpreter verification is available and reliable** in the chosen Foundry region and model, and can produce print-ready PDFs. If layout fidelity is poor, use a backend renderer for the PDF and keep Code Interpreter for verification only.
3. **A parent will photograph the worksheet and confirm flagged answers** (full-loop completion > 60%). If not, reduce friction (fewer confirmations, bulk-confirm) or consider capturing answers directly.
4. **iReady reports can be read reliably from images** and the report formats stay stable for at least 12 months. A manual-entry path always exists.
5. **The knowledge base (Grade 1/2 syllabus, sample questions, iReady interpretation guide) is available, accurate and legally usable.** If it is incomplete, the agent states what is missing and degrades to labelled estimates.
6. **Reading difficulty bands can be controlled through readability constraints** well enough that ≥ 90% of items fall in the target band. Lexile-to-band mapping is approximate and labelled as such.
7. **The user is a parent (or tutor), not the child.** The child never uses a screen. Privacy and consent flows are designed for adults.
8. **Parents do not coach during the sheet**, or will tell us when they read aloud. If they do not, the reading axis calibrates noisily; the read-aloud flag reduces this.
9. **Scope is Grades 1 and 2 Math, English, US curriculum.** Other grades, subjects and languages are out of scope for 12 months.
10. **Model pricing stays within ±30%** of current rates over the first 12 months; cost per cycle target is ≤ $0.25.
11. **The team has access to an educator SME** to label 30+ worksheets and 15+ reports and to review the syllabus and sample content before beta. If not, evaluation confidence is lower and launch criteria must be tightened.
12. **The MVP team is 2–3 engineers (one part-time AI engineer), one PM and part-time QA and design**, full-time for 13 weeks.
13. **Pricing and plan limits are directional**, to be validated by user interviews, a pricing sensitivity survey, and A/B tests during beta.
14. **Parents will provide MOY/EOY results at the next cycle** so the North Star metric can be measured. If response is below 30%, add reminders or a lighter proxy metric.
15. **Legal review concludes that the data practices (nickname and grade only, image deletion, no training on data) are sufficient** for US launch. Additional work is needed before serving EU/UK users.
16. **i-Ready names and score terminology are used descriptively and nominatively.** The product does not claim affiliation with or endorsement by Curriculum Associates; a trademark and terms review is required before launch.
17. **A single agent is sufficient for MVP.** If instruction length, cross-task interference, or the need for a stronger grader model show up in evaluation, split into connected agents in v1.1.

---

## 14. Changes from v1.0 & Open Decisions

**Added or changed relative to v1.0:**

| Topic | v1.0 | v2.0 |
| --- | --- | --- |
| Platform | Not specified | Azure AI Foundry Agent Service, File Search, Code Interpreter, vision model |
| Input | Parent enters report fields and optional Lexile | Report (preferred), overall score or placement (minimum), optional Lexile; parsed values confirmed by parent; PDF converted to images |
| Worksheet size | US Letter PDF | Maximum 10 questions per sheet; paper size A4 or Letter (see below) |
| Answer key | Implicit | Separate Parent Answer Key; every answer verified by code |
| Calibration | Two axes, independent | Same, with explicit rules (one step per cycle, repeated evidence, reading axis only on reading-attributable evidence) |
| State | Per-child mastery | Child Profile stored by the app and sent each call; replaces paste-back Progress Record |
| Agents | Four conceptual agents | One agent for MVP; connected agents in v1.1 if evaluation supports it |
| Pricing | “Another subscription” is an objection | Free diagnostic + Season Pass + Family plan; sibling inclusion |
| Multi-child | P2 tutor | Sibling profiles (up to 3) on Family in MVP; tutor account in v1.2 |

**Open decisions for the product team:**

1. **Paper size.** v1.0 says US Letter; the original agent specification said A4. Recommendation: default by locale (Letter for US) and support both.
2. **Answer format.** Constrained formats (one digit per box, circle the answer) improve handwriting accuracy but reduce the free-form “show your work” value. Recommendation: free “show your work” area plus a boxed final-answer line.
3. **Single agent vs connected agents.** Start with one; revisit after the first eval run.
4. **Grader model.** Decide after measuring handwriting accuracy on the default model.
5. **Data layer and auth stack.** Azure-native (Functions + database + blob) is assumed here for alignment with Foundry; ContractIQ used Supabase. Either works if per-user isolation is enforced.
6. **Knowledge base source.** Confirm whether the syllabus and sample questions are authored in-house or licensed, and who owns the iReady interpretation content.
7. **Seasonal marketing.** Decide whether launch is timed to the MOY or EOY window to catch the demand spike.