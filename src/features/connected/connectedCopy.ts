import { gameTypeLabel } from "@/features/game/gameTypes"
import { counterValueLabel, playFormatLabel, storedPlaySystem } from "@/features/game/playSystems"
import { formatDate, joinParts } from "@/i18n/format"
import { translate } from "@/i18n/translate"

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export type ConnectedGameStatus = "lobby" | "active"

export type ResumableGame = {
  publicId: string
  status: ConnectedGameStatus
  isHost: boolean
  playerCount: number
  system?: string
  format?: string
  deckRequired?: boolean
  ruleset: string
  startingLife?: number
  updatedAt: number
}

export function relativeTime(timestamp: number, now: number) {
  const elapsed = Math.max(0, now - timestamp)
  if (elapsed < MINUTE_MS) return translate("connected:relativeTime.justNow")
  if (elapsed < HOUR_MS) {
    const minutes = Math.floor(elapsed / MINUTE_MS)
    return translate("connected:relativeTime.minutes", { count: minutes })
  }
  if (elapsed < DAY_MS) {
    const hours = Math.floor(elapsed / HOUR_MS)
    return translate("connected:relativeTime.hours", { count: hours })
  }
  const days = Math.floor(elapsed / DAY_MS)
  if (days < 7) return translate("connected:relativeTime.days", { count: days })
  return formatDate(timestamp, { month: "short", day: "numeric" })
}

export function resumeTitle(game: ResumableGame) {
  if (game.isHost)
    return game.status === "lobby"
      ? translate("connected:resumeTitle.hostingLobby")
      : translate("connected:resumeTitle.hostingActive")
  return game.status === "lobby"
    ? translate("connected:resumeTitle.playingLobby")
    : translate("connected:resumeTitle.playingActive")
}

export function resumeDetail(game: ResumableGame, now: number) {
  const system = storedPlaySystem(game.system)
  return joinParts([
    translate("connected:seatCount", { count: game.playerCount }),
    system ? playFormatLabel(system, game.format || game.ruleset) : undefined,
    game.startingLife ? counterValueLabel(system, game.startingLife) : undefined,
    relativeTime(game.updatedAt, now),
  ])
}

export function seatSummary(claimed: number, total: number) {
  const open = Math.max(0, total - claimed)
  if (open === 0) return translate("connected:allSeatsClaimed")
  return translate("connected:waitingForPlayers", { count: open })
}

export function lobbyDetail(
  startingLife: number,
  ruleset: string,
  system?: string,
  format?: string,
  variant?: string,
) {
  const resolvedSystem = storedPlaySystem(system)
  if ((variant === "twoHeadedGiant" || variant === "twoVsTwo") && resolvedSystem)
    return joinParts([
      gameTypeLabel({ id: variant, system: resolvedSystem, format: format || ruleset, variant }),
      counterValueLabel(resolvedSystem, startingLife),
    ])
  return joinParts([
    counterValueLabel(resolvedSystem, startingLife),
    resolvedSystem ? playFormatLabel(resolvedSystem, format || ruleset) : undefined,
    variant === "treachery"
      ? translate("connected:treachery.name")
      : variant === "archenemy"
        ? translate("board:scheme.title")
        : undefined,
  ])
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
  const who = controlledByMe
    ? translate("connected:yourSeat")
    : translate("connected:seatNumber", { seat })
  const deck = deckName ? joinParts([deckName, versionName]) : translate("connected:noDeckSelected")
  return joinParts([who, deck])
}

export type LobbyExitAction = "leave" | "abandon"

export function lobbyExitCopy(action: LobbyExitAction) {
  return {
    title: translate(`connected:lobbyExit.${action}.title`),
    message: translate(`connected:lobbyExit.${action}.message`),
    confirmText: translate(`connected:lobbyExit.${action}.confirmText`),
  }
}

export function onlineOnlyNotice(action: "start" | "exit" | "join" | "deck") {
  return translate(`connected:onlineOnly.${action}`)
}
