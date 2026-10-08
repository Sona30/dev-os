// Project-wide constants — docs/specs/00-overview-and-conventions.md §3.
// Server-tunable values read env vars; this file is safe to import on the client because
// env reads fall back to defaults when the server-only variables are absent in the browser bundle.

export const MAX_ITEMS_PER_SHEET = 10
export const MIN_ITEMS_PER_SHEET_FALLBACK = 6
export const MAX_UPLOAD_BYTES = 10_485_760
export const MAX_REPORT_PAGES = 5
export const MAX_SHEET_PAGES = 4
export const IMAGE_LONG_EDGE_PX = 2000
export const SIGNED_URL_TTL_SECONDS = 900
export const UPLOAD_RETENTION_DAYS = 30
export const EXTRACTION_CONFIDENCE_THRESHOLD = 0.85
export const HISTORY_WINDOW_CYCLES = 4
export const MAX_REGENERATIONS_PER_CYCLE = 1
export const MAX_JOB_ATTEMPTS = 3
export const JOB_POLL_INTERVAL_MS = [2000, 2000, 3000, 5000] as const // last value repeats

export const ALLOWED_IMAGE_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
] as const

// HEIC is converted in the browser before anything reaches the model (FR-02)
export const AGENT_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

export const READING_BANDS = ['R1', 'R2', 'R3', 'R4'] as const
export const MATH_LEVELS = [1, 2, 3, 4] as const

// FR-19: shown on every results page
export const DISCLOSURE =
  "Practice support, not an official assessment. Ask your child's teacher for the full picture."
export const AI_DISCLOSURE = 'Powered by AI. Please review any answers we flag.'
export const NON_AFFILIATION =
  'TestReady is not affiliated with or endorsed by Curriculum Associates.'
