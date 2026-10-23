const events = {
  // A tournament run at a store or a kitchen table.
  title: "Events",
  newEvent: "New event",
  joinEvent: "Join event",
  loading: "Loading…",
  failed: "That didn't work. Try again.",
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
  confirm: "Confirm {{result}}",
  waitingForConfirm: "Waiting for the other players to confirm",
  startMatch: "Start match",
  activeGame: "Finish your current game first",
  result: {
    title: "Table {{table}} result",
    // Games in this match that ended in a draw.
    drawnGames: "Drawn games",
    draw: "Draw",
    winner: "{{name}} wins",
    doubleLoss: "Double loss",
    save: "Save",
    clear: "Clear result",
    twoWinners: "Only one player can win the match",
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
