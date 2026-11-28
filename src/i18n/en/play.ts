const play = {
  playerNames: "Player names",
  startGame: "Start game",
  finish: "Finish",
  // Ends the game for everyone and records it as abandoned, with no result.
  abandon: "Abandon",
  ending: "Ending…",
  gameSummary: "Game summary",
  noGames: "No games yet",
  noGamesContent: "Finished games will appear here.",
  currentGame: {
    emptyHeading: "No active local game",
    // hi: Play is the tab: “आपका अगला गेम “खेलें” टैब में तैयार है।”
    emptyContent: "Your next game is ready on Play.",
    // Button that goes to the Play tab.
    openPlay: "Go to Play",
  },
  launch: {
    updateTitle: "This game needs an update",
    updateMessage:
      "A newer version of Scryve saved your game in progress, so this version can't open it. Update Scryve to keep playing. Your game is still saved.",
    checkForUpdates: "Check for updates",
    checkingForUpdates: "Checking…",
    noUpdate: "No update is available yet. Try again later, or contact Support.",
    updateCheckFailed: "Couldn't check for updates. Check your connection and try again.",
    contactSupport: "Contact Support",
    deleteGame: "Delete game",
    deleteGameTitle: "Delete this game?",
    deleteGameMessage: "It can't be recovered, even after you update.",
    // Cancels deleting the game this version can't open.
    keepGame: "Keep game",
    openAppStore: "Open App Store",
    openGooglePlay: "Open Google Play",
    staleTitle: "Continue game?",
    staleMessage_one:
      "This game has been waiting for more than {{count}} hour. Nothing was discarded.",
    staleMessage_other:
      "This game has been waiting for more than {{count}} hours. Nothing was discarded.",
    continue: "Continue",
    endGame: "End game",
  },
  // The three-choice row in game setup and on the first page: life totals alone, with turns, or with a chess clock.
  turnsChoice: {
    label: "Turns",
    lifeOnly: "Life only",
    lifeAndTurns: "Turns",
    // A chess clock: each player's time bank counts down only on their turn.
    chessClock: "Chess clock",
  },
  // Game setup: how the table decides who goes first. The board then shows only that.
  firstPlayerChoice: {
    // ja: Label for how the first player is decided: 先攻の決め方.
    label: "First player",
    off: "Off",
    roll: "Roll",
    // Two-player Pokémon and similar games flip a coin instead of rolling.
    flip: "Flip",
    // The players agree on who goes first themselves, then tap that player's card.
    pick: "We pick",
  },
  // Game setup, Magic only, shown under the player's deck: the group's house rule for how many mulligans (redrawing the opening hand) cost no card.
  freeMulligans: {
    label: "Free mulligans",
    none: "None",
    first: "First",
    all: "All",
  },
  whatYouPlay: {
    heading: "What do you play?",
    changeLater: "You can change this in Settings.",
    play: "Play",
    shareUsageHelper:
      "Off by default. Sharing helps us build what you want. Details in Privacy Policy.",
    sharingSaveFailed:
      "Could not save your sharing choice. Try again or turn sharing off to continue.",
    acceptance:
      "By playing, you agree to the <terms>Terms of Use</terms> and <privacy>Privacy Policy</privacy>.",
  },
  newGame: {
    // Setup for Planechase, an add-on to any Magic game that uses a deck of plane cards. Use your language's official names for Planechase and the planar deck.
    // ar: Write "بلان تشاس" despite the note to keep Planechase; planar deck is مجموعة العوالم.
    planechase: "Planechase",
    planechaseOff: "Off",
    // Players bring their own physical planar deck; the app only rolls the die and tracks its cost.
    // hi: Reflexive अपने: “मेरे पास अपने कार्ड हैं”.
    ownPlanarDeck: "I have my cards",
    // A whole product's decks combined into one shared planar deck, as in "Planechase 2012, all 4 decks".
    allDecks: "{{product}}, all {{count}} decks",
    // Setup for Archenemy: which player is the archenemy, chosen by seat or rolled at the start.
    archenemy: "Archenemy",
    // ja: Pick the archenemy with a die at the start: 開始時にダイスで決める. Never ロール.
    // fr: Draw the archenemy at random at the start: "Tirer au sort au début".
    rollArchenemy: "Roll at start",
    schemeDeck: "Scheme deck",
    // The archenemy brings their own physical scheme deck.
    // hi: Reflexive अपने: “मेरे पास अपने कार्ड हैं”.
    ownSchemeDeck: "I have my cards",
    setupTitle: "Game setup",
    newTitle: "New game",
    // ja: Heading of the choice between one shared device, nearby phones and online: 遊び方.
    connectionLabel: "Game connection",
    onThisDevice: "On this device",
    connected: "Connected",
    gameLabel: "Game",
    // Two-Headed Giant setup: heading above the list of two-player teams.
    teams: "Teams",
    // Two-Headed Giant setup: screen reader label for a player in the team list, as in "Ada, team 1".
    teamPlayer: "{{name}}, team {{team}}",
    // Two-Headed Giant setup: screen reader label for the swatch that opens a team's color choices, as in "Team 1 color".
    teamColor: "Team {{team}} color",
    // Two-Headed Giant setup: hint under the team list. Tapping one player and then another swaps their teams.
    teamSwapHint: "Tap two players to swap them",
    // Two-Headed Giant setup: shown after the first tap, while waiting for the second player.
    teamSwapPicked: "Now tap who to swap with",
    // Two-Headed Giant setup: heading for the life total each team shares.
    teamLife: "Team life",
    // Game type name for Two-Headed Giant, Magic's format of two-player teams sharing a life total. Keep the official name if the language has one.
    twoHeadedGiant: "Two-Headed Giant",
    // Game type name for Two-Headed Giant played with Commander decks. Short.
    twoHeadedGiantCommander: "2HG Commander",
    // Game type name for Riftbound 2v2, two teams of two sharing one point total. Keep "2v2".
    // ar: Write "اثنان ضد اثنين" despite the note to keep 2v2.
    twoVsTwo: "2v2",
    formatLabel: "Format",
    joinWithCode: "Join with code",
    resumeHostedGame: "Resume hosted game",
    moreFormats_one: "{{count}} more",
    moreFormats_other: "{{count}} more",
    moreOptions: "More options",
    closeOptions: "Close game options",
    seatsCount_one: "{{count}} seat",
    seatsCount_other: "{{count}} seats",
    clockMinutes: "{{minutes}} min clock",
    seats: "Seats",
    players: "Players",
    match: "Match",
    singleGame: "Single game",
    // Label for the match length choice: best of 1, 3 or 5 games.
    bestOf: "Best of",
    bestOfCount: "Best of {{bestOf}}",
    clock: "Clock",
    clockOff: "Off",
    clockCountdown: "Countdown",
    clockStopwatch: "Stopwatch",
    minutesLeft: "Minutes left",
    // Label next to the starting value: how much one tap changes it (1, 5 or 10).
    // How much one tap on a seat changes its life total.
    changeBy: "Per tap",
    layout: "Layout",
    // hi: Appearance is the player's color and mark: “{{name}} का रंग और निशान बदलें”.
    changeAppearance: "Change appearance for {{name}}",
    nameForPlayer: "Name for player {{seat}}",
    nameGateHelper: 'Connected players will see "{{name}}" instead.',
    // Name for the picked deck when its real name is unknown.
    deckFallbackName: "Deck",
    // ko: Button marking the device owner's seat: '내 자리'.
    thisIsMe: "This is me",
    noSeat: "No seat",
    yourDeck: "Your deck",
    decksUnavailable: "Decks unavailable",
    loadingDecks: "Loading decks…",
    noMatchingDecks: "No matching decks",
    noDeck: "No deck",
    savePlayersFailed: "Could not save players.",
    gameChanged: "The current game changed. Check it before ending it.",
    gamesInProgress: "Games in progress",
    matchStatus: "{{context}} · Best of {{bestOf}}",
    continueMatch: "Continue match",
    continueMatchHint: "Returns to the match in progress",
    endCurrentGame: "End current game…",
    endCurrentGameHint: "Opens the end-game prompt before you can start another game",
    working: "Working…",
    // Button: create a lobby that you host.
    hostLobby: "Host lobby",
    hostLobbyHint: "Creates a lobby others can join",
    startGameHint: "Starts this local game on the current device",
    cloud: "Cloud",
    // Heading above a choice of Cloud or Nearby: where the connected game runs.
    // hi: Heading over a choice, not a button: “गेम कहाँ चलेगा”.
    // es: Heading above Nube / Cercana. Use "Dónde se juega", never ejecutar.
    hostOn: "Run game on",
    nearby: "Nearby",
    nearbyHint: "Plays with phones on this Wi-Fi, without accounts or the cloud",
    endMatch: "End match…",
    // ja: Records the match from the games finished so far: 終了済みのゲームまでの結果でマッチを記録します.
    endMatchHint: "Records the match result from its last finished game",
    // fr: Turns a local game into a connected one: "Connecter la partie".
    connect: "Connect",
    connectHint: "Moves this game to the cloud so others can join it",
    statusDetailsHint: "Opens game and connection details",
    retryConnection: "Retry connection",
    yourConnectedGames: "Your connected games",
    endGameEllipsis: "End game…",
    leaveGameEllipsis: "Leave game…",
    loadMore: "Load more",
    loadingMoreGames: "Loading more games…",
    endGameTitle: "Abandon this game?",
    cancelEndGame: "Keep this game",
    endGameMessage:
      "This ends the game for everyone and records it as abandoned. This cannot be undone.",
    endGameConfirm: "Abandon game",
    leaveGameTitle: "Leave this game?",
    cancelLeaveGame: "Stay in this game",
    leaveGameMessage: "You will leave this game. Other players and their history stay unchanged.",
    leaveGameConfirm: "Leave game",
    // ko: 'mark' is the player's on-board shape: 모양 (색상과 모양). 표식 is only Flesh and Blood's Marked.
    closeAppearancePicker: "Close color and mark picker",
    // ko: 'mark' is the player's on-board shape: 모양 (색상과 모양). 표식 is only Flesh and Blood's Marked.
    appearanceTitle: "{{name}}'s color and mark",
    hostSeatTitle: "Which seat is you?",
    hostSeatMessage: "The other seats stay open for players to claim with an invite.",
  },
  summary: {
    endedHostAbandoned: "Abandoned by the host",
    endedInactivity: "Ended after inactivity",
    endedAccountDeleted: "Ended when the host deleted their account",
    // ar: Write "{{name}} (الإصدار {{version}})". Never v{{version}}.
    deckVersion: "{{name}} v{{version}}",
    underAMinute: "Under a minute",
    minutes: "{{minutes}} min",
    // hi: Hindi readers don't abbreviate these: “{{hours}} घंटे {{minutes}} मिनट”.
    hoursMinutes: "{{hours}}h {{minutes}}m",
    playerCount_one: "{{count}} player",
    playerCount_other: "{{count}} players",
    // One-letter badges for a win, loss or draw.
    badge: {
      // hi: Hindi has no one-letter form; the full word fits the badge: “जीत”.
      win: "W",
      // hi: The full word fits the badge: “हार”.
      loss: "L",
      // hi: The full word fits the badge: “ड्रॉ”.
      draw: "D",
      unrecorded: "–",
    },
    outcome: {
      win: "Winner",
      loss: "Loss",
      draw: "Draw",
      unrecorded: "Result not recorded",
    },
    deletedPlayer: "deleted player",
    standing: "{{name}}, {{value}}",
    standingWithOutcome: "{{outcome}}, {{name}}, {{value}}",
    // Read aloud for one player's row: {{standing}} is their name and result, {{detail}} how they went out, or their team, username or deck.
    standingDetail: "{{standing}}, {{detail}}",
    loading: "Loading game summary",
    unavailableHeading: "Summary unavailable",
    unavailableContent: "Check your connection and try again.",
    notFoundHeading: "Game not found",
    notFoundContent: "This game summary is no longer available.",
    finished: "Finished",
    abandoned: "Abandoned",
    noWinner: "No winner was recorded for this game.",
    reportPlayer: "Report or block a player",
    hide: "Hide",
    show: "Show",
    unknownPlayer: "Player",
    // hi: A timeline row label marking an undo, not a button: “अनडू”, without करें.
    undo: "undo",
    loadOlder: "Load older changes",
    loadingOlder: "Loading older changes…",
    // ko: 'events' are this game's changes: '공간 절약을 위해 오래된 변경 내역을 삭제했습니다.'
    // fr: These are older log entries for this game, not store events: "Les changements plus anciens ont été supprimés pour libérer de l’espace."
    // es: These are changes in the game log, not store events. Use "Se descartaron los cambios más antiguos para ahorrar espacio."
    olderDropped: "Older changes were dropped to save space.",
    // ko: '되돌리기는 지워지지 않고 반대 방향의 변경으로 기록에 남습니다.'
    // hi: “अनडू भी रिकॉर्ड में एक उल्टे बदलाव की तरह दिखता है।”
    undoNote: "Undo stays in the record as a compensating change.",
    recap: {
      // {{names}} is one or more player names already joined, as in "Ana and Ben".
      won: "{{names}} won",
      share: "Share",
      shareFailed: "Could not share this recap.",
      // Read aloud for a player's life line: where their counter started and ended, like "40 life to 28 life".
      lifeLine: "{{from}} to {{to}}",
    },
    // The image a player shares after a game. Player names stay as written.
    receipt: {
      // {{names}} is one or more winners already joined, as in "Ana and Ben". {{value}} is their final total with its unit, like "3 life" or "800 Life Points".
      claim: "{{names}} won at {{value}}",
      // Short turn stamp before one fact from the game log, like "T9 Ana took 9". T stands for turn.
      onTurn: "T{{turn}} {{event}}",
      // {{source}} dealt {{count}} commander damage to {{name}} in one go. Kept short.
      hit_one: "{{source}} hit {{name}} for {{count}}",
      hit_other: "{{source}} hit {{name}} for {{count}}",
      // {{name}} lost {{count}} life in one go. Kept short.
      took_one: "{{name}} took {{count}}",
      took_other: "{{name}} took {{count}}",
      // {{count}} is how many players {{names}} lists.
      wins_one: "{{names}} wins",
      wins_other: "{{names}} win",
      // Under a player's total: the turn they were knocked out. T stands for turn.
      outTurn: "T{{turn}}",
      // Text sent with the image. {{claim}} is a sentence like "Ana won at 3 life", {{players}} everyone at the table, {{format}} a format like "Commander".
      caption: "{{claim}}. {{players}}, {{format}}.",
      // Same as the caption, plus the turn the game ended on.
      captionOnTurn: "{{claim}}. {{players}}, {{format}}, turn {{turn}}.",
    },
    helpPrompt: "Having trouble?",
    openHelp: "Open Support",
    dismiss: "Dismiss",
    timeline: {
      loading: {
        none: "Loading life changes",
        mtg: "Loading life changes",
        ygo: "Loading Life Points changes",
        pokemon: "Loading Prize cards changes",
        lorcana: "Loading lore changes",
        fab: "Loading life changes",
        riftbound: "Loading point changes",
      },
      heading: {
        none: "Life changes · {{changes}}",
        mtg: "Life changes · {{changes}}",
        ygo: "Life Points changes · {{changes}}",
        pokemon: "Prize cards changes · {{changes}}",
        lorcana: "Lore changes · {{changes}}",
        fab: "Life changes · {{changes}}",
        riftbound: "Point changes · {{changes}}",
      },
      noChanges: {
        none: "No life changes were recorded.",
        mtg: "No life changes were recorded.",
        ygo: "No Life Points changes were recorded.",
        pokemon: "No Prize cards changes were recorded.",
        lorcana: "No lore changes were recorded.",
        fab: "No life changes were recorded.",
        // hi: Copy the life wording: “कोई पॉइंट बदलाव दर्ज नहीं हुआ।”
        riftbound: "No point changes were recorded.",
      },
      loadFailed: {
        none: "Could not load life changes.",
        mtg: "Could not load life changes.",
        ygo: "Could not load Life Points changes.",
        pokemon: "Could not load Prize cards changes.",
        lorcana: "Could not load lore changes.",
        fab: "Could not load life changes.",
        riftbound: "Could not load point changes.",
      },
      detailsUnavailable: {
        none: "Life change details are unavailable.",
        mtg: "Life change details are unavailable.",
        ygo: "Life Points change details are unavailable.",
        pokemon: "Prize cards change details are unavailable.",
        lorcana: "Lore change details are unavailable.",
        fab: "Life change details are unavailable.",
        riftbound: "Point change details are unavailable.",
      },
      noDetails: {
        none: "No life change details were found.",
        mtg: "No life change details were found.",
        ygo: "No Life Points change details were found.",
        pokemon: "No Prize cards change details were found.",
        lorcana: "No lore change details were found.",
        fab: "No life change details were found.",
        riftbound: "No point change details were found.",
      },
    },
  },
  history: {
    title: "History",
    // Header action that opens a menu: log a game, add a match result, or add past games.
    add: "Add",
    addPastGames: "Add past games",
    // Opens a form to record a game that was played without tracking it in the app.
    logGame: "Log a game",
    // Marks a game entered by hand after it was played, so it has no life changes or duration.
    logged: "Logged",
    source: {
      all: "All",
      local: "Local",
      // fr: Plural feminine like its siblings Toutes / Locales / Manuelles: "Connectées".
      connected: "Connected",
      manual: "Manual",
    },
    matchFormat: "Match",
    dateRange: {
      any: "Any time",
      lastDays_one: "Last {{count}} day",
      lastDays_other: "Last {{count}} days",
      thisYear: "This year",
    },
    outcome: {
      win: "Win",
      loss: "Loss",
      draw: "Draw",
      unrecorded: "No result",
    },
    podSolo: "Solo",
    podMax: "{{max}}+ players",
    podSize_one: "{{count}} player",
    podSize_other: "{{count}} players",
    formatWithSystem: "{{format}} ({{system}})",
    today: "Today",
    yesterday: "Yesterday",
    // Badge for an abandoned game. A symbol; keep it exactly.
    badgeAbandoned: "⊘",
    // ar: Write "جارية". قيد التقدم is a calque.
    inProgress: "In progress",
    // ja: Same as decks:play.versus: vs {{opponents}}.
    versus: "vs {{opponents}}",
    // ar: Short badge: "الأفضل من {{bestOf}}", or "من {{bestOf}}" if space is tight. Never Bo.
    bestOfShort: "Bo{{bestOf}}",
    gameCount_one: "{{count}} game",
    gameCount_other: "{{count}} games",
    roundShort: "R{{round}}",
    gameNumber: "Game {{number}}",
    wonBy: "Won by {{names}}",
    loadingConnectedLabel: "Loading connected history",
    loadingConnected: "Loading connected history…",
    connectedUnavailable: "Connected history unavailable",
    connectedUnavailableMessage: "Connected history is unavailable.",
    count: {
      // hi: “{{count}} गेम · {{wins}} जीत · {{losses}} हार · {{draws}} ड्रॉ”.
      record_one: "{{count}} game · {{wins}}W · {{losses}}L · {{draws}}D",
      // hi: “{{count}} गेम · {{wins}} जीत · {{losses}} हार · {{draws}} ड्रॉ”.
      record_other: "{{count}} games · {{wins}}W · {{losses}}L · {{draws}}D",
      localLoading_one: "{{count}} local game · Connected history loading",
      localLoading_other: "{{count}} local games · Connected history loading",
      localUnavailable_one: "{{count}} local game · Connected history unavailable",
      localUnavailable_other: "{{count}} local games · Connected history unavailable",
      loadingMore_one: "{{count}} loaded game · Loading more connected history",
      loadingMore_other: "{{count}} loaded games · Loading more connected history",
    },
    noLoadedMatchesHeading: "No results in loaded games",
    noLoadedMatchesContent: "Load older games to search further back.",
    loadOlderGames: "Load older games",
    noFilterMatchesHeading: "No games match these filters",
    noFilterMatchesContent: "Clear a filter to widen the search.",
    clearFilters: "Clear filters",
    migrationFailed: "Some older connected games could not be added.",
    retryImport: "Retry import",
    loadMoreConnected: "Load more connected games",
    loadingMoreConnected: "Loading more connected games…",
    filtersLoadedNote: "Filters apply to loaded games. Load more to search further back.",
    dismissFilters: "Dismiss filters",
    filters: "Filters",
    filterDate: "Date",
    filterPlayers: "Players",
    filterDecks: "Decks",
    filterResult: "Result",
    filterPodSize: "Pod size",
    filterGameSystem: "Game system",
    filterFormat: "Format",
    clearAll: "Clear all",
    showLoaded: "Show loaded games",
    showCount: "Show {{total}}",
  },
  manualMatch: {
    title: "Match result",
    round: "Round {{round}}",
    gamesWon: "{{won}} won",
    gamesWonDrawn: "{{won}} won · {{drawn}} drawn",
    you: "{{name}} (you)",
    deleteFailed: "Could not delete this match. Try again.",
    signInHeading: "Sign in to view this result",
    signIn: "Sign in",
    unavailableHeading: "Match unavailable",
    loading: "Loading match",
    loadingEllipsis: "Loading…",
    notFoundHeading: "Match not found",
    notFoundContent: "It may have been deleted.",
    deleteResult: "Delete result",
    deleteTitle: "Delete this result?",
    cancelDelete: "Keep this result",
    deleteMessage: "Deck stats that count it will be updated.",
  },
  // A form to record a game played without tracking it in the app.
  logGame: {
    title: "Log a game",
    addPlayer: "Add player",
    minutes: "Minutes played",
    save: "Save game",
    error: {
      noWinner: "Pick a winner or a draw",
      minutesRange: "Minutes must be {{min}}–{{max}}",
    },
  },
  recordMatch: {
    title: "Add match result",
    myResult: "My result",
    // es: The match score counted in games, like 2-1. Use "Marcador en partidas", never "Resultado de la partida".
    gameScore: "Game score",
    opponent: "Opponent {{number}}",
    opponentResult: "Opponent {{number}} result",
    name: "Name",
    deck: "Deck or commander",
    addOpponent: "Add opponent",
    event: "Event",
    round: "Round",
    date: "Date",
    saving: "Saving…",
    saveResult: "Save result",
    saveFailed: "Could not save this match. Try again.",
    savedOffline: "Saved on this device. It syncs when you're back online.",
    queueFull: "Too many matches are waiting to sync. Reconnect before adding more.",
    error: {
      opponentName: "Opponent {{number}} needs a name",
      nameLength: "Names must be at most {{max}} characters",
      noWinner: "Pick a winner, or mark the drawn seats",
      dateFormat: "Date must be YYYY-MM-DD",
      dateFuture: "Date cannot be in the future",
      eventLength: "Event name must be at most {{max}} characters",
      roundRange: "Round must be {{min}}–{{max}}",
      scoreIncomplete: "Enter both wins and losses, or leave the score blank",
      // ar: Count, not the bare noun: "يجب أن يكون عدد مرات الفوز بين {{min}} و{{max}}".
      winsRange: "Wins must be {{min}}–{{max}}",
      // ar: Count, not the bare noun: "يجب أن يكون عدد مرات الخسارة بين {{min}} و{{max}}".
      lossesRange: "Losses must be {{min}}–{{max}}",
      // ar: Count, not the bare noun: "يجب أن يكون عدد مرات التعادل بين {{min}} و{{max}}".
      drawsRange: "Draws must be {{min}}–{{max}}",
      tooManyGames: "A best of {{bestOf}} has at most {{bestOf}} games",
      // {{record}} is a wins-losses score, such as "2-1".
      scoreIsWin: "A {{record}} score is a win",
      scoreIsLoss: "A {{record}} score is a loss",
      scoreIsDraw: "A {{record}} score is a draw",
    },
  },
  rules: {
    title: "Rules",
    // Header button that opens card lookup.
    cards: "Cards",
    search: "Search rules",
    // Tab listing rules the player opened recently.
    // ar: Tab of rules you opened recently: "الأخيرة". الأحدث means newest rule changes.
    recent: "Recent",
    // Tab listing the rules' chapters and sections, like a table of contents.
    contents: "Contents",
    glossary: "Glossary",
    noRecent: "Rules you open show up here.",
    // Link that opens the rule being previewed inline.
    open: "Open",
    effective: "Comprehensive Rules, effective {{date}}",
    official: "Official rules",
    openFailed: "Couldn't open the official rules",
    downloading: "Downloading the Comprehensive Rules from {{publisher}}.",
    failed: "Couldn't download the rules.",
    webOnly: "The Comprehensive Rules are on the {{publisher}} site.",
    // {{section}} is a numbered rules section such as "1. Game Concepts"; this shows every rule in it.
    // hi: Finish the phrase: “{{section}} के सभी नियम”.
    // fr: "Toute la section {{section}}".
    // es: Use "Todas las reglas de {{section}}".
    allOf: "All of {{section}}",
    noResults: "No rules match.",
    notFound: "This rule isn't in this version of the rules.",
  },
}

export default play
