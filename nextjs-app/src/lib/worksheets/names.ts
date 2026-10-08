// Short, common first names from varied backgrounds, all one or two syllables, used as suggestions in the
// plan so worksheets feel varied and inclusive (docs/specs/08 §4.3). The list is also used to recognise names
// when comparing questions, so "Mia has 4 ducks" and "Omar has 4 ducks" count as the same question.
export const NAMES: readonly string[] = [
  'Mia', 'Omar', 'Ana', 'Leo', 'Noah', 'Zoe', 'Ravi', 'Maya', 'Ben', 'Lily', 'Sam', 'Ivy',
  'Jin', 'Ali', 'Eli', 'Nia', 'Tom', 'Ava', 'Kai', 'Luz', 'Raj', 'Mei', 'Max', 'Dev',
  'Ola', 'Sia', 'Teo', 'Uma', 'Yara', 'Zane', 'Amir', 'Bo', 'Cy', 'Dani', 'Fay', 'Gus',
  'Hana', 'Ian', 'Jo', 'Kira', 'Lena', 'Milo', 'Nora', 'Otto', 'Pia', 'Quinn', 'Rosa', 'Sol',
]

const NAME_SET = new Set(NAMES.map((name) => name.toLowerCase()))

export function isKnownName(word: string): boolean {
  return NAME_SET.has(word.toLowerCase())
}

/** A different name for each position in each cycle (step 5 is coprime with the list length). */
export function nameHint(cycleNumber: number, position: number): string {
  return NAMES[(cycleNumber * 11 + position * 5) % NAMES.length] ?? 'Mia'
}
