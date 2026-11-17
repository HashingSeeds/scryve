// A read-only screen a store shows on a TV so everyone can see an event's pairings, round clock, and standings.
const eventDisplay = {
  notFound: "No event with that code",
  // The round in progress out of the rounds the organizer planned.
  roundOf: "Round {{round}} of {{planned}}",
  round: "Round {{round}}",
  // Shown instead of the round once the event has ended.
  // ko: The event is over, not a finals match: '최종 결과'. Never 결승.
  // fr: Shown once the event is over, not a final match: "Terminé". Never Finale.
  final: "Final",
  // Label above the code players type to join the event.
  code: "Code",
  // The round clock is stopped by the organizer.
  paused: "Paused",
  // The round clock ran out; players finish their current game.
  // hi: Time has been called, not a label: “समय खत्म”.
  time: "Time",
  // The player has no opponent this round and gets a free win.
  bye: "Bye",
  pairings: "Pairings",
  standings: "Standings",
  players_one: "{{count}} player",
  players_other: "{{count}} players",
  noPlayers: "No players yet",
  // Column header: tournament points.
  // hi: “पॉइंट”, same as events:standings.points.
  points: "Pts",
  // Column header: wins, losses, and draws.
  record: "W-L-D",
  tableStatus: {
    // fr: Table status while the game is on; same word in the app and on the TV: "En cours".
    open: "Playing",
    // fr: Same word in the app and on the TV: "Résultat déclaré".
    reported: "Reported",
    // ko: Same status as on the phone: '확정됨'.
    // ja: Same word as the phone: 承認済み.
    // hi: “पुष्टि हुई”, same as events:tableStatus.confirmed.
    // fr: Same word in the app and on the TV: "Résultat confirmé".
    confirmed: "Confirmed",
  },
}

export default eventDisplay
