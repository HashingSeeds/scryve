const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export type ConnectedGameStatus = "lobby" | "active"

export type ResumableGame = {
  publicId: string
  status: ConnectedGameStatus
  isHost: boolean
  playerCount: number
  ruleset: string
  startingLife?: number
  updatedAt: number
}

export function relativeTime(timestamp: number, now: number) {
  const elapsed = Math.max(0, now - timestamp)
  if (elapsed < MINUTE_MS) return "just now"
  if (elapsed < HOUR_MS) {
    const minutes = Math.floor(elapsed / MINUTE_MS)
    return `${minutes}m ago`
  }
  if (elapsed < DAY_MS) {
    const hours = Math.floor(elapsed / HOUR_MS)
    return `${hours}h ago`
  }
  const days = Math.floor(elapsed / DAY_MS)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function resumeTitle(game: ResumableGame) {
  const role = game.isHost ? "Hosting" : "Playing"
  return game.status === "lobby" ? `${role} · waiting to start` : `${role} · in progress`
}

export function resumeDetail(game: ResumableGame, now: number) {
  return [
    `${game.playerCount} seats`,
    game.ruleset,
    game.startingLife ? `${game.startingLife} life` : undefined,
    relativeTime(game.updatedAt, now),
  ]
    .filter(Boolean)
    .join(" · ")
}

export function seatSummary(claimed: number, total: number) {
  const open = Math.max(0, total - claimed)
  if (open === 0) return "All seats claimed"
  return `Waiting for ${open} more ${open === 1 ? "player" : "players"}`
}

export function lobbyDetail(startingLife: number, ruleset: string) {
  return `${startingLife} life · ${ruleset}`
}

export function seatDetail({
  controlledByMe,
  seat,
  deckName,
  versionName,
}: {
  controlledByMe: boolean
  seat: number
  deckName?: string
  versionName?: string
}) {
  const who = controlledByMe ? "Your seat" : `Seat ${seat}`
  const deck = deckName ? [deckName, versionName].filter(Boolean).join(" · ") : "No deck selected"
  return `${who} · ${deck}`
}

export type LobbyExitAction = "leave" | "abandon"

export function lobbyExitCopy(action: LobbyExitAction) {
  if (action === "abandon")
    return {
      title: "Abandon this lobby?",
      message:
        "This closes the lobby for everyone and saves a terminal summary. It cannot be undone.",
      confirmText: "Abandon lobby",
    }
  return {
    title: "Leave this lobby?",
    message:
      "The lobby drops off your resume list. Other players and their history stay unchanged.",
    confirmText: "Leave lobby",
  }
}

export function onlineOnlyNotice(action: "start" | "exit" | "join" | "deck") {
  switch (action) {
    case "start":
      return "Reconnect to start the game. Starting is online-only and is never queued."
    case "exit":
      return "Reconnect to leave or abandon this lobby. These actions are online-only and are never queued."
    case "join":
      return "Reconnect to claim a seat. Seat claims are online-only and are never queued."
    case "deck":
      return "Reconnect to change decks. Deck choices are online-only and are never queued."
  }
}
