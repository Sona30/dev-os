// Detects the real image type from the first bytes so a file cannot lie about its MIME type.

export type SniffedMime = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'image/heic'

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let text = ''
  for (let i = start; i < start + length && i < bytes.length; i++) text += String.fromCharCode(bytes[i] ?? 0)
  return text
}

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'])

export function sniffMime(bytes: Uint8Array): SniffedMime | null {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (ascii(bytes, 0, 4) === 'GIF8') return 'image/gif'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp'
  if (ascii(bytes, 4, 4) === 'ftyp' && HEIC_BRANDS.has(ascii(bytes, 8, 4))) return 'image/heic'
  return null
}

/** True when the claimed MIME agrees with the sniffed type (image/heif is HEIC). */
export function mimeMatches(claimed: string, sniffed: SniffedMime | null): boolean {
  if (!sniffed) return false
  if (claimed === 'image/heif') return sniffed === 'image/heic'
  return claimed === sniffed
}
