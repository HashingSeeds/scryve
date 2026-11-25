const NAME_CHARACTERS = /[^\p{L}\p{N}\s'’,:!.&-]/gu
const MANA_COSTS_AND_NUMBERS = /\{[^}]*\}|(?<![\p{L}\p{N}])\p{N}+(?![\p{L}\p{N}])/gu
const SET_CODE_LINE = /^(?:\p{Lu}{1,3}\s*)+$/u
// why: denominator requires 2+ digits so creature power/toughness like 2/3 or 4/4 never parses as a collector ratio.
const COLLECTOR_RATIO = /\b0*([1-9]\d{0,3}[a-z]?)\s*\/\s*0*[1-9]\d{1,3}\b/i
const SET_AND_LANG = /\b([A-Z0-9]{3,5})\s*[•·★*.-]?\s*(EN|JA|JP|FR|DE|IT|ES|PT|KO|RU|ZHS|ZHT)\b/
const SET_AND_GLUED_LANG =
  /\b([A-Z0-9]{3,5})\s+[•·★*.-]?(EN|JA|JP|FR|DE|IT|ES|PT|KO|RU|ZHS|ZHT)(?=[A-Z])/
const STANDALONE_SET_TOKEN = /\b([A-Z][A-Z0-9]{2,4})\b/g
const SET_AND_NUMBER =
  /\b([A-Z][A-Z0-9]{2,4})\b(?:\s*[•·★*.-]?\s*(?:EN|JA|JP|FR|DE|IT|ES|PT|KO|RU|ZHS|ZHT|[CURMSLTBP]))?\s*[•·★*.#/-]?\s*0*([1-9]\d{0,3}[a-zA-Z]?)\b/
const COPYRIGHT_TAIL = /[©®].*$/
const STANDALONE_COLLECTOR = /\b(0\d{2,3}[a-z]?)\b/i
const FOIL_STAR = /[★☆]/
const IGNORED_SET_TOKENS = new Set([
  "TM",
  "WOTC",
  "LLC",
  "INC",
  "USA",
  "CBS",
  "THE",
  "AND",
  "FOR",
  "ALL",
  "EN",
  "JA",
  "JP",
  "FR",
  "DE",
  "IT",
  "ES",
  "PT",
  "KO",
  "RU",
])
export const NAME_LINES_FROM_CARD_TOP = 2

export type CollectorHint = {
  setCode?: string
  candidateSetCodes?: string[]
  collectorNumber?: string
  language?: string
  isFoilStar?: boolean
}

export function collectorHintFromCardBottom(blocks: readonly string[]): CollectorHint {
  const raw = blocks
    .flatMap((block) => block.split("\n"))
    .map((line) => line.trim())
    .filter(Boolean)
  if (raw.length === 0) return {}

  const joined = raw.join("\n")
  let setCode: string | undefined
  const candidateSetCodes = new Set<string>()
  let collectorNumber: string | undefined
  let language: string | undefined
  const isFoilStar = FOIL_STAR.test(joined) || undefined

  for (const line of raw) {
    const ratio = COLLECTOR_RATIO.exec(line)
    if (ratio && !collectorNumber) collectorNumber = ratio[1].toLowerCase()

    // why: matching original uppercase avoids treating lowercase English rules text ("will defend", "stop it", "cards from") as set/language codes.
    const setLang = SET_AND_LANG.exec(line) ?? SET_AND_GLUED_LANG.exec(line)
    if (setLang && !IGNORED_SET_TOKENS.has(setLang[1])) {
      setCode ??= setLang[1].toLowerCase()
      language ??= setLang[2].toLowerCase()
    }

    const cleanedForTokens = line.replace(COPYRIGHT_TAIL, "").trim()
    for (const tokenMatch of cleanedForTokens.matchAll(STANDALONE_SET_TOKEN)) {
      const token = tokenMatch[1]
      if (!IGNORED_SET_TOKENS.has(token)) {
        candidateSetCodes.add(token.toLowerCase())
      }
    }
  }

  if (!setCode || !collectorNumber) {
    for (const line of raw) {
      const cleaned = line.replace(COPYRIGHT_TAIL, "").trim()
      if (!cleaned) continue
      const pair = SET_AND_NUMBER.exec(cleaned)
      if (pair && !IGNORED_SET_TOKENS.has(pair[1])) {
        setCode ??= pair[1].toLowerCase()
        collectorNumber ??= pair[2].toLowerCase()
      }
      if (!collectorNumber) {
        const padded = STANDALONE_COLLECTOR.exec(cleaned)
        if (padded) collectorNumber = padded[1].replace(/^0+/, "").toLowerCase()
      }
    }
  }

  return {
    ...(setCode ? { setCode } : {}),
    ...(!setCode && candidateSetCodes.size > 0
      ? { candidateSetCodes: Array.from(candidateSetCodes) }
      : {}),
    ...(collectorNumber ? { collectorNumber } : {}),
    ...(language ? { language } : {}),
    ...(isFoilStar ? { isFoilStar } : {}),
  }
}

export function cardTextLinesTopFirst(blocks: string[]): string[] {
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
}
