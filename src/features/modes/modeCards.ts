import { translate } from "@/i18n/translate"

import type { ModeCard } from "../../../convex/lib/modeDecks"
import type { ModeLogEntry, PlanarFace } from "../../../convex/lib/tableModes"

type ImageSize = "normal" | "large" | "art_crop"

/** why: Scryfall's CDN path is built from the id alone, so a card shows without an API call. */
export const modeCardImage = (card: Pick<ModeCard, "id">, size: ImageSize = "normal") =>
  `https://cards.scryfall.io/${size}/front/${card.id[0]}/${card.id[1]}/${card.id}.jpg`

export const faceLabel = (face: PlanarFace) => translate(`board:planar.faces.${face}`)

export function modeLogText(
  entry: ModeLogEntry,
  nameOf: (playerId: string) => string,
  cards: { planar: readonly ModeCard[]; scheme: readonly ModeCard[] },
) {
  const name = nameOf(entry.playerId)
  const plane = entry.card === undefined ? undefined : cards.planar[entry.card]?.name
  const scheme = entry.card === undefined ? undefined : cards.scheme[entry.card]?.name
  switch (entry.kind) {
    case "rolled":
      return entry.cost
        ? translate("board:planar.rolledPaid", {
            name,
            face: faceLabel(entry.face ?? "blank"),
            cost: entry.cost,
          })
        : translate("board:planar.rolledFree", { name, face: faceLabel(entry.face ?? "blank") })
    case "walked":
      return plane
        ? translate("board:planar.walkedTo", { name, plane })
        : translate("board:planar.walked", { name })
    case "reset":
      return translate("board:planar.resetBy", { name })
    case "revealed":
      return scheme
        ? translate("board:scheme.revealed", { name, scheme })
        : translate("board:scheme.revealedOwn", { name })
    case "abandoned":
      return translate("board:scheme.abandoned", { name, scheme: scheme ?? "" })
  }
}
