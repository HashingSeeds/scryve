/* eslint-disable no-console -- why: spike script that prints a report. */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { cardNameIndex, firstUnambiguousCardName } from "../../src/features/decks/cardNameMatch"
import { cardTextLinesTopFirst } from "../../src/features/decks/cardScan"

type Line = { text: string; x: number; y: number; h: number }

const [namesFile, readsFile] = process.argv.slice(2)
const index = cardNameIndex(JSON.parse(readFileSync(namesFile, "utf8")).data)
const truth: Record<string, string[]> = JSON.parse(
  readFileSync(join(__dirname, "truth.json"), "utf8"),
)
const reads: Record<string, { ms: number; lines: Line[] }> = JSON.parse(
  readFileSync(readsFile, "utf8"),
)

const tally = (names: string[]) =>
  names.reduce(
    (counts, name) => counts.set(name, (counts.get(name) ?? 0) + 1),
    new Map<string, number>(),
  )

for (const [file, { ms, lines }] of Object.entries(reads).sort()) {
  // why: one name bar is read at several turns and in overlapping tiles, but is one card.
  const kept: (Line & { name: string })[] = []
  for (const line of lines) {
    const match = firstUnambiguousCardName(index, cardTextLinesTopFirst([line.text]))
    if (!match) continue
    const same = kept.find(
      (card) =>
        card.name === match.name &&
        Math.hypot(card.x - line.x, card.y - line.y) < 3 * Math.min(card.h, line.h),
    )
    if (same) same.h = Math.min(same.h, line.h)
    else kept.push({ ...line, name: match.name })
  }
  const expected = truth[file[0]]
  const want = tally(expected)
  const got = tally(kept.map((card) => card.name))
  let right = 0
  const wrong: string[] = []
  for (const [name, count] of got) {
    const correct = Math.min(count, want.get(name) ?? 0)
    right += correct
    if (count > correct) wrong.push(`${name}${count - correct > 1 ? ` x${count - correct}` : ""}`)
  }
  const missed = [...want].flatMap(([name, count]) => {
    const short = count - Math.min(count, got.get(name) ?? 0)
    return short ? [`${name}${short > 1 ? ` x${short}` : ""}`] : []
  })
  console.log(
    `${file.padEnd(14)} ${right}/${expected.length} right, ${wrong.length} wrong, ${ms} ms`,
  )
  if (wrong.length) console.log(`   wrong:  ${wrong.join("; ")}`)
  if (missed.length) console.log(`   missed: ${missed.join("; ")}`)
}
