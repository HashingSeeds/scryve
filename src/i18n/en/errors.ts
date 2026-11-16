const errors = {
  accountChanged: "Consent was given by a different account",
  alreadyHosting: "You already host a lobby or active game; resume it before hosting another",
  // A player's marker on the game board: its color and its shape.
  appearanceTaken: "Another player already claimed that color or shape",
  blockedPlayer: "You cannot join a game with a player you blocked or who blocked you",
  deckAlreadyArchived: "Deck already deleted",
  deckArchived: "This deck was deleted",
  deckGameImmutable: "Create a new deck to change game systems",
  deckListTooLarge: "Deck list is too large",
  deckNotFound: "Deck not found",
  // Top Decks are decks that placed well in recent tournaments. A feature, not a service name.
  deckProviderUnavailable: "Top Decks are temporarily unavailable",
  deckRequired: "This lobby requires every player to choose a deck",
  // ja: Game system means the game: ゲーム未設定のロビーでは、デッキを必須にできません.
  // fr: "System" is the game (Magic, Pokémon…): say jeu, never système (Aucun jeu; salon sans jeu choisi).
  deckRequirementNotSupported: "Decks cannot be required for a system-less lobby",
  deckSelectionNotAllowed: "Decks can only be selected in a lobby",
  detailsBatchTooLarge: "Too many cards requested at once",
  emptyDeckList: "No cards were found in this deck list",
  forbidden: "Game unavailable",
  // A lobby is the waiting room where players join before a connected game starts.
  gameFull: "Lobby is full",
  // hi: “Game membership” means being one of this game's players, not a paid plan; never सदस्यता: “आप इस गेम में शामिल नहीं हैं”.
  gameMembershipRequired: "Game membership required",
  gameNotActive: "Game is not active",
  gameNotFound: "Game not found",
  invalidCardImage: "Card image must be a public HTTPS URL",
  invalidCardName: "Card name is invalid",
  invalidCardQuantity: "Card quantity must be {{min}}–{{max}}",
  invalidClientTimestamp: "Invalid client timestamp",
  invalidDeckIdentifier: "Invalid deck identifier",
  invalidDeckList: "This YDKE link is invalid",
  invalidDeckSection: "Deck section is invalid",
  invalidDeviceId: "Invalid device identifier",
  // An invite link or code to join a connected game.
  invalidInvite: "Invite is invalid, expired, or revoked",
  invalidLifeDelta: "Life delta must be a non-zero whole number from {{min}} to {{max}}",
  invalidLocalId: "Guest local ID must be a UUID",
  invalidLocalUpdatedAt: "Guest timestamp is invalid",
  invalidSyncId: "Deck ID must be a UUID or deck ID",
  invalidTableAction: "This table change no longer applies",
  invalidVersionUpdate: "Provide a name or note change",
  lastVersion: "A deck needs at least one version",
  limitlessInvalidResponse: "The deck response is too large or empty.",
  lobbySettingsNotAllowed: "Lobby settings can only change in a lobby",
  matchFinished: "This match already ended",
  matchNotFound: "Match not found",
  occupiedSeat: "Player count cannot remove an occupied seat",
  preconInvalidResponse: "The official deck service returned an invalid response",
  queryTooLong: "Choose fewer filters or shorten your search.",
  scryfallRateLimited: "Scryfall requests are paused. Try again shortly.",
  // A seat is one player's place in a connected game.
  seatAlreadyHeld: "You already hold a seat in this game",
  // Another player already took this seat in the connected game.
  seatTaken: "Seat already claimed",
  syncOwnerChanged: "The signed-in account changed",
  // Attempts to join a connected game, not to sign in.
  // hi: Joining is शामिल होना, never जोड़ना (to add): “शामिल होने की बहुत ज़्यादा कोशिशें हो गईं; एक मिनट रुककर फिर कोशिश करें”.
  tooManyJoinAttempts: "Too many join attempts; wait a minute and try again",
  unauthenticated: "Authentication required",
  updateRequired: "Update Scryve to join this game",
  ygoprodeckInvalidResponse: "The deck response is too large or empty.",
}

export default errors
