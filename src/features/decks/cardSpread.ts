import { firstUnambiguousCardName, type CardNameIndex, type CardNameMatch } from "./cardNameMatch"
import { cardTextLinesTopFirst } from "./cardScan"
import type { CardPhotoText, CardTextLine } from "../../../modules/card-text-reader"

export type SpreadLine = { line: CardTextLine; match?: CardNameMatch }

/** why: in a spread each visible name bar is one card, so four copies must read as four lines. */
export function namesInSpread(index: CardNameIndex, photo: CardPhotoText): SpreadLine[] {
  return photo.lines.map((line) => {
    const match = firstUnambiguousCardName(index, cardTextLinesTopFirst([line.text]))
    return match ? { line, match } : { line }
  })
}
