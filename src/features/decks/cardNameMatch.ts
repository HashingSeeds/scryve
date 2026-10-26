const SHORTLIST_SIZE = 40
const MIN_SIMILARITY = 0.85
const MIN_LEAD_OVER_RUNNER_UP = 0.05

export type CardNameIndex = {
  names: string[]
  faces: { key: string; nameIndex: number; wholeName: boolean; trigramCount: number }[]
  facesByTrigram: Map<string, number[]>
}

export type CardNameMatch = { name: string; similarity: number }

function matchKey(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function trigrams(key: string) {
  const padded = `  ${key} `
  const grams = new Set<string>()
  for (let start = 0; start + 3 <= padded.length; start++) grams.add(padded.slice(start, start + 3))
  return grams
}

function similarity(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    previous = current
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length, 1)
}

export function cardNameIndex(names: string[]): CardNameIndex {
  const faces = names.flatMap((name, nameIndex) =>
    [...new Set([name, ...name.split(" // ")])].map((face) => {
      const key = matchKey(face)
      return { key, nameIndex, wholeName: face === name, trigramCount: trigrams(key).size }
    }),
  )
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

function rankedNames(index: CardNameIndex, line: string) {
  const key = matchKey(line)
  if (key.length < 3) return []
  const lineTrigrams = trigrams(key)
  const sharedTrigrams = new Map<number, number>()
  for (const gram of lineTrigrams)
    for (const faceIndex of index.facesByTrigram.get(gram) ?? [])
      sharedTrigrams.set(faceIndex, (sharedTrigrams.get(faceIndex) ?? 0) + 1)
  const overlap = (faceIndex: number, shared: number) =>
    shared / (lineTrigrams.size + index.faces[faceIndex].trigramCount - shared)
  const bestByName = new Map<number, { similarity: number; wholeName: boolean; face: string }>()
  for (const [faceIndex] of [...sharedTrigrams]
    .sort((a, b) => overlap(b[0], b[1]) - overlap(a[0], a[1]))
    .slice(0, SHORTLIST_SIZE)) {
    const face = index.faces[faceIndex]
    const score = {
      similarity: similarity(key, face.key),
      wholeName: face.wholeName,
      face: face.key,
    }
    const current = bestByName.get(face.nameIndex)
    if (!current || score.similarity > current.similarity) bestByName.set(face.nameIndex, score)
  }
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
    return { name: index.names[best.nameIndex], similarity: best.similarity }
  }
  return undefined
}
