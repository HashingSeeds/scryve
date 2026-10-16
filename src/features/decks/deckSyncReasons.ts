import { translate } from "@/i18n/translate"

// why: these reasons are stored on failed writes and compared by the screen, so they live outside the storage-bound write modules.
export const DECK_CONFLICT_REASON = "Deck changed on another device. Choose which version to keep."
export const DECK_REJECTED_REASON = "The server can't accept this edit. Discard it and edit again."
export const DECK_VERSION_CONFLICT_REASON =
  "Deck cards changed on another device. Choose which card list to keep."
export const DECK_VERSION_QUEUE_CONFLICT_REASON =
  "An earlier card edit conflicted. Choose which card list to keep."
export const DECK_VERSION_DRAFT_UNSYNCED_REASON =
  "This offline draft was never synced. Discard it and create the version again."
export const DECK_VERSION_REJECTED_REASON =
  "The server can't accept these changes. Discard them and edit again."

// why: stored reasons stay English so comparisons survive a language change; copy is translated when shown.
export function syncReasonMessage(reason: string) {
  switch (reason) {
    case DECK_CONFLICT_REASON:
      return translate("decks:syncReason.deckConflict")
    case DECK_REJECTED_REASON:
      return translate("decks:syncReason.deckRejected")
    case DECK_VERSION_CONFLICT_REASON:
      return translate("decks:syncReason.versionConflict")
    case DECK_VERSION_QUEUE_CONFLICT_REASON:
      return translate("decks:syncReason.versionQueueConflict")
    case DECK_VERSION_DRAFT_UNSYNCED_REASON:
      return translate("decks:syncReason.draftUnsynced")
    case DECK_VERSION_REJECTED_REASON:
      return translate("decks:syncReason.versionRejected")
    default:
      return reason
  }
}
