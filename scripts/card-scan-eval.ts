/** why: Scryfall's live name lists keep this out of CI, so scanner accuracy regressions go untested. */
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import type { CardPhotoText } from "../modules/card-text-reader"
import {
  cardNameIndex,
  firstUnambiguousCardName,
  nameFromCardTop,
  type CardNameIndex,
} from "../src/features/decks/cardNameMatch"
import { cardTextLinesTopFirst } from "../src/features/decks/cardScan"
import { framedLinesFromCardTop, type ScanFraming } from "../src/features/decks/cardTextLayout"

const TEXT_ONLY_NAME_LINES = 6
const LABEL_LINES_FROM_TOP = 3
const SCRYFALL = "https://api.scryfall.com"
const scansDir = path.join(__dirname, "card-scans")

type RecordedScan = { card: string } & (
  { textBlocks: string[] } | { photo: CardPhotoText; framing: ScanFraming }
)

async function scryfall(url: string) {
  await new Promise((resolve) => setTimeout(resolve, 120))
  const response = await fetch(url, {
    headers: {
      "User-Agent": "ScryveDeckBuilder/1.0 (https://scryve.sow.care)",
      "Accept": "application/json",
    },
  })
  return (await response.json()) as {
    data: (string | { name: string; flavor_name?: string })[]
    next_page?: string
  }
}

async function liveIndex() {
  const names = (await scryfall(`${SCRYFALL}/catalog/card-names`)).data as string[]
  const alternates: [string, string][] = []
  let next: string | undefined = `${SCRYFALL}/cards/search?q=has%3Aflavorname&unique=prints`
  while (next) {
    const page = await scryfall(next)
    for (const card of page.data)
      if (typeof card === "object" && card.flavor_name)
        alternates.push([card.flavor_name, card.name])
    next = page.next_page
  }
  return cardNameIndex(names, alternates)
}

function scannedName(index: CardNameIndex, scan: RecordedScan) {
  if ("textBlocks" in scan) {
    const lines = cardTextLinesTopFirst(scan.textBlocks).slice(0, TEXT_ONLY_NAME_LINES)
    return firstUnambiguousCardName(index, lines)
  }
  return nameFromCardTop(index, framedLinesFromCardTop(scan.photo, scan.framing))
}

function labeledCardIsAtFrameTop(index: CardNameIndex, scan: RecordedScan) {
  if ("textBlocks" in scan) return true
  const top = cardTextLinesTopFirst(framedLinesFromCardTop(scan.photo, scan.framing))
  return top
    .slice(0, LABEL_LINES_FROM_TOP)
    .some((line) => firstUnambiguousCardName(index, [line])?.name === scan.card)
}

async function main() {
  const index = await liveIndex()
  for (const file of readdirSync(scansDir).filter((name) => name.endsWith(".json"))) {
    const scans: RecordedScan[] = JSON.parse(readFileSync(path.join(scansDir, file), "utf8"))
    const scored = scans.filter((scan) => labeledCardIsAtFrameTop(index, scan))
    const wrong: string[] = []
    let unsure = 0
    for (const scan of scored) {
      const match = scannedName(index, scan)
      if (!match) unsure++
      else if (match.name !== scan.card) wrong.push(`${match.name} (was ${scan.card})`)
    }
    const right = scored.length - unsure - wrong.length
    const skipped = scans.length - scored.length
    console.log(
      `${file}: ${scored.length} photos, ${right} right, ${wrong.length} wrong, ${unsure} unsure` +
        (skipped ? ` (${skipped} skipped: labeled card not at the top of the frame)` : ""),
    )
    for (const entry of wrong) console.log(`  wrong: ${entry}`)
  }
}

void main()
