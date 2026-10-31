import { normalizeCardName } from "./games/cards"

export type PastedDeckBoard = "main" | "sideboard" | "commander"

export type PastedDeckEntry = {
  name: string
  quantity: number
  board: PastedDeckBoard
  scryfallId?: string
  setCode?: string
  collectorNumber?: string
  originalReference?: string
}

type PastedSection = PastedDeckBoard | "companion" | "about" | "ignore"

const PASTED_ENTRY = /^(\d{1,3})\s*x?\s+(.+)$/i
const FINISH = /\s+\*[A-Z0-9-]+\*\s*$/i
const SIDEBOARD_PREFIX = /^SB:\s*/i
const HEADINGS = new Map<string, PastedSection>([
  ["commander", "commander"],
  ["commanders", "commander"],
  ["main", "main"],
  ["mainboard", "main"],
  ["deck", "main"],
  ["side", "sideboard"],
  ["sideboard", "sideboard"],
  ["companion", "companion"],
  ["about", "about"],
  ["maybeboard", "ignore"],
  ["considering", "ignore"],
  ["tokens", "ignore"],
])

function sectionHeading(line: string) {
  return HEADINGS.get(line.replace(/[:\s]+$/, "").toLowerCase())
}

function isPastedComment(line: string) {
  return line.startsWith("#") || line.startsWith("//")
}

function headinglessSecondBlock(lines: string[]) {
  const blocks: Array<{ start: number; cards: number }> = []
  let block: (typeof blocks)[number] | undefined
  for (const [index, sourceLine] of lines.entries()) {
    const line = sourceLine.trim()
    if (!line) {
      block = undefined
      continue
    }
    const match = line.match(PASTED_ENTRY)
    if (!match) return undefined
    if (!block) {
      block = { start: index, cards: 0 }
      blocks.push(block)
    }
    block.cards += Number(match[1])
  }
  const [main, trailing] = blocks
  if (blocks.length !== 2 || !main || !trailing) return undefined
  const board: PastedDeckBoard =
    trailing.cards <= 2 && main.cards + trailing.cards === 100 ? "commander" : "sideboard"
  return { start: trailing.start, board }
}

export function parsePrintingReference(reference: string) {
  const withoutFinish = reference.replace(FINISH, "").trim()
  const printing = withoutFinish.match(/^(.+?)\s+\(([A-Z0-9]{2,8})\)(?:\s+([A-Za-z0-9-]+))?$/i)
  return printing
    ? {
        name: printing[1].trim(),
        setCode: printing[2].toLowerCase(),
        ...(printing[3] ? { collectorNumber: printing[3] } : {}),
        originalReference: reference.trim(),
      }
    : { name: withoutFinish }
}

export function lookupKey(
  entry: Pick<PastedDeckEntry, "name" | "scryfallId" | "setCode" | "collectorNumber">,
) {
  if (entry.scryfallId) return `id:${entry.scryfallId.toLowerCase()}`
  if (entry.setCode && entry.collectorNumber)
    return `printing:${entry.setCode.toLowerCase()}:${entry.collectorNumber.toLowerCase()}`
  return `name:${entry.name.toLocaleLowerCase()}${entry.setCode ? `:set:${entry.setCode.toLowerCase()}` : ""}`
}

export function printingKey(entry: PastedDeckEntry) {
  return `${entry.board}:${lookupKey(entry)}`
}

export function readPastedDeckList(list: string) {
  const lines = list.split(/\r?\n/)
  const trailing = headinglessSecondBlock(lines)
  let board: PastedSection = "main"
  const entries = new Map<string, PastedDeckEntry>()
  const companions: PastedDeckEntry[] = []
  const invalidLines: string[] = []
  const add = (entry: PastedDeckEntry) => {
    const key = printingKey(entry)
    const current = entries.get(key)
    entries.set(key, { ...entry, quantity: (current?.quantity ?? 0) + entry.quantity })
  }

  for (const [index, sourceLine] of lines.entries()) {
    const line = sourceLine.trim()
    if (index === trailing?.start) board = trailing.board
    if (!line && board === "about") board = "main"
    if (!line || isPastedComment(line)) continue
    const nextBoard = sectionHeading(line)
    if (nextBoard) {
      board = nextBoard
      continue
    }
    if (board === "ignore" || board === "about") continue
    const sideboardPrefix = SIDEBOARD_PREFIX.test(line)
    const match = line.replace(SIDEBOARD_PREFIX, "").match(PASTED_ENTRY)
    const quantity = match ? Number(match[1]) : 0
    const reference = parsePrintingReference(match?.[2] ?? "")
    if (!match || !reference.name || quantity < 1 || quantity > 999) {
      invalidLines.push(sourceLine)
      continue
    }
    const entry: PastedDeckEntry = {
      ...reference,
      board: sideboardPrefix || board === "companion" ? "sideboard" : board,
      quantity,
    }
    if (board === "companion") companions.push(entry)
    else add(entry)
  }
  const sideboardNames = new Set(
    [...entries.values()]
      .filter((entry) => entry.board === "sideboard")
      .map((entry) => normalizeCardName(entry.name)),
  )
  companions
    .filter((companion) => !sideboardNames.has(normalizeCardName(companion.name)))
    .forEach(add)
  return { entries: [...entries.values()], invalidLines }
}
