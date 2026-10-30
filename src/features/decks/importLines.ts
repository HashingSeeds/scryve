import type { DeckCard } from "./deckCards"

export type ImportProblem = { line: string; kind: "unmatched" | "invalid" }

type Board = NonNullable<DeckCard["board"]>
type Section = Board | "skip" | "about"

const ENTRY = /^(\d{1,3})\s*x?\s+(.+)$/i
const PRINTING = /\s+\([A-Z0-9]{2,8}\)(?:\s+[A-Za-z0-9-]+)?$/i
const FINISH = /\s+\*[A-Z0-9-]+\*\s*$/i
const HEADINGS = new Map<string, Section>([
  ["commander", "commander"],
  ["commanders", "commander"],
  ["main", "main"],
  ["mainboard", "main"],
  ["deck", "main"],
  ["side", "sideboard"],
  ["sideboard", "sideboard"],
  ["companion", "sideboard"],
  ["about", "about"],
  ["maybeboard", "skip"],
  ["considering", "skip"],
  ["tokens", "skip"],
])

export function lineCardName(line: string) {
  return line.replace(FINISH, "").replace(PRINTING, "").trim()
}

const referenceKey = (reference: string) => reference.replace(FINISH, "").trim().toLowerCase()

function headinglessSecondBlock(lines: string[]) {
  const blocks: { start: number; cards: number }[] = []
  let block: (typeof blocks)[number] | undefined
  for (const [index, source] of lines.entries()) {
    const line = source.trim()
    if (!line) {
      block = undefined
      continue
    }
    const match = line.match(ENTRY)
    if (!match) return undefined
    if (!block) {
      block = { start: index, cards: 0 }
      blocks.push(block)
    }
    block.cards += Number(match[1])
  }
  const [main, trailing] = blocks
  if (blocks.length !== 2 || !main || !trailing) return undefined
  const board: Board =
    trailing.cards <= 2 && main.cards + trailing.cards === 100 ? "commander" : "sideboard"
  return { start: trailing.start, board }
}

export function pastedLines(list: string, reference: string) {
  const wanted = referenceKey(reference)
  const lines = list.split(/\r?\n/)
  const trailing = headinglessSecondBlock(lines)
  const copies = new Map<Board, number>()
  let section: Section = "main"
  for (const [index, source] of lines.entries()) {
    const line = source.trim()
    if (index === trailing?.start) section = trailing.board
    if (!line && section === "about") section = "main"
    if (!line || line.startsWith("#") || line.startsWith("//")) continue
    const heading = HEADINGS.get(line.replace(/[:\s]+$/, "").toLowerCase())
    if (heading) {
      section = heading
      continue
    }
    if (section === "skip" || section === "about") continue
    const sideboardPrefix = /^SB:\s*/i.test(line)
    const match = line.replace(/^SB:\s*/i, "").match(ENTRY)
    if (!match || referenceKey(match[2]) !== wanted) continue
    const board = sideboardPrefix ? "sideboard" : section
    copies.set(board, (copies.get(board) ?? 0) + Number(match[1]))
  }
  return copies.size
    ? [...copies].map(([board, quantity]) => ({ quantity, board }))
    : [{ quantity: 1, board: "main" as Board }]
}
