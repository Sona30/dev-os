import { z } from 'zod'
import { uuid } from './common'

// Product-funnel events sent from the browser (docs/specs/14 §2). Only these names are accepted, so the
// endpoint cannot be used to write arbitrary text into the usage log.
export const CLIENT_EVENTS = [
  'score_entered',
  'worksheet_printed',
  'photo_uploaded',
  'next_sheet_started',
  'client.error',
] as const

export type ClientEvent = (typeof CLIENT_EVENTS)[number]

export const clientEventSchema = z
  .object({
    event: z.enum(CLIENT_EVENTS),
    childId: uuid.optional(),
    /** For client.error only: which part of the app failed. Letters, digits and . _ - only (no free text). */
    component: z.string().regex(/^[A-Za-z0-9_.-]{1,60}$/).optional(),
  })
  .strict()
