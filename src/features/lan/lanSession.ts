import { useSyncExternalStore } from "react"
import { AppState, Platform } from "react-native"
import { ConvexError } from "convex/values"
import type { Service } from "react-native-zeroconf"

import type { ConnectedProjection, PendingLifeAction } from "@/features/connected/model"
import type { ConnectedGameResult } from "@/features/connected/OutboxSyncController"
import type { ConnectedWrites } from "@/features/connected/useConnectedRuntime"
import { createClientId, wellFormedPlayerName } from "@/features/game/domain"
import { PLAY_SYSTEM_IDS } from "@/features/game/playSystems"
import type { OutboxAcknowledgement } from "@/features/sync/drainOutbox"
import { translate } from "@/i18n/translate"
import { load, remove, save } from "@/utils/storage"

import { archiveLanGame, hashSeatPassToken } from "./lanArchive"
import { HOSTED_GAME_KEY, loadLanName, savedHostedGame } from "./lanAvailability"
import {
  admitLanGuest,
  applyLanWrite,
  createLanGame,
  endLanRound,
  LAN_PROTOCOL,
  lanLobbyOf,
  lanProjection,
  lanRejectionMessage,
  lanRoundId,
  lanSeatsReady,
  parseGuestMessage,
  parseHostMessage,
  releaseLanSeat,
  revealLanRole,
  setLanDeck,
  setLanPlayerCount,
  startLanRound,
  type LanGame,
  type LanGuestMessage,
  type LanHostMessage,
  type LanLobby,
  type LanSeatDeck,
  type LanSeatPass,
  type LanSetup,
} from "./lanGame"
import {
  connectLan,
  hostLan,
  resolveLanService,
  type LanConnection,
  type LanHost,
} from "./lanTransport"
import { nearbyOwner, rememberSeatClaim, retrySeatClaims } from "./nearbyAccount"
import type { MemoryGame } from "../../../convex/lib/gameEngineMemory"

const RECONNECT_DELAY_MS = 1_500
// why: a guest whose host is gone for good must stop retrying and say so instead of spinning forever.
const RECONNECT_GIVE_UP_MS = 2 * 60_000
// why: a full table tapping fast would otherwise re-render the host and broadcast on every change, starving its JS thread.
const FLUSH_INTERVAL_MS = 33
// why: a host that was killed never withdraws its Bonjour advert, which can outlive it by over an hour.
const UNREACHABLE_HIDE_MS = 2 * 60_000
const WRITES_PER_SECOND = 30
const PASS_KEY = "lan.seatPass"

export interface LanSessionState {
  role?: "host" | "guest"
  status: "idle" | "connecting" | "connected" | "reconnecting"
  lobby?: LanLobby
  projection?: ConnectedProjection
  seatKey?: string
  serviceName?: string
  error?: string
}

const IDLE: LanSessionState = { status: "idle" }

const deviceName = () =>
  Platform.OS === "ios"
    ? Platform.isPad
      ? "iPad"
      : "iPhone"
    : Platform.OS === "android"
      ? "Android"
      : "Player"

const playerName = () => wellFormedPlayerName(loadLanName()) || deviceName()

// why: a guest whose app restarts mid-game reclaims its seat with this; only the latest game's pass is worth keeping.
function savedPass(serviceName: string): LanSeatPass | undefined {
  const saved = load(PASS_KEY)
  if (typeof saved !== "object" || saved === null) return undefined
  const { service, key, token } = saved as Record<string, unknown>
  return service === serviceName && typeof key === "string" && typeof token === "string"
    ? { key, token }
    : undefined
}

// why: shaped like Convex's write errors, so the outbox drops a refused change and retries a lost one exactly as it does for cloud games.
const writeFailure = ({ code, message }: { code?: string; message: string }) =>
  code ? new ConvexError({ code, message }) : new Error(message)

// why: the board reads the projection in an effect after render; settling the write a moment later keeps its pending change on screen until the new total is.
const settleAfterRender = (settle: () => void) => setTimeout(settle, FLUSH_INTERVAL_MS)

const savedMemory = ({ seats, events, claims, pairs, ...memory }: MemoryGame) => ({
  ...memory,
  seats: [...seats],
  events: [...events],
  claims: [...claims],
  pairs: [...pairs],
})

const restoredMemory = ({
  seats,
  events,
  claims,
  pairs,
  ...memory
}: ReturnType<typeof savedMemory>): MemoryGame => ({
  ...memory,
  seats: new Map(seats),
  events: new Map(events),
  claims: new Map(claims),
  pairs: new Map(pairs),
})

interface HostedGame {
  protocol: number
  savedAt: number
  game: Omit<LanGame, "memory"> & { memory?: ReturnType<typeof savedMemory> }
  seatKey: string
  serviceName: string
  tokens: [string, string][]
  roundOwner?: string
}

type PendingWrite = {
  resolve: (ack: OutboxAcknowledgement) => void
  reject: (cause: Error) => void
}

export class LanSession {
  private state: LanSessionState = IDLE
  private listeners = new Set<() => void>()
  private game?: LanGame
  private server?: LanHost
  private serverClosed = false
  private tokens = new Map<string, string>()
  private passHashes = new Map<string, Promise<string | undefined>>()
  private peers = new Map<string, LanConnection<LanHostMessage>>()
  // why: a socket that hasn't sent its join yet isn't in peers, but still has to close when the host leaves.
  private accepted = new Set<LanConnection<LanHostMessage>>()
  private replies = new Map<string, LanHostMessage[]>()
  private hostAcks: (() => void)[] = []
  private connection?: LanConnection<LanGuestMessage>
  private pass?: LanSeatPass
  private claimedRound?: string
  private roundOwner?: string
  private finishedRound?: string
  private pendingWrites = new Map<string, PendingWrite>()
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private reconnectingSince?: number
  private unreachableAt = new Map<string, number>()
  private flushTimer?: ReturnType<typeof setTimeout>
  private flushedAt = 0
  // why: hosting and joining finish asynchronously; one that lands after leave() must not revive the session.
  private session = 0
  private backgrounded = false

  constructor() {
    // why: iOS reclaims the host's listening socket while the app is in the background, without a close event, so guests are refused until the host listens again.
    AppState.addEventListener("change", (appState) => {
      this.backgrounded = appState === "background"
      if (this.backgrounded) {
        if (this.state.role === "host") this.serverClosed = true
        return this.saveHostedGame()
      }
      if (appState !== "active" || this.state.role !== "host") return
      remove(HOSTED_GAME_KEY)
      if (this.serverClosed) void this.listen({ recovering: true })
    })
  }

  readonly writes: ConnectedWrites = {
    send: (action) =>
      this.state.role === "host" ? this.hostWrite(action) : this.guestWrite(action),
    finish: async (result) => this.finish(result),
    abandon: async () => this.leave(),
  }

  isReachable = (serviceName: string) =>
    Date.now() - (this.unreachableAt.get(serviceName) ?? 0) > UNREACHABLE_HIDE_MS

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState = () => this.state

  private set(next: Partial<LanSessionState>) {
    this.replace({ ...this.state, ...next })
  }

  private replace(next: LanSessionState) {
    this.state = next
    this.notify()
  }

  private notify() {
    for (const listener of this.listeners) listener()
  }

  async host(setup: LanSetup) {
    this.session += 1
    this.tokens.clear()
    this.passHashes.clear()
    const name = playerName()
    const seatKey = createClientId("seat")
    const game = createLanGame(createClientId("lan"), seatKey, name, setup, Date.now())
    this.game = game
    this.replace({
      role: "host",
      status: "connecting",
      seatKey,
      serviceName: `${name} ${game.id.slice(-4)}`,
      lobby: lanLobbyOf(game),
      projection: lanProjection(game, seatKey),
    })
    await this.listen()
  }

  private async listen({ recovering = false }: { recovering?: boolean } = {}) {
    const { serviceName } = this.state
    if (!serviceName) return
    const session = this.session
    this.serverClosed = false
    await this.server?.stop()
    try {
      const server = await hostLan<LanGuestMessage, LanHostMessage>(
        serviceName,
        parseGuestMessage,
        (peer) => this.acceptPeer(peer),
        () => session === this.session && this.recoverHost(session),
      )
      if (session !== this.session) return void server.stop()
      this.server = server
      this.set({ status: "connected", serviceName: server.name, error: undefined })
    } catch (error) {
      if (session !== this.session) return
      const message = translate("connected:nearby.errors.hostFailed", { error: String(error) })
      if (!recovering) return this.replace({ ...IDLE, error: message })
      this.recoverHost(session, message)
    }
  }

  // why: a game in progress outlives its listener; guests keep retrying until the host listens again.
  private recoverHost(session: number, error?: string) {
    this.serverClosed = true
    this.set({ status: "reconnecting", ...(error ? { error } : {}) })
    if (AppState.currentState !== "active") return
    setTimeout(() => {
      if (session === this.session && this.serverClosed) void this.listen({ recovering: true })
    }, RECONNECT_DELAY_MS)
  }

  private saveHostedGame() {
    const { game, roundOwner } = this
    const { role, seatKey, serviceName } = this.state
    if (role !== "host" || game?.status !== "active" || !seatKey || !serviceName)
      return remove(HOSTED_GAME_KEY)
    const { memory, ...rest } = game
    const hosted: HostedGame = {
      protocol: LAN_PROTOCOL,
      savedAt: Date.now(),
      game: { ...rest, ...(memory ? { memory: savedMemory(memory) } : {}) },
      seatKey,
      serviceName,
      tokens: [...this.tokens],
      ...(roundOwner ? { roundOwner } : {}),
    }
    save(HOSTED_GAME_KEY, hosted)
  }

  resumeHostedGame() {
    const saved = savedHostedGame()
    remove(HOSTED_GAME_KEY)
    if (this.state.role || !saved || !("protocol" in saved) || saved.protocol !== LAN_PROTOCOL)
      return
    const { game: stored, seatKey, serviceName, tokens, roundOwner } = saved as HostedGame
    const { memory, ...rest } = stored
    const game: LanGame = {
      ...rest,
      ...(memory ? { memory: restoredMemory(memory) } : {}),
      seats: rest.seats.map((seat) => ({ ...seat, connected: seat.key === rest.hostKey })),
    }
    this.session += 1
    this.game = game
    this.roundOwner = roundOwner
    this.tokens = new Map(tokens)
    this.passHashes.clear()
    for (const [key, token] of tokens) this.hashPass({ key, token })
    this.replace({
      role: "host",
      status: "connecting",
      seatKey,
      serviceName,
      lobby: lanLobbyOf(game),
      projection: lanProjection(game, seatKey),
    })
    void this.listen({ recovering: true })
  }

  private acceptPeer(peer: LanConnection<LanHostMessage>) {
    let seatKey: string | undefined
    let windowStart = 0
    let writes = 0
    const session = this.session
    this.accepted.add(peer)
    return {
      onMessage: (message: LanGuestMessage) => {
        const game = this.game
        if (!game || session !== this.session) return
        if (message.type === "join") {
          if (seatKey) return
          const fresh = { key: createClientId("seat"), token: createClientId("token") }
          const admitted = admitLanGuest(game, this.tokens, message, fresh)
          if ("rejected" in admitted)
            return peer.sendAndClose({ type: "rejected", reason: admitted.rejected })
          seatKey = admitted.pass.key
          this.tokens.set(admitted.pass.key, admitted.pass.token)
          this.hashPass(admitted.pass)
          const previous = this.peers.get(seatKey)
          this.peers.set(seatKey, peer)
          previous?.close()
          peer.send({ type: "welcome", pass: admitted.pass })
          return this.publish(admitted.game)
        }
        if (!seatKey) return
        const now = Date.now()
        if (now - windowStart >= 1_000) {
          windowStart = now
          writes = 0
        }
        const limited = ++writes > WRITES_PER_SECOND
        if (message.type !== "op") {
          const changed = limited
            ? game
            : message.type === "reveal"
              ? revealLanRole(game, seatKey, now)
              : setLanDeck(game, seatKey, message.deck)
          return changed === game ? undefined : this.publish(changed)
        }
        const { operationId } = message.event
        if (limited)
          return peer.send({
            type: "nack",
            operationId,
            code: "rate_limited",
            message: "Too many changes at once",
          })
        const { game: next, result } = applyLanWrite(game, seatKey, message.event, now)
        this.queueReply(
          seatKey,
          result.ok
            ? { type: "ack", operationId }
            : {
                type: "nack",
                operationId,
                ...(result.error.code ? { code: result.error.code } : {}),
                message: result.error.message,
              },
        )
        this.publish(next)
      },
      onClose: () => {
        this.accepted.delete(peer)
        const game = this.game
        if (!seatKey || this.peers.get(seatKey) !== peer || !game) return
        this.peers.delete(seatKey)
        this.replies.delete(seatKey)
        if (game.status === "lobby") {
          this.tokens.delete(seatKey)
          this.passHashes.delete(seatKey)
        }
        this.publish(releaseLanSeat(game, seatKey))
      },
    }
  }

  private queueReply(seatKey: string, reply: LanHostMessage) {
    this.replies.set(seatKey, [...(this.replies.get(seatKey) ?? []), reply])
  }

  // why: guests only ever need the latest snapshot, so one flush covers every change since the last.
  private publish(game: LanGame) {
    this.game = game
    const wait = Math.max(0, this.flushedAt + FLUSH_INTERVAL_MS - Date.now())
    this.flushTimer ??= setTimeout(() => this.flush(), wait)
  }

  private flush() {
    this.flushTimer = undefined
    this.flushedAt = Date.now()
    const game = this.game
    const { seatKey } = this.state
    if (!game || !seatKey) return
    this.set({ lobby: lanLobbyOf(game), projection: lanProjection(game, seatKey) })
    for (const settle of this.hostAcks.splice(0)) settleAfterRender(settle)
    const lobby = lanLobbyOf(game)
    for (const [key, peer] of this.peers) {
      peer.send(
        { type: "state", lobby, projection: lanProjection(game, key) },
        ...(this.replies.get(key) ?? []),
      )
    }
    this.replies.clear()
    if (this.backgrounded) this.saveHostedGame()
  }

  private hostWrite({ event }: PendingLifeAction): Promise<OutboxAcknowledgement> {
    const game = this.game
    const { seatKey } = this.state
    if (!game || !seatKey) return Promise.reject(new Error("No nearby game"))
    const { game: next, result } = applyLanWrite(game, seatKey, event, Date.now())
    if (!result.ok) return Promise.reject(writeFailure(result.error))
    this.publish(next)
    return new Promise((resolve) =>
      this.hostAcks.push(() => resolve({ operationId: event.operationId })),
    )
  }

  private guestWrite({ event }: PendingLifeAction): Promise<OutboxAcknowledgement> {
    const connection = this.connection
    if (!connection || this.state.status !== "connected")
      return Promise.reject(new Error("Not connected to the host"))
    return new Promise((resolve, reject) => {
      this.pendingWrites.set(event.operationId, { resolve, reject })
      connection.send({ type: "op", event })
    })
  }

  private rejectPendingWrites(reason: string) {
    for (const { reject } of this.pendingWrites.values()) reject(new Error(reason))
    this.pendingWrites.clear()
  }

  async join(service: Service) {
    this.pass = savedPass(service.name)
    const session = ++this.session
    this.replace({
      role: "guest",
      status: "connecting",
      serviceName: service.name,
      ...(this.pass ? { seatKey: this.pass.key } : {}),
    })
    try {
      await this.connect(service, session)
    } catch {
      if (session !== this.session) return
      this.unreachableAt.set(service.name, Date.now())
      this.replace({
        ...IDLE,
        error: translate("connected:nearby.errors.unreachable", { name: service.name }),
      })
    }
  }

  private async connect(service: Service, session: number) {
    const connection = await connectLan<LanHostMessage, LanGuestMessage>(
      service,
      parseHostMessage,
      {
        onMessage: (message) => session === this.session && this.receive(message),
        onClose: () => {
          if (session !== this.session) return
          this.connection = undefined
          this.rejectPendingWrites("Lost the host")
          this.reconnectingSince ??= Date.now()
          this.set({ status: "reconnecting" })
          this.scheduleReconnect(session)
        },
      },
    )
    if (session !== this.session) return connection.close()
    this.connection = connection
    connection.send({
      type: "join",
      protocol: LAN_PROTOCOL,
      name: playerName(),
      systems: PLAY_SYSTEM_IDS,
      variants: ["treachery"],
      ...(this.pass ? { pass: this.pass } : {}),
    })
  }

  private receive(message: LanHostMessage) {
    if (message.type === "rejected" || message.type === "outdated") {
      remove(PASS_KEY)
      this.leave()
      return this.set({
        error:
          message.type === "rejected"
            ? lanRejectionMessage(message.reason)
            : translate("connected:nearby.rejected.hostOutdated"),
      })
    }
    if (message.type === "welcome") {
      this.pass = message.pass
      save(PASS_KEY, { service: this.state.serviceName, ...message.pass })
      return this.set({ seatKey: message.pass.key })
    }
    if (message.type === "ack" || message.type === "nack") {
      const pending = this.pendingWrites.get(message.operationId)
      this.pendingWrites.delete(message.operationId)
      if (!pending) return
      if (message.type === "ack")
        return settleAfterRender(() => pending.resolve({ operationId: message.operationId }))
      return pending.reject(writeFailure(message))
    }
    this.reconnectingSince = undefined
    const { seatKey } = this.state
    this.set({ lobby: message.lobby, projection: message.projection, status: "connected" })
    const round = lanRoundId(message.lobby)
    const { status } = message.lobby
    const { pass } = this
    const deckVersionId = message.lobby.seats.find((seat) => seat.key === pass?.key)?.deck
      ?.versionId
    if (
      (status === "active" || status === "finished") &&
      pass &&
      this.claimedRound !== round &&
      rememberSeatClaim({
        publicId: round,
        token: pass.token,
        savedAt: Date.now(),
        ...(deckVersionId ? { deckVersionId } : {}),
      })
    )
      this.claimedRound = round
    if (status === "finished" && this.claimedRound === round && this.finishedRound !== round) {
      this.finishedRound = round
      retrySeatClaims()
    }
    if (message.lobby.status === "abandoned") {
      this.leave({ keepGame: true })
      // why: the board needs the seat to stay open and tell this guest the host ended the game.
      this.set({ seatKey })
    }
  }

  private scheduleReconnect(session: number) {
    clearTimeout(this.reconnectTimer)
    if (Date.now() - (this.reconnectingSince ?? Date.now()) > RECONNECT_GIVE_UP_MS) {
      this.leave({ keepGame: true })
      return this.set({ error: translate("connected:nearby.errors.lostHost") })
    }
    this.reconnectTimer = setTimeout(async () => {
      const { serviceName } = this.state
      if (session !== this.session || !serviceName) return
      try {
        const service = await resolveLanService(serviceName)
        if (session === this.session) await this.connect(service, session)
      } catch {
        if (session === this.session) this.scheduleReconnect(session)
      }
    }, RECONNECT_DELAY_MS)
  }

  updateSettings({ playerCount }: { playerCount: number }) {
    const game = this.game
    if (this.state.role !== "host" || !game) return
    const next = setLanPlayerCount(game, playerCount)
    if (next !== game) this.publish(next)
  }

  selectDeck = async (deck: LanSeatDeck | null) => {
    const { role, seatKey, status } = this.state
    const game = this.game
    if (role === "host" && game && seatKey) return this.publish(setLanDeck(game, seatKey, deck))
    if (!this.connection || status !== "connected") throw new Error("Not connected to the host")
    this.connection.send({ type: "deck", deck })
  }

  revealRole = async () => {
    const { role, seatKey, status } = this.state
    const game = this.game
    if (role === "host" && game && seatKey) {
      const revealed = revealLanRole(game, seatKey, Date.now())
      return revealed === game ? undefined : this.publish(revealed)
    }
    if (!this.connection || status !== "connected") throw new Error("Not connected to the host")
    this.connection.send({ type: "reveal" })
  }

  start() {
    const game = this.game
    if (this.state.role === "host" && game && game.status !== "active" && lanSeatsReady(game)) {
      this.roundOwner = nearbyOwner()
      this.publish(startLanRound(game, Date.now()))
    }
  }

  private hashPass({ key, token }: LanSeatPass) {
    this.passHashes.set(
      key,
      hashSeatPassToken(token).catch(() => undefined),
    )
  }

  async finish(result?: ConnectedGameResult) {
    const { game: started, session } = this
    if (this.state.role !== "host" || started?.status !== "active") return
    const hashes = new Map<string, string>()
    for (const [key, hash] of this.passHashes) {
      const value = await hash
      if (value) hashes.set(key, value)
    }
    const game = this.game
    if (session !== this.session || game?.status !== "active" || game.round !== started.round)
      return
    const now = Date.now()
    archiveLanGame({ ...game, updatedAt: now }, result, hashes, this.roundOwner)
    this.publish(endLanRound(game, "finished", now))
    clearTimeout(this.flushTimer)
    this.flush()
  }

  leave({ keepGame = false }: { keepGame?: boolean } = {}) {
    const { role, lobby, projection } = this.state
    const game = this.game
    this.session += 1
    clearTimeout(this.reconnectTimer)
    clearTimeout(this.flushTimer)
    this.flushTimer = undefined
    this.reconnectingSince = undefined
    if (role === "host" && game) {
      const ended = game.status === "abandoned" ? game : endLanRound(game, "abandoned", Date.now())
      const endedLobby = lanLobbyOf(ended)
      // why: sendAndClose waits for the flush, so every guest learns the game ended instead of reconnecting to nothing.
      for (const [key, peer] of this.peers)
        peer.sendAndClose({
          type: "state",
          lobby: endedLobby,
          projection: lanProjection(ended, key),
        })
      for (const peer of this.accepted) if (![...this.peers.values()].includes(peer)) peer.close()
    }
    void this.server?.stop()
    this.server = undefined
    this.game = undefined
    this.peers.clear()
    this.accepted.clear()
    this.tokens.clear()
    this.passHashes.clear()
    this.replies.clear()
    for (const settle of this.hostAcks.splice(0)) settle()
    this.rejectPendingWrites("Left the game")
    this.connection?.close()
    this.connection = undefined
    remove(HOSTED_GAME_KEY)
    this.replace(keepGame && lobby && projection ? { ...IDLE, lobby, projection } : IDLE)
  }
}

export const lanSession = new LanSession()

export const useLanSession = () => useSyncExternalStore(lanSession.subscribe, lanSession.getState)
