import { cardTextLinesTopFirst, NAME_LINES_FROM_CARD_TOP } from "./cardScan"

const SHORTLIST_SIZE = 40
const MIN_SIMILARITY = 0.85
const MIN_LEAD_OVER_RUNNER_UP = 0.05
const TYPED_SHORTLIST_SIZE = 300
const MIN_TYPED_SIMILARITY = 0.6
const WORD_START_WEIGHT = 0.95
const PART_WORD_WEIGHT = 0.97
const GOOD_IN_ORDER = 0.9

export type CardNameIndex = {
  names: string[]
  faces: {
    key: string
    nameIndex: number
    wholeName: boolean
    trigramCount: number
    printedName?: string
  }[]
  facesByTrigram: Map<string, number[]>
}

export type CardNameMatch = { name: string; similarity: number; printedName?: string }

const NON_ASCII = /[^\x00-\x7f]/

function foldAccents(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/æ/g, "ae")
}

/** why: the Magic file keys 30k names on load, and Unicode normalization is slow on Hermes. */
export function matchKey(text: string) {
  const folded = NON_ASCII.test(text) ? foldAccents(text) : text.toLowerCase()
  return folded.replace(/[^a-z0-9]+/g, " ").trim()
}

function trigrams(key: string) {
  const padded = `  ${key} `
  const grams = new Set<string>()
  for (let start = 0; start + 3 <= padded.length; start++) grams.add(padded.slice(start, start + 3))
  return grams
}

let previousRow = new Int32Array(64)
let currentRow = new Int32Array(64)

function similarity(a: string, b: string) {
  if (previousRow.length <= b.length) {
    previousRow = new Int32Array(b.length * 2)
    currentRow = new Int32Array(b.length * 2)
  }
  let previous = previousRow
  let current = currentRow
  for (let j = 0; j <= b.length; j++) previous[j] = j
  for (let i = 1; i <= a.length; i++) {
    current[0] = i
    const letter = a.charCodeAt(i - 1)
    for (let j = 1; j <= b.length; j++) {
      const replace = previous[j - 1] + (letter === b.charCodeAt(j - 1) ? 0 : 1)
      const remove = previous[j] + 1
      const insert = current[j - 1] + 1
      current[j] =
        replace < remove ? (replace < insert ? replace : insert) : remove < insert ? remove : insert
    }
    ;[previous, current] = [current, previous]
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length, 1)
}

export function cardNameIndex(
  names: string[],
  printedAlternates: readonly (readonly [printed: string, name: string])[] = [],
): CardNameIndex {
  const faces: CardNameIndex["faces"] = names.flatMap((name, nameIndex) =>
    [...new Set([name, ...name.split(" // ")])].map((face) => {
      const key = matchKey(face)
      return { key, nameIndex, wholeName: face === name, trigramCount: trigrams(key).size }
    }),
  )
  const nameIndexes = new Map(names.map((name, nameIndex) => [name, nameIndex]))
  for (const [printedName, name] of printedAlternates) {
    const nameIndex = nameIndexes.get(name)
    const key = matchKey(printedName)
    if (nameIndex === undefined || !key) continue
    faces.push({ key, nameIndex, wholeName: true, trigramCount: trigrams(key).size, printedName })
  }
  const facesByTrigram = new Map<string, number[]>()
  faces.forEach((face, faceIndex) => {
    for (const gram of trigrams(face.key)) {
      const posting = facesByTrigram.get(gram)
      if (posting) posting.push(faceIndex)
      else facesByTrigram.set(gram, [faceIndex])
    }
  })
  return { names, faces, facesByTrigram }
}

export function catalogNameIndex(catalog: { names: string; alternateNames: string }) {
  const alternates = catalog.alternateNames
    .split("\n")
    .map((line) => line.split("\t"))
    .flatMap(([printed, name]) => (printed && name ? [[printed, name] as const] : []))
  return cardNameIndex(catalog.names.split("\n"), alternates)
}

function endsOnWholeWord(face: string, end: number) {
  if (end === face.length) return true
  const possessive =
    face.startsWith(" s", end) && (end + 2 === face.length || face[end + 2] === " ")
  return face[end] === " " && !possessive
}

function bestSliceSimilarity(query: string, face: string, laterWordWeight = WORD_START_WEIGHT) {
  let best = 0
  for (let start = 0; start < face.length; start++) {
    if (start > 0 && face[start - 1] !== " ") continue
    const end = start + query.length
    const score =
      similarity(query, face.slice(start, end)) *
      (start ? laterWordWeight : 1) *
      (endsOnWholeWord(face, end) ? 1 : PART_WORD_WEIGHT)
    if (score > best) best = score
  }
  return best
}

function anyOrderSimilarity(words: string[], face: string) {
  let matched = 0
  let letters = 0
  for (const word of words) {
    matched += bestSliceSimilarity(word, face, 1) * word.length
    letters += word.length
  }
  return matched / letters
}

function typedSimilarity(query: string, face: string) {
  return Math.max(similarity(query, face), bestSliceSimilarity(query, face))
}

function rankedNames(index: CardNameIndex, line: string, typed = false) {
  const key = matchKey(line)
  if (key.length < 3) return []
  const lineTrigrams = trigrams(key)
  const shared = new Uint16Array(index.faces.length)
  const touched: number[] = []
  for (const gram of lineTrigrams)
    for (const faceIndex of index.facesByTrigram.get(gram) ?? [])
      if (shared[faceIndex]++ === 0) touched.push(faceIndex)
  const shortlistSize = typed ? TYPED_SHORTLIST_SIZE : SHORTLIST_SIZE
  let candidates = touched
  if (typed) {
    const facesSharing = new Uint32Array(lineTrigrams.size + 1)
    for (const faceIndex of touched) facesSharing[shared[faceIndex]]++
    let minShared = lineTrigrams.size
    let count = facesSharing[minShared]
    while (minShared > 1 && count < shortlistSize) count += facesSharing[--minShared]
    candidates = touched.filter((faceIndex) => shared[faceIndex] >= minShared)
  }
  const overlap = new Float64Array(index.faces.length)
  for (const faceIndex of candidates)
    overlap[faceIndex] = typed
      ? shared[faceIndex] / lineTrigrams.size - index.faces[faceIndex].trigramCount / 1e4
      : shared[faceIndex] /
        (lineTrigrams.size + index.faces[faceIndex].trigramCount - shared[faceIndex])
  const bestByName = new Map<
    number,
    { similarity: number; wholeName: boolean; face: string; printedName?: string }
  >()
  const shortlist = candidates.sort((a, b) => overlap[b] - overlap[a]).slice(0, shortlistSize)
  const keep = (faceIndex: number, similarity: number) => {
    const face = index.faces[faceIndex]
    const current = bestByName.get(face.nameIndex)
    if (!current || similarity > current.similarity)
      bestByName.set(face.nameIndex, {
        similarity,
        wholeName: face.wholeName,
        face: face.key,
        printedName: face.printedName,
      })
  }
  let best = 0
  for (const faceIndex of shortlist) {
    const score = (typed ? typedSimilarity : similarity)(key, index.faces[faceIndex].key)
    best = Math.max(best, score)
    keep(faceIndex, score)
  }
  const words = key.split(" ")
  if (typed && words.length > 1 && best < GOOD_IN_ORDER)
    for (const faceIndex of shortlist)
      keep(faceIndex, anyOrderSimilarity(words, index.faces[faceIndex].key))
  return [...bestByName]
    .map(([nameIndex, score]) => ({ nameIndex, ...score }))
    .sort((a, b) => b.similarity - a.similarity || Number(b.wholeName) - Number(a.wholeName))
}

export function firstUnambiguousCardName(
  index: CardNameIndex,
  lines: string[],
): CardNameMatch | undefined {
  for (const line of lines) {
    const [best, ...others] = rankedNames(index, line)
    const runnerUp = others.find((other) => other.face !== best?.face)
    if (!best || best.similarity < MIN_SIMILARITY) continue
    const exactWholeName = best.similarity === 1 && best.wholeName
    if (
      !exactWholeName &&
      runnerUp &&
      best.similarity - runnerUp.similarity < MIN_LEAD_OVER_RUNNER_UP
    )
      continue
    return {
      name: index.names[best.nameIndex],
      similarity: best.similarity,
      ...(best.printedName ? { printedName: best.printedName } : {}),
    }
  }
  return undefined
}

export function nameFromCardTop(index: CardNameIndex, linesFromCardTop: string[]) {
  const lines = cardTextLinesTopFirst(linesFromCardTop).slice(0, NAME_LINES_FROM_CARD_TOP)
  return firstUnambiguousCardName(index, lines)
}

export function closestNamesFromCardTop(
  index: CardNameIndex,
  linesFromCardTop: string[],
  count: number,
): string[] {
  const lines = cardTextLinesTopFirst(linesFromCardTop).slice(0, NAME_LINES_FROM_CARD_TOP)
  const best = new Map<number, number>()
  for (const line of lines)
    for (const { nameIndex, similarity: score } of rankedNames(index, line))
      if (score > (best.get(nameIndex) ?? -1)) best.set(nameIndex, score)
  return [...best]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([nameIndex]) => index.names[nameIndex])
}

export function searchCardNames(
  index: CardNameIndex,
  query: string,
  limit: number,
  preference?: (name: string) => number,
) {
  const key = matchKey(query)
  return rankedNames(index, query, true)
    .filter((match) => match.similarity >= MIN_TYPED_SIMILARITY)
    .map((match) => {
      const name = index.names[match.nameIndex]
      const exact = match.wholeName && match.face === key
      return { ...match, name, exact, preference: preference?.(name) ?? 0 }
    })
    .sort(
      (a, b) =>
        Number(b.exact) - Number(a.exact) ||
        b.similarity - a.similarity ||
        Number(b.wholeName) - Number(a.wholeName) ||
        b.preference - a.preference ||
        a.name.length - b.name.length,
    )
    .slice(0, limit)
    .map(({ name }) => name)
}
