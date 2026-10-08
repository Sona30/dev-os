import { randomInt } from 'node:crypto'

// Sheet IDs look like TR-Maya-C3-K7QX and are printed on every sheet so a photo can be matched to its
// answer key (FR-09). Format is enforced by the database: ^TR-[A-Za-z0-9]{1,12}-C[0-9]{1,4}-[A-Z0-9]{4}$

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I: easy to read in a child's photo
const FALLBACK_NAME = 'child'

/** Letters and digits only (accents folded), up to 8 characters, so the ID is safe in a file name and in OCR. */
export function sheetNamePart(nickname: string): string {
  const folded = nickname
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 8)
  return folded.length > 0 ? folded : FALLBACK_NAME
}

export function makeSheetId(nickname: string, cycleNumber: number): string {
  let suffix = ''
  for (let i = 0; i < 4; i++) suffix += ALPHABET[randomInt(ALPHABET.length)]
  return `TR-${sheetNamePart(nickname)}-C${cycleNumber}-${suffix}`
}
