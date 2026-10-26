const MAX_CANDIDATES = 3
const NAME_CHARACTERS = /[^\p{L}\p{N}\s'’,:!.&-]/gu
const MANA_COSTS_AND_NUMBERS = /\{[^}]*\}|(?<![\p{L}\p{N}])\p{N}+(?![\p{L}\p{N}])/gu
const SET_CODE_LINE = /^(?:\p{Lu}{1,3}\s*)+$/u

export function likelyCardNamesTopFirst(blocks: string[]): string[] {
  const seen = new Set<string>()
  return blocks
    .flatMap((block) => block.split("\n"))
    .map((line) =>
      line
        .replace(MANA_COSTS_AND_NUMBERS, " ")
        .replace(NAME_CHARACTERS, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((line) => {
      const letters = line.match(/\p{L}/gu)?.length ?? 0
      const key = line.toLowerCase()
      if (letters < 3 || letters / line.length < 0.6 || line.length > 60) return false
      if (SET_CODE_LINE.test(line) || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, MAX_CANDIDATES)
}
