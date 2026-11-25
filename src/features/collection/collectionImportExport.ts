import { randomUUID } from "expo-crypto"

import { catalogDb } from "@/storage/catalogDb"
import type { StoredCollectionEntry } from "@/storage/localDbTypes"

import { normalizePrintingName } from "./catalogSync"
import { addCollectionCards, type AddCollectionCardInput } from "./collectionStore"

export interface ParsedCollectionRow {
  quantity: number
  name: string
  setCode: string
  collectorNumber: string
  finish: "nonfoil" | "foil" | "etched"
  condition: string
  language: string
  acquiredCents?: number
  notes?: string
}

const VALID_CONDITIONS = new Set(["NM", "LP", "MP", "HP", "DMG"])

function normalizeCondition(raw: string | undefined): string {
  if (!raw) return "NM"
  const upper = raw.trim().toUpperCase()
  if (VALID_CONDITIONS.has(upper)) return upper
  if (upper.includes("NEAR") || upper === "M" || upper === "MINT") return "NM"
  if (upper.includes("LIGHT") || upper === "EX" || upper === "SP") return "LP"
  if (upper.includes("MOD") || upper === "GD" || upper === "VG") return "MP"
  if (upper.includes("HEAV") || upper === "PL") return "HP"
  if (upper.includes("DAM") || upper === "PO") return "DMG"
  return "NM"
}

function normalizeFinish(raw: string | undefined): "nonfoil" | "foil" | "etched" {
  if (!raw) return "nonfoil"
  const lower = raw.trim().toLowerCase()
  if (lower.includes("etch")) return "etched"
  if (lower === "foil" || lower === "true" || lower === "yes" || lower === "1" || lower === "*f*") {
    return "foil"
  }
  return "nonfoil"
}

function parseCents(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const cleaned = raw.replace(/[^0-9.]/g, "")
  if (!cleaned) return undefined
  const value = Number(cleaned)
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : undefined
}

function parseCsvRecords(text: string): string[][] {
  const records: string[][] = []
  let fields: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      fields.push(current.trim())
      current = ""
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1
      fields.push(current.trim())
      if (fields.some((cell) => cell.length > 0)) records.push(fields)
      fields = []
      current = ""
    } else {
      current += ch
    }
  }
  fields.push(current.trim())
  if (fields.some((cell) => cell.length > 0)) records.push(fields)
  return records
}

function parsePlainLine(line: string): ParsedCollectionRow | undefined {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) return undefined
  const match =
    /^(?:(\d+)\s*[xX]?\s+)?(.+?)(?:\s+\(([A-Za-z0-9]{2,6})\)|\s+\[([A-Za-z0-9]{2,6})\])?(?:\s+([0-9]+[a-zA-Z]?))?(?:\s+(\*[FfEe]\*))?$/.exec(
      trimmed,
    )
  if (!match) return undefined
  const quantity = Math.max(1, Number(match[1] ?? "1") || 1)
  const name = match[2].trim()
  if (!name) return undefined
  const setCode = (match[3] ?? match[4] ?? "").toLowerCase()
  const collectorNumber = (match[5] ?? "").toLowerCase()
  const finishTag = match[6]?.toLowerCase()
  const finish =
    finishTag === "*e*" ? "etched" : finishTag === "*f*" ? "foil" : ("nonfoil" as const)
  return {
    quantity,
    name,
    setCode,
    collectorNumber,
    finish,
    condition: "NM",
    language: "en",
  }
}

export function parseCollectionImport(text: string): {
  rows: ParsedCollectionRow[]
  skipped: number
} {
  if (!text.trim()) return { rows: [], skipped: 0 }

  const csvRecords = parseCsvRecords(text)
  if (csvRecords.length === 0) return { rows: [], skipped: 0 }
  const firstColumns = csvRecords[0].map((col) => col.toLowerCase())
  const nameCol = firstColumns.findIndex((col) => col === "name" || col === "card name")
  const isCsvHeader = nameCol >= 0 && firstColumns.length >= 2

  const rows: ParsedCollectionRow[] = []
  let skipped = 0

  if (isCsvHeader) {
    const qtyCol = firstColumns.findIndex(
      (col) => col === "count" || col === "quantity" || col === "qty",
    )
    const setCol = firstColumns.findIndex(
      (col) => col === "edition" || col === "set code" || col === "set" || col === "edition code",
    )
    const numCol = firstColumns.findIndex(
      (col) => col === "collector number" || col === "card number" || col === "number",
    )
    const foilCol = firstColumns.findIndex((col) => col === "foil" || col === "finish")
    const condCol = firstColumns.findIndex((col) => col === "condition")
    const langCol = firstColumns.findIndex((col) => col === "language")
    const priceCol = firstColumns.findIndex(
      (col) => col === "purchase price" || col === "price" || col === "acquired price",
    )
    const notesCol = firstColumns.findIndex((col) => col === "notes" || col === "tags")

    for (let i = 1; i < csvRecords.length; i += 1) {
      const cols = csvRecords[i]
      const name = cols[nameCol]?.trim()
      if (!name) {
        skipped += 1
        continue
      }
      const rawQty = qtyCol >= 0 ? Number(cols[qtyCol]) : 1
      const quantity = Number.isFinite(rawQty) && rawQty > 0 ? Math.floor(rawQty) : 1
      rows.push({
        quantity,
        name,
        setCode: (setCol >= 0 ? (cols[setCol] ?? "") : "").toLowerCase(),
        collectorNumber: (numCol >= 0 ? (cols[numCol] ?? "") : "").toLowerCase(),
        finish: normalizeFinish(foilCol >= 0 ? cols[foilCol] : undefined),
        condition: normalizeCondition(condCol >= 0 ? cols[condCol] : undefined),
        language: (langCol >= 0 && cols[langCol] ? cols[langCol].slice(0, 5) : "en").toLowerCase(),
        acquiredCents: parseCents(priceCol >= 0 ? cols[priceCol] : undefined),
        notes: notesCol >= 0 && cols[notesCol] ? cols[notesCol] : undefined,
      })
    }
    return { rows, skipped }
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  for (const line of lines) {
    const parsed = parsePlainLine(line)
    if (parsed) rows.push(parsed)
    else skipped += 1
  }
  return { rows, skipped }
}

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function exportCollectionCsv(entries: readonly StoredCollectionEntry[]): string {
  const header = "Count,Name,Edition,Collector Number,Condition,Language,Foil,Purchase Price,Notes"
  const lines = entries.map((entry) =>
    [
      String(entry.quantity),
      entry.name,
      entry.setCode.toUpperCase(),
      entry.collectorNumber,
      entry.condition,
      entry.language.toUpperCase(),
      entry.finish === "nonfoil" ? "" : entry.finish,
      entry.acquiredCents !== undefined ? (entry.acquiredCents / 100).toFixed(2) : "",
      entry.notes ?? "",
    ]
      .map(escapeCsvCell)
      .join(","),
  )
  return [header, ...lines].join("\n")
}

export function importCollectionText(
  text: string,
  game: string,
  binderId?: string,
): { imported: number; skipped: number } {
  const { rows, skipped } = parseCollectionImport(text)
  if (rows.length === 0) return { imported: 0, skipped }

  const inputs = rows.map((row): AddCollectionCardInput => {
    const normalized = normalizePrintingName(row.name)
    const exactCandidate =
      row.setCode && row.collectorNumber
        ? catalogDb.findPrintingBySetNumber(game, row.setCode, row.collectorNumber)
        : undefined
    const exact =
      exactCandidate && exactCandidate.nameNormalized === normalized ? exactCandidate : undefined
    const byName = exact ? [] : catalogDb.findPrintingsByName(game, normalized)

    let matched = exact
    if (!matched && row.setCode && !row.collectorNumber) {
      matched = byName.find((item) => item.setCode === row.setCode)
    }
    if (!matched && !row.setCode && !row.collectorNumber) {
      matched = byName[0]
    }

    const cardId = matched?.cardId ?? byName[0]?.cardId ?? `name:${normalized}`
    const printingId =
      matched?.printingId ??
      (row.setCode || row.collectorNumber
        ? `custom:${normalized}:${row.setCode}:${row.collectorNumber}`
        : `custom:${randomUUID()}`)

    return {
      game,
      cardId,
      printingId,
      name: matched?.name ?? row.name,
      setCode: matched?.setCode ?? row.setCode,
      collectorNumber: matched?.collectorNumber ?? row.collectorNumber,
      finish: row.finish,
      condition: row.condition,
      language: row.language,
      quantity: row.quantity,
      binderId,
      acquiredCents: row.acquiredCents,
      notes: row.notes,
      imageUrl: matched?.imageUrl,
      smallImageUrl: matched?.smallImageUrl,
    }
  })
  addCollectionCards(inputs)
  return { imported: inputs.length, skipped }
}
