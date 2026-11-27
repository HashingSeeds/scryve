import { internalMutation, mutation, query } from "./_generated/server"
import * as finish from "./lib/games/finish"
import * as history from "./lib/games/history"
import * as lobby from "./lib/games/lobby"
import * as localPublish from "./lib/games/localPublish"
import * as pregame from "./lib/games/pregame"
import * as projection from "./lib/games/projection"
import * as tableWrites from "./lib/games/tableWrites"
import * as watch from "./lib/games/watch"

export { maskSummaryPlayersForViewer, terminalizeGameForAccountDeletion } from "./lib/games/shared"

// why: installed clients call these as `games:*`, so each one stays registered from this file.
export const createLobby = mutation(lobby.createLobby)
export const resolveInvite = mutation(lobby.resolveInvite)
export const claimSeat = mutation(lobby.claimSeat)
export const publishLocalGame = mutation(localPublish.publishLocalGame)
export const publishFinishedLocalGame = mutation(localPublish.publishFinishedLocalGame)
export const claimNearbySeat = mutation(localPublish.claimNearbySeat)
export const claimableSeats = mutation(localPublish.claimableSeats)
export const lobbyProjection = query(projection.lobbyProjection)
export const connectedOperationStatus = query(projection.connectedOperationStatus)
export const setMyAppearance = mutation(pregame.setMyAppearance)
export const updateLobbySettings = mutation(pregame.updateLobbySettings)
export const swapLobbySeats = mutation(pregame.swapLobbySeats)
export const startGame = mutation(pregame.startGame)
export const revealMyRole = mutation(pregame.revealMyRole)
export const noteAnySeatSupport = mutation(pregame.noteAnySeatSupport)
export const updateMySeat = mutation(pregame.updateMySeat)
export const rollFirstPlayer = mutation(pregame.rollFirstPlayer)
export const chooseFirstPlayer = mutation(pregame.chooseFirstPlayer)
export const keepHand = mutation(pregame.keepHand)
export const labelGuestSeatDeck = mutation(pregame.labelGuestSeatDeck)
export const revokeInvite = mutation(lobby.revokeInvite)
export const rotateInvite = mutation(lobby.rotateInvite)
export const changeLife = mutation(tableWrites.changeLife)
export const tableAction = mutation(tableWrites.tableAction)
export const submitCommanderDamage = mutation(tableWrites.submitCommanderDamage)
export const confirmCommanderDamage = mutation(tableWrites.confirmCommanderDamage)
export const declineCommanderDamage = mutation(tableWrites.declineCommanderDamage)
export const discardUntouchedRematch = internalMutation(finish.discardUntouchedRematch)
export const finishGame = mutation(finish.finishGame)
export const endMatch = mutation(finish.endMatch)
export const finishGameWithOperation = mutation(finish.finishGameWithOperation)
export const abandonGameWithOperation = mutation(finish.abandonGameWithOperation)
export const leaveMyGame = mutation(finish.leaveMyGame)
export const abandonGame = mutation(finish.abandonGame)
export const cleanupStaleGames = internalMutation(finish.cleanupStaleGames)
export const connectedHistory = query(history.connectedHistory)
export const migrateMyHistoryEntries = mutation(history.migrateMyHistoryEntries)
export const migrateMyGameMemberships = mutation(history.migrateMyGameMemberships)
export const activeConnectedGames = query(lobby.activeConnectedGames)
export const connectedSummary = query(history.connectedSummary)
export const connectedEvents = query(history.connectedEvents)
export const watchCode = mutation(watch.watchCode)
export const watchBoard = query(watch.watchBoard)
