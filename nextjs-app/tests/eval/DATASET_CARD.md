# Evaluation dataset card

The labelled data used by `npm run eval` lives **outside the repository** (it contains children's handwriting and
real score reports). Point `EVAL_DATA_DIR` at it (default `./eval-data`, which is git-ignored). Only synthetic
fixtures are ever committed.

## Layout

```
eval-data/
  reports/       <id>.png|jpg|webp  +  <id>.json     (E1)
  sheets/        <id>.jpg, <id>.2.jpg (extra pages)  +  <id>.json   (E7-E10, E14)
  adversarial/   <id>.jpg  +  <id>.json              (E16)
```

Images must be PNG, JPEG or WebP (the app converts HEIC and PDF in the browser before upload, so the evaluation
uses what the model really receives).

### `reports/<id>.json`
```json
{ "grade": 1, "window": "MOY", "overallScore": 412, "placement": "Grade 1",
  "domains": [{ "domain": "Number and Operations", "placement": "Early 1", "score": 405 }],
  "segments": { "layout": "screenshot" } }
```
Two reviewers label each report independently; disagreements are resolved before the file is written.

### `sheets/<id>.json`
```json
{ "sheetId": "TR-Maya-C3-K7QX", "grade": 1,
  "key": [{ "position": 1, "question_text": "…", "answer_type": "integer", "correct_answer": "7",
            "accepted_answers": ["seven"], "skill_id": "G1.NO.02", "math_level": 2, "reading_band": "R2",
            "pair_id": null, "pair_role": null }],
  "items": [{ "position": 1, "written": "7", "correct": true, "errorType": null }],
  "segments": { "handwriting": "messy", "device": "phone", "lighting": "dim" } }
```
`written` is what the child actually wrote, transcribed by a teacher or tutor ("" if left blank). `errorType` is one
of `calculation_slip | concept_gap | reading_difficulty | attention_copying | unclear`. Use the same segment tags
across sheets (handwriting style, device, lighting) so fairness cuts (E14) have enough samples per tag; a tag with
fewer than 10 items is left out of the cut.

### `adversarial/<id>.json`
```json
{ "kind": "non_iready", "mode": "parse", "expect": "reject" }
{ "kind": "rotated_report", "mode": "parse", "expect": "accept", "overallScore": 412 }
{ "kind": "empty_sheet", "mode": "grade", "expect": "blank", "sheetId": "TR-Maya-C1-ABCD", "key": [ … ] }
{ "kind": "other_childs_sheet", "mode": "grade", "expect": "reject", "sheetId": "TR-Maya-C1-ABCD", "key": [ … ] }
```

## Minimum sizes (docs/specs/15 §3)
Reports ≥ 15, sheets ≥ 30 (≥ 300 items), adversarial ≥ 10 across all kinds.

## Consent and de-identification (complete before any real data is added)
| Item | Record here |
|---|---|
| Who provided the material, and on what basis | |
| Written consent from each parent, and what it covers | |
| Names, school names, teacher names and faces removed or cropped | |
| Where the raw files are stored, who has access, and when they will be deleted | |
| Who labelled the data, and their qualification | |

No raw child data may be committed to the repository.
