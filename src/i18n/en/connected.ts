const connected = {
  relativeTime: {
    justNow: "just now",
    minutes: "{{minutes}}m ago",
    hours: "{{hours}}h ago",
    days: "{{days}}d ago",
  },
  resumeTitle: {
    hostingLobby: "Hosting · waiting to start",
    hostingActive: "Hosting · in progress",
    playingLobby: "Playing · waiting to start",
    playingActive: "Playing · in progress",
  },
  seatCount_one: "{{count}} seat",
  seatCount_other: "{{count}} seats",
  allSeatsClaimed: "All seats claimed",
  waitingForPlayers_one: "Waiting for {{count}} more player",
  waitingForPlayers_other: "Waiting for {{count}} more players",
  decksRequired: "Decks required",
  decksOptional: "Decks optional",
  yourSeat: "Your seat",
  seatNumber: "Seat {{seat}}",
  noDeckSelected: "No deck selected",
  lobbyExit: {
    abandon: {
      title: "Abandon this lobby?",
      message:
        "This closes the lobby for everyone and saves a terminal summary. It cannot be undone.",
      confirmText: "Abandon lobby",
    },
    leave: {
      title: "Leave this lobby?",
      message:
        "The lobby drops off your resume list. Other players and their history stay unchanged.",
      confirmText: "Leave lobby",
    },
  },
  onlineOnly: {
    start: "Reconnect to start the game. Starting is online-only and is never queued.",
    exit: "Reconnect to leave or abandon this lobby. These actions are online-only and are never queued.",
    join: "Reconnect to claim a seat. Seat claims are online-only and are never queued.",
    deck: "Reconnect to change decks. Deck choices are online-only and are never queued.",
  },
}

export default connected
