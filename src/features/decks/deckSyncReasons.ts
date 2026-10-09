// why: these reasons are stored on failed writes and compared by the screen, so they live outside the storage-bound write modules.
export const DECK_CONFLICT_REASON = "Deck changed on another device. Choose which version to keep."
export const DECK_VERSION_CONFLICT_REASON =
  "Deck cards changed on another device. Choose which card list to keep."
export const DECK_VERSION_QUEUE_CONFLICT_REASON =
  "An earlier card edit conflicted. Choose which card list to keep."
