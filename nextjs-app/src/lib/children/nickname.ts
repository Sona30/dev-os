// Pure helpers (client + server). The privacy rule: first name or nickname only.

/** Trim and collapse inner whitespace so "  Maya   R " and "Maya R" compare equal. */
export function normalizeNickname(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

/** Two or more capitalised words reads like a full name; we warn but never block. */
export function looksLikeFullName(value: string): boolean {
  const words = normalizeNickname(value).split(' ')
  return words.length >= 2 && words.every((word) => /^\p{Lu}/u.test(word))
}
