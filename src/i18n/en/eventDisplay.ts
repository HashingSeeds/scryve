// A read-only screen a store shows on a TV so everyone can see an event's pairings, round clock, and standings.
const eventDisplay = {
  notFound: "No event with that code",
  // The round in progress out of the rounds the organizer planned.
  roundOf: "Round {{round}} of {{planned}}",
  round: "Round {{round}}",
  // Shown instead of the round once the event has ended.
  final: "Final",
  // Label above the code players type to join the event.
  code: "Code",
  // The round clock is stopped by the organizer.
  paused: "Paused",
  // The round clock ran out; players finish their current game.
  time: "Time",
  // The player has no opponent this round and gets a free win.
  bye: "Bye",
  pairings: "Pairings",
  standings: "Standings",
  players_one: "{{count}} player",
  players_other: "{{count}} players",
  noPlayers: "No players yet",
  // Column header: tournament points.
  points: "Pts",
  // Column header: wins, losses, and draws.
  record: "W-L-D",
  tableStatus: {
    open: "Playing",
    reported: "Reported",
    confirmed: "Confirmed",
  },
}

export default eventDisplay
