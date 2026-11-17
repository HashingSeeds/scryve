const events = {
  // A tournament run at a store or a kitchen table.
  title: "Events",
  newEvent: "New event",
  joinEvent: "Join event",
  loading: "Loading…",
  // Label for the header button that opens Finish, Delete, and Drop.
  actions: "Event actions",
  failed: "That didn't work. Try again.",
  // Label above a web address the organizer opens on a store TV to show pairings, the clock, and standings.
  // ja: The shop's TV display, not the App Store: 店内表示用の画面. Never ストア.
  storeScreen: "Store screen",
  errors: {
    nameRejected: "Choose a different name",
    // {{count}} is how many events one organizer can have open at the same time.
    eventLimit_one: "Finish one of your events first. You can run {{count}} at once.",
    eventLimit_other: "Finish one of your events first. You can run {{count}} at once.",
    eventFinished: "This event has finished",
    eventFull: "This event is full",
    resultsMissing: "Enter every result before the next round",
    notEnoughPlayers: "Not enough players to start a round",
    resultConfirmed: "That result was already confirmed. Ask the organizer to change it.",
    nothingToConfirm: "That result changed. Check it again.",
    rateLimited: "Too many tries. Wait a minute and try again.",
  },
  signIn: "Sign in to run or join events",
  notFound: "This event no longer exists",
  status: {
    // ko: A status, not a button: '등록 중'.
    registration: "Registration",
    active: "Round {{round}}",
    finished: "Finished",
  },
  // Swiss pairs players 1v1 each round. Pods seat 3 to 5 players at a table, like a Commander night.
  structure: {
    swiss: "Swiss",
    pods: "Pods",
  },
  bestOf: "Best of {{bestOf}}",
  playerCount_one: "{{count}} player",
  playerCount_other: "{{count}} players",
  organizer: "Organizer",
  list: {
    // Section label above events that haven't finished: open for registration or mid-round.
    current: "Current",
    empty: "No events yet",
    emptyHint: "Run a tournament for your store or friends, or join one with its code.",
  },
  create: {
    title: "New event",
    name: "Name",
    namePlaceholder: "Friday Modern",
    format: "Format",
    // ja: Setup label for how players are paired: 対戦方式.
    structure: "Pairings",
    // The choice of best of 1, 3 or 5 games per match.
    // ja: Organizers say マッチ形式 (values like 3本勝負).
    // fr: The choice is best of 1, 3 or 5, not a duration: "Format du match". Never Durée.
    bestOf: "Best of",
    rounds: "Rounds",
    roundMinutes: "Minutes per round",
    // hi: No gender slash: “मैं भी खिलाड़ी हूँ”.
    playing: "I'm playing too",
    create: "Create event",
    creating: "Creating…",
  },
  join: {
    title: "Join event",
    code: "Event code",
    scan: "Scan QR code",
    join: "Join",
    // fr: Joining an event, not signing in: "Connexion à l’événement…".
    // es: Use "Uniéndote…", like events:nearby.joining.
    joining: "Joining…",
    invalidCode: "Enter the {{length}}-character code",
    notFound: "No event has that code",
  },
  tabs: {
    round: "Round",
    players: "Players",
    standings: "Standings",
  },
  roundOf: "Round {{round}} of {{planned}}",
  clock: {
    pause: "Pause",
    resume: "Resume",
    // Adds minutes to or takes them off the round clock, as in "+1 min".
    adjustMinutes: "{{minutes, signed}} min",
    paused: "Paused",
    // The round clock ran out.
    // hi: Time has been called, not a label: “समय खत्म”.
    timeUp: "Time",
  },
  startRound: "Start round {{round}}",
  blocked: {
    results: "Enter every result first",
    players: "Needs {{count}} players",
    maxRounds: "No more rounds",
  },
  finish: {
    action: "Finish event",
    title: "Finish this event?",
    message: "Standings lock and players can no longer report.",
    confirm: "Finish",
  },
  remove: {
    action: "Delete event",
    title: "Delete this event?",
    message: "The code and every player are removed.",
    confirm: "Delete",
  },
  drop: {
    // Withdrawing from an event so you are not paired in later rounds. Use the tournament word for dropping.
    action: "Drop",
    title: "Drop from this event?",
    // ja: Being paired is 対戦が組まれる: 以降のラウンドでは対戦が組まれません。
    message: "You won't be paired in later rounds.",
    confirm: "Drop",
  },
  // Puts a dropped player back into the next round's pairings.
  // es: Puts a dropped player back into the pairings; sits next to "Retirarse". Use "Reincorporar", never "Volver", which reads as Back.
  undrop: "Return",
  // hi: Status of a player who left the event: “ड्रॉप हुए”, not ड्रॉप किया.
  dropped: "Dropped",
  guest: "Guest",
  addGuest: "Add guest",
  guestName: "Guest name",
  table: "Table {{table}}",
  // Section label above every table in the round, with how many have a result.
  tables: "Tables",
  // Separates player names at a 1v1 table, e.g. "Ada vs Grace".
  versus: "{{first}} vs {{second}}",
  bye: "Bye",
  tableStatus: {
    // ja: A table still playing, same word as the store screen: 対戦中.
    // hi: A table with no result yet: “बाकी”, not खुला.
    // fr: Table status while the game is on; same word in the app and on the TV: "En cours".
    open: "Open",
    // fr: Same word in the app and on the TV: "Résultat déclaré".
    reported: "Reported",
    // ja: Same word as the store screen: 承認済み.
    // hi: “पुष्टि हुई”, same as eventDisplay:tableStatus.confirmed.
    // fr: Same word in the app and on the TV: "Résultat confirmé".
    confirmed: "Confirmed",
  },
  myTable: "Your table",
  noTable: "No table this round",
  waitingToStart: "Waiting for round {{round}}",
  report: "Report result",
  changeReport: "Change result",
  // ja: Another player agrees to the reported result: 結果を承認. Never 確認.
  confirm: "Confirm result",
  // {{count}} is how many players at the table could confirm the report; one confirmation is enough.
  waitingForConfirm_one: "Waiting for your opponent to confirm",
  // ja: Agreeing to the report is 承認: 他のプレイヤーの承認を待っています.
  waitingForConfirm_other: "Waiting for another player to confirm",
  startMatch: "Start match",
  replaceGame: {
    title: "End your current game?",
    message: "It ends without a result, then this match starts.",
    confirm: "Start match",
  },
  result: {
    title: "Table {{table}} result",
    // Games in this match that ended in a draw.
    drawnGames: "Drawn games",
    draw: "Draw",
    winner: "{{name}} wins",
    // The signed-in player's own match result, e.g. "You won 2-1". {{score}} lists their games first.
    won: "You won {{score}}",
    lost: "You lost {{score}}",
    drew: "You drew {{score}}",
    doubleLoss: "Double loss",
    save: "Save",
    clear: "Clear result",
    twoWinners: "Only one player can win the match",
  },
  // Events run by one device on the store's Wi-Fi, without internet.
  nearby: {
    title: "Nearby events",
    host: "Host on this device",
    yourEvent: "Your event",
    hostBusy: "Finish your event to host another.",
    nameFirst: "Enter your name to join an event.",
    // Shown while no events are found; some store guest networks keep devices from seeing each other.
    searching: "Looking for events on this Wi-Fi. Everyone needs to be on the same network.",
    denied: "Allow local network access in Settings to find events on this Wi-Fi.",
    name: "Your name",
    join: "Join",
    // fr: Joining an event, not signing in: "Connexion à l’événement…".
    joining: "Joining…",
    // ko: '주최자 기기에 다시 연결하는 중…'.
    reconnecting: "Reconnecting to the host…",
    replaceUnsaved: {
      // hi: Confirming deletes the last event and starts a new one; बदलना would mean edit it: “पिछला इवेंट हटाकर नया बनाएँ?”
      title: "Replace your last event?",
      message: "It isn't saved to an account, so hosting a new event deletes it from this device.",
      // hi: “हटाकर नया बनाएँ”, matching the title.
      confirm: "Replace",
    },
    rejected: {
      code: "That event's code changed. Pick it again.",
      protocol: "The host needs the same Scryve version as you.",
      closed: "That event has ended.",
      invalid: "The host refused this device.",
      unreachable: "Couldn't reach that event. Make sure you're on the same Wi-Fi, then try again.",
    },
  },
  settings: {
    rounds: "Rounds",
    // ja: The recommended number of rounds for this many players: {{count}}人の推奨ラウンド数：{{rounds}}.
    suggested: "Suggested for {{count}} players: {{rounds}}",
    roundMinutes: "Minutes per round",
  },
  standings: {
    rank: "#",
    player: "Player",
    // Column header: match points.
    // hi: “पॉइंट”, never अंक, matching the store screen.
    points: "Pts",
    // Column header: wins, losses, draws.
    record: "W-L-D",
    empty: "Standings appear after round {{round}}",
  },
  // Column headers for tiebreakers in Magic tournament standings. Keep the English abbreviations.
  tiebreaker: {
    opponentMatchWin: "OMW",
    gameWin: "GW",
    opponentGameWin: "OGW",
    opponentOpponentMatchWin: "OOMW",
    lostRoundSquares: "SoS",
  },
}

export default events
