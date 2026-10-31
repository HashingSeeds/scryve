import type { DeckCard } from "./deckCards"
import {
  lookupKey,
  parsePrintingReference,
  readPastedDeckList,
} from "../../../convex/lib/pastedDeckList"

export type ImportProblem = { line: string; kind: "unmatched" | "invalid" }

type Board = NonNullable<DeckCard["board"]>

export function lineCardName(line: string) {
  return parsePrintingReference(line).name
}

export function pastedLines(list: string, reference: string) {
  const wanted = lookupKey(parsePrintingReference(reference))
  const copies = new Map<Board, number>()
  for (const entry of readPastedDeckList(list).entries) {
    if (lookupKey(entry) !== wanted) continue
    copies.set(entry.board, (copies.get(entry.board) ?? 0) + entry.quantity)
  }
  return copies.size
    ? [...copies].map(([board, quantity]) => ({ quantity, board }))
    : [{ quantity: 1, board: "main" as Board }]
}
