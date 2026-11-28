import { Modal } from "react-native"

import type { SeatDeckPick } from "@/features/connected/LobbySeatList"
import { DeckLibrary } from "@/features/decks/DeckLibrary"
import { translate } from "@/i18n/translate"

export function LobbyDeckPicker({
  request,
  onClose,
  onAddDeck,
}: {
  request: SeatDeckPick
  onClose: () => void
  onAddDeck?: () => void
}) {
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <DeckLibrary
        back={{ label: translate("common:appNavigation.lobby"), onPress: onClose }}
        initialSystem={request.system}
        pickableIds={request.deckIds}
        onSelect={(deck) => {
          onClose()
          request.pick(deck.deckId)
        }}
        onAddDeck={() => {
          onClose()
          onAddDeck?.()
        }}
      />
    </Modal>
  )
}
