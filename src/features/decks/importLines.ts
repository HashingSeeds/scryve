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

export function pastedLine(list: string, reference: string) {
  const wanted = reference.trim().toLowerCase()
  let board: NonNullable<DeckCard["board"]> = "main"
  for (const source of list.split(/\r?\n/)) {
    const line = source.trim()
    const heading = HEADINGS.get(line.replace(/[:\s]+$/, "").toLowerCase())
    if (heading) {
      board = heading
      continue
    }
    const match = line.match(ENTRY)
    if (match?.[2].replace(FINISH, "").trim().toLowerCase() !== wanted) continue
    return {
      quantity: Number(match[1]),
      board: /^SB:/i.test(line) ? ("sideboard" as const) : board,
    }
  }
  return { quantity: 1, board: "main" as const }
}
