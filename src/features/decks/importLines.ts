import type { DeckCard } from "./deckCards"

export type ImportProblem = { line: string; kind: "unmatched" | "invalid" }

const ENTRY = /^(?:SB:\s*)?(\d{1,3})\s*x?\s+(.+)$/i
const PRINTING = /\s+\([A-Z0-9]{2,8}\)(?:\s+[A-Za-z0-9-]+)?$/i
const FINISH = /\s+\*[A-Z0-9-]+\*\s*$/i
const HEADINGS = new Map<string, NonNullable<DeckCard["board"]>>([
  ["commander", "commander"],
  ["commanders", "commander"],
  ["main", "main"],
  ["mainboard", "main"],
  ["deck", "main"],
  ["side", "sideboard"],
  ["sideboard", "sideboard"],
])

export function lineCardName(line: string) {
  return line.replace(FINISH, "").replace(PRINTING, "").trim()
}

type Board = NonNullable<DeckCard["board"]>

const referenceKey = (reference: string) => reference.replace(FINISH, "").trim().toLowerCase()

export function pastedLines(list: string, reference: string) {
  const wanted = referenceKey(reference)
  const copies = new Map<Board, number>()
  let board: Board = "main"
  for (const source of list.split(/\r?\n/)) {
    const line = source.trim()
    const heading = HEADINGS.get(line.replace(/[:\s]+$/, "").toLowerCase())
    if (heading) {
      board = heading
      continue
    }
    const match = line.match(ENTRY)
    if (!match || referenceKey(match[2]) !== wanted) continue
    const lineBoard = /^SB:/i.test(line) ? "sideboard" : board
    copies.set(lineBoard, (copies.get(lineBoard) ?? 0) + Number(match[1]))
  }
  return copies.size
    ? [...copies].map(([section, quantity]) => ({ quantity, board: section }))
    : [{ quantity: 1, board: "main" as Board }]
}
