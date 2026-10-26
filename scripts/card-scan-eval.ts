/** why: scores the card scanner against recorded real scans; Scryfall's live name list keeps it out of CI. Run: pnpm tsx scripts/card-scan-eval.ts */
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
const scansDir = path.join(__dirname, "card-scans")

type RecordedScan = { card: string } & (
  { textBlocks: string[] } | { photo: CardPhotoText; framing: ScanFraming }
)

function scannedName(index: CardNameIndex, scan: RecordedScan) {
  if ("textBlocks" in scan) {
    const lines = cardTextLinesTopFirst(scan.textBlocks).slice(0, TEXT_ONLY_NAME_LINES)
    return firstUnambiguousCardName(index, lines)
  }
  return nameFromCardTop(index, framedLinesFromCardTop(scan.photo, scan.framing))
}

async function main() {
  const response = await fetch("https://api.scryfall.com/catalog/card-names", {
    headers: {
      "User-Agent": "ScryveDeckBuilder/1.0 (https://scryve.sow.care)",
      "Accept": "application/json",
    },
  })
  const { data } = (await response.json()) as { data: string[] }
  const index = cardNameIndex(data)
  for (const file of readdirSync(scansDir).filter((name) => name.endsWith(".json"))) {
    const scans: RecordedScan[] = JSON.parse(readFileSync(path.join(scansDir, file), "utf8"))
    const wrong: string[] = []
    let unsure = 0
    for (const scan of scans) {
      const match = scannedName(index, scan)
      if (!match) unsure++
      else if (match.name !== scan.card) wrong.push(`${match.name} (was ${scan.card})`)
    }
    const right = scans.length - unsure - wrong.length
    console.log(
      `${file}: ${scans.length} photos, ${right} right, ${wrong.length} wrong, ${unsure} unsure`,
    )
    for (const entry of wrong) console.log(`  wrong: ${entry}`)
  }
}

void main()
