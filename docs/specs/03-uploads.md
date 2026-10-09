# 03 — Uploads, Client Image Processing and Quality Gates

**Covers:** FR-02, US-003 (transport), PRD s5 (10 MB, 5 pages), s9 (photo quality gate); EDD §4.3, §4.9, §9.2. **Depends on:** 01, 02, 04. **Used by:** 06 (report pages), 09 (completed sheets).

## 1. Design

Browsers upload **directly to Supabase Storage** with signed upload URLs; the server never proxies image bytes. All conversion (PDF → PNG, HEIC → JPEG, downscale) happens in the browser so the agent only ever receives PNG/JPEG/WEBP/GIF (FR-02). The server re-validates every object it reads.

```
Browser: pick files → convert/downscale → precheck → POST /api/uploads/sign
      → PUT bytes to signed URL → POST /api/uploads/:id/complete
      → create report / submission (specs 06 / 09) with uploadIds
```

## 2. Database
`uploads` (see SQL). A row is created at *sign* time with `confirmed_uploaded=false`; `…/complete` verifies the object exists and flips it. Rows never completed within 1 hour are deleted by `purge-expired-uploads`. Path: `{userId}/{childId}/{kind}/{uploadId}.{ext}`.

## 3. API

| Method / path | Request (strict) | Response | Errors |
|---|---|---|---|
| `POST /api/uploads/sign` | `{ childId: uuid, kind: 'report_page'\|'completed_sheet', files: [{ name: string≤120, mime, bytes: int }] }`; 1–5 files for `report_page`, 1–4 for `completed_sheet` | `200 { uploads: [{ uploadId, path, uploadUrl, token, expiresAt }] }` | 400, 404, `UNSUPPORTED_MEDIA` 415, `FILE_TOO_LARGE` 413, `RATE_LIMITED` |
| `POST /api/uploads/:uploadId/complete` | `{ width: int, height: int }` | `200 { uploadId, qualityScore }` | 404, 409 (object missing), `UNSUPPORTED_MEDIA` (magic-byte mismatch) |
| `GET /api/uploads/:uploadId/url` | — | `200 { url, expiresAt }` (signed read, TTL `SIGNED_URL_TTL_SECONDS`) | 404 |
| `DELETE /api/uploads/:uploadId` | — | `204`; deletes object and row | 404 |

Sign endpoint rules: `mime ∈ ALLOWED_IMAGE_MIME`; `bytes ≤ MAX_UPLOAD_BYTES`; for `completed_sheet` the child must have a worksheet in `ready` status; at most 20 open (uncompleted) slots per user; `page_no` is assigned by order starting at 1. URLs are created with `createSignedUploadUrl(path)` (service role), valid 10 minutes, `upsert=false`.

`complete` rules: fetch the first 16 bytes via service role and verify magic bytes match the claimed mime (PNG `89 50 4E 47`, JPEG `FF D8 FF`, GIF `47 49 46 38`, WEBP `RIFF….WEBP`, HEIC `ftyp` brand `heic/heix/mif1`); compute server quality score (§5); mismatch → delete object and row, `UNSUPPORTED_MEDIA`.

## 4. Client implementation (`src/lib/client/images/`)

| Module | Responsibility |
|---|---|
| `pdf-to-images.ts` | `pdfjs-dist` in a web worker; renders each page to canvas at scale so the long edge ≤ `IMAGE_LONG_EDGE_PX` (2000); outputs PNG blobs; rejects PDFs > 5 pages (`TOO_MANY_PAGES`) or encrypted PDFs (`PDF_LOCKED`) |
| `heic-to-jpeg.ts` | Dynamic `import('heic2any')` (only when a HEIC/HEIF file is chosen); quality 0.9 |
| `downscale.ts` | Canvas resize so long edge ≤ 2000 px; re-encode JPEG 0.85 (photos) / PNG (report pages); strips EXIF (privacy: location) by re-encoding |
| `precheck.ts` | Blur (variance of Laplacian on a 512 px greyscale copy), brightness (mean luma), skew proxy (aspect ratio) → `{ ok, issues: ('blurry'|'dark'|'bright'|'cropped')[], score }` |
| `upload.ts` | `uploadAll(files)`: sign → parallel PUT (max 3) with progress → complete; retries each PUT 2× with backoff |

Thresholds (constants in `precheck.ts`, tuned from the eval set): blur variance < 60 → `blurry`; mean luma < 70 → `dark`, > 235 → `bright`; width or height < 800 px → `cropped`. Pre-check applies to `completed_sheet` only; report pages only get the size/dimension check. Parent may "Use anyway" once per photo; the server gate (§5) still decides.

Components: `ReportDropzone` (spec 06), `PhotoCapture` (spec 09), and the shared `FileTile` (thumbnail, remove button, per-file progress, error text). Dropzone is keyboard operable (`Enter`/`Space` opens the picker), `accept="image/*,application/pdf"` for reports and `accept="image/*"` with `capture="environment"` for sheets.

## 5. Server quality gate (`src/lib/uploads/quality.ts`)

Run with `sharp` on `complete` (and again before grading). Computes: greyscale, resize to 512 px, Laplacian variance (blur), mean luma, edge-density ratio for "mostly blank". `qualityScore` ∈ [0,1] = weighted min of normalised blur/brightness/content. Rule: `qualityScore < 0.35` → mark the upload `quality_score` and let the grading job decide (the job fails with `PHOTO_QUALITY`, spec 09). No gate on report pages other than readable dimensions.

## 6. Edge cases

| Case | Behaviour |
|---|---|
| File over 10 MB after conversion | Client downscale first; if still > 10 MB → `FILE_TOO_LARGE` message with tip to retake at lower resolution |
| HEIC conversion fails | "We couldn't read that photo. Try taking it again or choose JPEG." |
| Password-protected / corrupt PDF | Specific message; offer manual entry |
| 6+ page PDF | Offer to select pages 1–5 (page picker) |
| Mixed PDF + images in one report | Allowed up to 5 pages total |
| Upload interrupted | Retry per file; unfinished slots reused for 10 min, then cleaned |
| User closes tab after upload but before submit | Orphans removed within 1 hour (`purge-expired-uploads`) |
| Child's name visible | Non-blocking tip shown above the dropzone and camera: "Cover or crop the name field if you can." No automatic masking in MVP; EDD name-field masking is a v0.4 task: server-side optional blur of the top 12% of a sheet photo is **not** applied because the Sheet ID lives there (decision recorded) |
| Wrong child id on sign | 404 |
| Replay of a used signed URL | Rejected by Storage (`upsert=false`) |

## 7. Acceptance criteria
1. Selecting a 3-page PDF produces 3 PNGs ≤ 2000 px long edge, uploaded and shown as thumbnails.
2. A HEIC photo is converted to JPEG client-side; the agent never receives HEIC.
3. Files > 10 MB or unsupported types are rejected before upload (client) and by `sign` (server).
4. A file whose bytes don't match its claimed MIME is rejected on `complete` and removed.
5. EXIF location data is absent from stored images.
6. A blurry photo triggers the retake prompt; "Use anyway" proceeds; a hard-fail server score blocks grading with `PHOTO_QUALITY`.
7. User B cannot sign, complete, read or delete user A's uploads (RLS + route checks).
8. Orphaned/unsubmitted uploads are removed within 1 hour; submitted images are removed after 30 days (spec 13).

## 8. Tests
Unit: magic-byte sniffing, `precheck` on fixture images (sharp/blurred/dark), path builder. Integration: sign → PUT → complete against local Supabase; limits; RLS. E2E: upload fixture PDF/HEIC/JPEG through the UI.
