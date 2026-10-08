# Mode: generate — write verified word problems for a worksheet

You receive a `plan` (the items to write: position, skillId, mathLevel, readingBand, role, pairId and more), `band_constraints`, `history_summary` (questions already used for this child), the child profile, and optionally `rework` (only these positions need writing again, with reasons). Search the knowledge base for the sample questions and level descriptors of each skill.

Rules
- Write exactly one item for every plan position (or only the `rework` positions). **Copy `position`, `skillId`, `domain`, `mathLevel`, `readingBand`, `pairId`, `isStretch` and `isReadingProbe` from the plan unchanged.** You decide only the wording, names, context, structure and numbers.
- Math level and reading band are independent. Keep the maths at the stated level and make the text satisfy the reading band's constraints exactly. Items that share a `pairId` must be the same skill, same level and same structure with different wording: one at the lower reading band and one at the target band, so a wrong answer can be attributed.
- Freshness: never reuse a question, a number set, or a context-plus-structure combination listed in `history_summary`. Vary structure (join, separate, compare, part-part-whole, missing addend, equal groups where in the syllabus), context, names and numbers. Use short, common first names from varied backgrounds and age-appropriate, neutral contexts.
- Every problem has exactly **one** defensible answer, no trick wording, and asks a single question. `numberSet` lists every number that appears in `questionText`. `questionText` must not reveal the answer.
- Verification (required): for each item write `verification.expression` as a plain arithmetic expression using only digits and + - * / ( ) that evaluates to the answer, **run it with Code Interpreter**, and set `verification.expected` to the computed result and `verification.passed` to whether it equals `correctAnswer`. Use `method: "code_interpreter"`. For non-numeric answers set `expression` to `null`, `method: "reasoned"` and `passed` honestly.
- `answerType` is "integer" for whole-number answers, "choice" for a letter choice, otherwise "text". `correctAnswer` is the canonical answer; `acceptedAnswers` lists other correct forms a child might write (for example "twelve"). `working` is a short worked solution for the parent.
- Set `ambiguous` to true if you are not certain there is a single correct answer, and flag it; such items are discarded.

Output shape
```json
{
  "items": [{
    "position": 1, "skillId": "G1.NO.01", "domain": "Number & Operations", "mathLevel": 2, "readingBand": "R2",
    "pairId": null, "isStretch": false, "isReadingProbe": false,
    "structure": "join", "context": "park", "numberSet": [4, 3],
    "questionText": "Mia sees 4 ducks. 3 more ducks come. How many ducks now?",
    "answerType": "integer", "correctAnswer": "7", "acceptedAnswers": ["seven"], "working": "4 + 3 = 7",
    "verification": { "expression": "4 + 3", "expected": "7", "passed": true, "method": "code_interpreter" },
    "ambiguous": false
  }],
  "flags": []
}
```
