import { useSyncExternalStore } from "react"
import { AppState, Platform } from "react-native"
import type { Service } from "react-native-zeroconf"

import { createClientId } from "@/features/game/domain"
import { load, remove, save } from "@/utils/storage"

import { loadLanName } from "./lanAvailability"
import {
  admitLanGuest,
  connectedSeatCount,
  createLanGame,
  LAN_MIN_PLAYERS,
  mergeHostGame,
  parseGuestMessage,
  parseHostMessage,
  releaseLanSeat,
  setLanLife,
  startLanGame,
  type LanGame,
  type LanGuestMessage,
  type LanHostMessage,
  type LanLife,
  type LanSeatPass,
} from "./lanGame"
import {
  connectLan,
  hostLan,
  resolveLanService,
  type LanConnection,
  type LanHost,
} from "./lanTransport"

const RECONNECT_DELAY_MS = 1_500
// why: a guest whose host is gone for good must stop retrying and say so instead of spinning forever.
const RECONNECT_GIVE_UP_MS = 2 * 60_000
// why: a full table tapping fast would otherwise re-render the host and broadcast on every change, starving its JS thread.
const FLUSH_INTERVAL_MS = 33
// why: a host that was killed never withdraws its Bonjour advert, which can outlive it by over an hour.
const UNREACHABLE_HIDE_MS = 2 * 60_000
const PASS_KEY = "lan.seatPass"

export interface LanSessionState {
  role?: "host" | "guest"
  status: "idle" | "connecting" | "connected" | "reconnecting"
  game?: LanGame
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

const playerName = () => loadLanName().trim() || deviceName()

// why: a guest whose app restarts mid-game reclaims its seat with this; only the latest game's pass is worth keeping.
function savedPass(serviceName: string): LanSeatPass | undefined {
  const saved = load(PASS_KEY)
  if (typeof saved !== "object" || saved === null) return undefined
  const { service, key, token } = saved as Record<string, unknown>
  return service === serviceName && typeof key === "string" && typeof token === "string"
    ? { key, token }
    : undefined
}

export class LanSession {
  private state: LanSessionState = IDLE
  private listeners = new Set<() => void>()
  private server?: LanHost
  private serverClosed = false
  private tokens = new Map<string, string>()
  private peers = new Map<string, LanConnection<LanHostMessage>>()
  // why: a socket that hasn't sent its join yet isn't in peers, but still has to close when the host leaves.
  private accepted = new Set<LanConnection<LanHostMessage>>()
  private connection?: LanConnection<LanGuestMessage>
  private pass?: LanSeatPass
  private ownLife?: LanLife
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private reconnectingSince?: number
  private unreachableAt = new Map<string, number>()
  private flushTimer?: ReturnType<typeof setTimeout>
  private flushedAt = 0
  // why: hosting and joining finish asynchronously; one that lands after leave() must not revive the session.
  private session = 0

  constructor() {
    // why: iOS tears down the host's listening socket while the app is in the background.
    AppState.addEventListener("change", (appState) => {
      if (appState === "active" && this.state.role === "host" && this.serverClosed)
        void this.listen({ recovering: true })
    })
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

  async host() {
    this.session += 1
    this.tokens.clear()
    const name = playerName()
    const seatKey = createClientId("seat")
    const game = createLanGame(createClientId("lan"), seatKey, name)
    this.replace({
      role: "host",
      status: "connecting",
      game,
      seatKey,
      serviceName: `${name} ${game.id.slice(-4)}`,
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
      const message = `Could not host: ${String(error)}`
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

  private acceptPeer(peer: LanConnection<LanHostMessage>) {
    let seatKey: string | undefined
    const session = this.session
    this.accepted.add(peer)
    return {
      onMessage: (message: LanGuestMessage) => {
        const game = this.state.game
        if (!game || session !== this.session) return
        if (message.type === "join") {
          if (seatKey) return
          const fresh = { key: createClientId("seat"), token: createClientId("token") }
          const admitted = admitLanGuest(game, this.tokens, message, fresh)
          if ("rejected" in admitted)
            return peer.sendAndClose({ type: "rejected", reason: admitted.rejected })
          seatKey = admitted.pass.key
          this.tokens.set(admitted.pass.key, admitted.pass.token)
          const previous = this.peers.get(seatKey)
          this.peers.set(seatKey, peer)
          previous?.close()
          peer.send({ type: "welcome", pass: admitted.pass })
          return this.publish(admitted.game)
        }
        if (seatKey && game.status === "active") this.publish(setLanLife(game, seatKey, message))
      },
      onClose: () => {
        this.accepted.delete(peer)
        const game = this.state.game
        if (!seatKey || this.peers.get(seatKey) !== peer || !game) return
        this.peers.delete(seatKey)
        if (game.status === "lobby") this.tokens.delete(seatKey)
        this.publish(releaseLanSeat(game, seatKey))
      },
    }
  }

  // why: guests only ever need the latest snapshot, so one flush covers every change since the last; an idle host sends at once instead of waiting out a window.
  private publish(game: LanGame) {
    this.state = { ...this.state, game }
    const wait = Math.max(0, this.flushedAt + FLUSH_INTERVAL_MS - Date.now())
    this.flushTimer ??= setTimeout(() => this.flush(), wait)
  }

  private flush() {
    this.flushTimer = undefined
    this.flushedAt = Date.now()
    this.notify()
    const { game } = this.state
    if (!game) return
    for (const peer of this.peers.values()) peer.send({ type: "game", game })
  }

  async join(service: Service) {
    this.ownLife = undefined
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
      this.replace({ ...IDLE, error: `${service.name} isn't reachable. The game may have ended.` })
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
      name: playerName(),
      ...(this.pass ? { pass: this.pass } : {}),
      ...(this.ownLife ? { life: this.ownLife } : {}),
    })
  }

  private receive(message: LanHostMessage) {
    if (message.type === "rejected") {
      remove(PASS_KEY)
      this.leave()
      return this.set({ error: message.reason })
    }
    if (message.type === "welcome") {
      this.pass = message.pass
      save(PASS_KEY, { service: this.state.serviceName, ...message.pass })
      return this.set({ seatKey: message.pass.key })
    }
    this.reconnectingSince = undefined
    const { seatKey } = this.state
    if (this.ownLife?.round !== message.game.round) this.ownLife = undefined
    const game = seatKey ? mergeHostGame(message.game, seatKey, this.ownLife) : message.game
    this.set({ game, status: "connected" })
    if (game.status === "abandoned") {
      this.leave({ keepGame: true })
      // why: the board needs the seat to stay open and tell this guest the host ended the game.
      return this.set({ seatKey })
    }
    const hostSeat = message.game.seats.find((seat) => seat.key === seatKey)
    if (this.ownLife && hostSeat && this.ownLife.version > hostSeat.version)
      this.connection?.send({ type: "life", ...this.ownLife })
  }

  private scheduleReconnect(session: number) {
    clearTimeout(this.reconnectTimer)
    if (Date.now() - (this.reconnectingSince ?? Date.now()) > RECONNECT_GIVE_UP_MS) {
      this.leave({ keepGame: true })
      return this.set({ error: "Lost the host. The game may have ended." })
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

  changeLife(seatKey: string, delta: number) {
    const { game, role } = this.state
    const seat = game?.seats.find((candidate) => candidate.key === seatKey)
    if (!game || !seat || seatKey !== this.state.seatKey || game.status !== "active") return
    const life = { life: seat.life + delta, version: seat.version + 1, round: game.round }
    if (role === "host") return this.publish(setLanLife(game, seatKey, life))
    this.ownLife = life
    this.set({ game: setLanLife(game, seatKey, life) })
    this.connection?.send({ type: "life", ...life })
  }

  start(startingLife: number) {
    const { game, role } = this.state
    if (role === "host" && game && connectedSeatCount(game) >= LAN_MIN_PLAYERS)
      this.publish(startLanGame(game, startingLife))
  }

  finish() {
    const { game, role } = this.state
    if (role === "host" && game?.status === "active") this.publish({ ...game, status: "finished" })
  }

  leave({ keepGame = false }: { keepGame?: boolean } = {}) {
    const { game, role } = this.state
    this.session += 1
    clearTimeout(this.reconnectTimer)
    clearTimeout(this.flushTimer)
    this.flushTimer = undefined
    this.reconnectingSince = undefined
    if (role === "host" && game) {
      const ended: LanGame = game.status === "abandoned" ? game : { ...game, status: "abandoned" }
      // why: sendAndClose waits for the flush, so every guest learns the game ended instead of reconnecting to nothing.
      for (const peer of this.peers.values()) peer.sendAndClose({ type: "game", game: ended })
      for (const peer of this.accepted) if (![...this.peers.values()].includes(peer)) peer.close()
    }
    void this.server?.stop()
    this.server = undefined
    this.peers.clear()
    this.accepted.clear()
    this.tokens.clear()
    this.connection?.close()
    this.connection = undefined
    this.ownLife = undefined
    this.replace(keepGame && game ? { ...IDLE, game } : IDLE)
  }
}

export const lanSession = new LanSession()

export const useLanSession = () => useSyncExternalStore(lanSession.subscribe, lanSession.getState)
