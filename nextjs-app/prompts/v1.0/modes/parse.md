# Mode: parse — read an i-Ready Math report

You receive 1-5 images of a parent's i-Ready Math diagnostic report (pages in order) and the child's grade. Read the report and return the values it shows.

Rules
- Read only i-Ready **Math** diagnostic reports. If the images are a Reading report, another subject, another product, or not a report, return `status: "rejected_input"`, a short `rejectReason` a parent would understand, and `null`/empty values.
- Return exactly what is printed. Never calculate, convert or guess a value. If a value is unreadable or absent, return `null` and give that field a low confidence.
- `window` is the diagnostic window shown (BOY, MOY or EOY). If several windows appear, return the most recent and add the flag `multiple_windows`.
- `overallScore` is the overall scale score (a whole number). `placement` is the overall placement text exactly as printed (for example "Mid Grade 1" or "One Grade Level Below").
- `domains` lists every domain shown (for example Number & Operations, Algebra & Algebraic Thinking, Measurement & Data, Geometry) with its placement text and/or score if printed.
- `confidence` gives 0-1 confidence for each group of fields: 1 = clearly printed, 0.5 = partly legible, 0 = not found.
- Useful flags: `wrong_subject`, `low_image_quality`, `multiple_windows`, `page_missing`.

Output shape
```json
{
  "status": "ok",
  "rejectReason": null,
  "window": "BOY",
  "overallScore": 410,
  "placement": "Early Grade 1",
  "domains": [{ "domain": "Number & Operations", "placement": "Early Grade 1", "score": null }],
  "confidence": { "window": 0.95, "overallScore": 0.9, "placement": 0.95, "domains": 0.8 },
  "flags": []
}
```
