// Error catalogue — docs/specs/00-overview-and-conventions.md §5.
// Messages are the plain-language text shown to parents; they never expose provider details.

export const ERROR_CATALOG = {
  UNAUTHENTICATED: { status: 401, message: 'Please sign in to continue.' },
  INVALID_CREDENTIALS: { status: 401, message: 'Email or password is incorrect.' },
  FORBIDDEN: { status: 403, message: "That request isn't allowed." },
  VALIDATION_ERROR: { status: 422, message: 'Please check the highlighted fields.' },
  PROMPT_INJECTION: {
    status: 400,
    message: 'Please use plain words only. That text looks like instructions, so we can’t use it.',
  },
  UNSUPPORTED_CONTENT_TYPE: { status: 415, message: 'Requests must be sent as JSON.' },
  NOT_FOUND: { status: 404, message: "We couldn't find that." },
  CONFLICT: { status: 409, message: 'That conflicts with the current state. Refresh and try again.' },
  CHILD_EXISTS: { status: 409, message: 'You already have a child with that name.' },
  CHILD_LIMIT: { status: 422, message: 'Your plan allows up to 3 children.' },
  GRADE_LOCKED: { status: 409, message: "Grade can't be changed after the first worksheet." },
  CONTRADICTORY_INPUT: { status: 422, message: "That placement doesn't match the grade you chose." },
  NOT_PARSED: { status: 409, message: "We're still reading the report." },
  REPORT_NOT_CONFIRMED: { status: 409, message: 'Please confirm the report values first.' },
  PAYWALL: { status: 402, message: 'Your free worksheet has been used.' },
  DAILY_CAP: { status: 429, message: "You've reached today's worksheet limit. Try again tomorrow." },
  REGEN_LIMIT: { status: 409, message: 'You can regenerate a worksheet once per cycle.' },
  ALREADY_GRADED: { status: 409, message: 'This sheet has already been graded.' },
  NOT_COMPLETE: { status: 409, message: 'These results aren’t ready yet.' },
  REVIEW_PENDING: { status: 409, message: 'Some answers still need your confirmation.' },
  FILE_TOO_LARGE: { status: 413, message: 'That file is larger than 10 MB.' },
  UNSUPPORTED_MEDIA: { status: 415, message: "We can't read that file type." },
  PHOTO_QUALITY: { status: 422, message: 'The photo is too blurry, dark or cut off. Please retake it.' },
  SHEET_MISMATCH: { status: 422, message: "This photo doesn't match the worksheet." },
  JOB_RETRY_LIMIT: { status: 409, message: "We've tried this three times. Please contact support." },
  AI_UNAVAILABLE: { status: 503, message: 'Our assistant is busy. Please try again in a minute.' },
  AI_INVALID_OUTPUT: { status: 502, message: "We couldn't finish this step. Please try again." },
  RATE_LIMITED: { status: 429, message: 'Too many requests. Please wait a moment.' },
  TEMPORARILY_UNAVAILABLE: { status: 503, message: 'Photos and downloads are paused for a moment. Please try again soon.' },
  SERVICE_UNAVAILABLE: { status: 503, message: 'We’re having trouble right now. Please try again in a minute.' },
  INTERNAL: { status: 500, message: 'Something went wrong. Please try again.' },
} as const

export type ErrorCode = keyof typeof ERROR_CATALOG
