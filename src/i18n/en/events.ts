const events = {
  // A tournament run at a store or a kitchen table.
  title: "Events",
  newEvent: "New event",
  joinEvent: "Join event",
  loading: "Loading…",
  failed: "That didn't work. Try again.",
  // Label above a web address the organizer opens on a store TV to show pairings, the clock, and standings.
  storeScreen: "Store screen",
  errors: {
    nameRejected: "Choose a different name",
    eventLimit: "Finish one of your events first. You can run 5 at once.",
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
    empty: "No events yet",
  },
  create: {
    title: "New event",
    name: "Name",
    namePlaceholder: "Friday Modern",
    format: "Format",
    structure: "Pairings",
    bestOf: "Match length",
    rounds: "Rounds",
    roundMinutes: "Minutes per round",
    playing: "I'm playing too",
    create: "Create event",
    creating: "Creating…",
  },
  join: {
    title: "Join event",
    code: "Event code",
    scan: "Scan QR code",
    join: "Join",
    joining: "Joining…",
    invalidCode: "Enter the 6-character code",
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
    // Takes one minute off the round clock.
    minus: "−1 min",
    // Adds one minute to the round clock.
    plus: "+1 min",
    paused: "Paused",
    // The round clock ran out.
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
    // Leaving an event so you are not paired in later rounds.
    action: "Drop",
    title: "Drop from this event?",
    message: "You won't be paired in later rounds.",
    confirm: "Drop",
  },
  // Puts a dropped player back into the next round's pairings.
  undrop: "Return",
  dropped: "Dropped",
  guest: "Guest",
  addGuest: "Add guest",
  guestName: "Guest name",
  table: "Table {{table}}",
  // Separates player names at a 1v1 table, e.g. "Ada vs Grace".
  versus: "{{first}} vs {{second}}",
  bye: "Bye",
  tableStatus: {
    open: "Open",
    reported: "Reported",
    confirmed: "Confirmed",
  },
  myTable: "Your table",
  noTable: "No table this round",
  waitingToStart: "Waiting for round 1",
  report: "Report result",
  changeReport: "Change result",
  confirm: "Confirm result",
  // {{count}} is how many players at the table could confirm the report; one confirmation is enough.
  waitingForConfirm_one: "Waiting for your opponent to confirm",
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
    // Shown while no events are found; some store guest networks keep devices from seeing each other.
    searching: "Looking for events on this Wi-Fi. Everyone needs to be on the same network.",
    denied: "Allow local network access in Settings to find events on this Wi-Fi.",
    name: "Your name",
    join: "Join",
    joining: "Joining…",
    reconnecting: "Reconnecting to the host…",
    replaceUnsaved: {
      title: "Replace your last event?",
      message: "It isn't saved to an account, so hosting a new event deletes it from this device.",
      confirm: "Replace",
    },
    rejected: {
      code: "That event's code changed. Pick it again.",
      protocol: "The host needs the same Scryve version as you.",
      closed: "That event has ended.",
      invalid: "The host refused this device.",
    },
  },
  settings: {
    rounds: "Rounds",
    suggested: "Suggested for {{count}} players: {{rounds}}",
    roundMinutes: "Minutes per round",
  },
  standings: {
    rank: "#",
    player: "Player",
    // Column header: match points.
    points: "Pts",
    // Column header: wins, losses, draws.
    record: "W-L-D",
    empty: "Standings appear after round 1",
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
