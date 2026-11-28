import { useRef, useState } from "react"

import { useSheetPresence } from "@/components/useSheetPresence"
import { PrintingPickerSheet } from "@/features/collection/PrintingPickerSheet"

import { systemDefinition } from "../../../convex/lib/systems"

type PrintedCard = {
  name: string
  oracleId?: string
  scryfallId?: string
  printingId?: string
  imageUrl?: string
  smallImageUrl?: string
}

/**
 * why: a deck card's sheet offers Change printing. iOS can't present the printing list while the
 * card's sheet is still leaving, so the list opens from that sheet's onDismissed.
 */
export function useChangePrinting<Card extends PrintedCard>(game: string) {
  const afterFocus = useRef<Card>(undefined)
  const [card, setCard] = useState<Card>()
  const presence = useSheetPresence(card)
  const shown = presence.shown

  return {
    // why: the printing list comes from the local catalog, which only Scryfall games have.
    available: systemDefinition(game)?.integration.capabilities.cardCatalog.provider === "scryfall",
    start(focused: Card, closeFocus: () => void) {
      afterFocus.current = focused
      closeFocus()
    },
    focusDismissed() {
      const next = afterFocus.current
      afterFocus.current = undefined
      if (next) setCard(next)
    },
    sheet: (replace: (previous: Card, next: Card) => string | undefined) =>
      shown ? (
        <PrintingPickerSheet
          visible={presence.visible}
          game={game}
          cardName={shown.name}
          cardId={shown.oracleId}
          selectedPrintingId={shown.scryfallId ?? shown.printingId}
          choosesCopy={false}
          onPick={({ printing }) => {
            const error = replace(shown, {
              ...shown,
              scryfallId: printing.printingId,
              ...(shown.printingId ? { printingId: printing.printingId } : {}),
              imageUrl: printing.imageUrl ?? shown.imageUrl,
              smallImageUrl: printing.smallImageUrl ?? printing.imageUrl ?? shown.smallImageUrl,
            })
            if (!error) setCard(undefined)
          }}
          onClose={() => setCard(undefined)}
          onDismissed={presence.onDismissed}
        />
      ) : null,
  }
}
