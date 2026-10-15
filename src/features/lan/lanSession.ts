import { useSyncExternalStore } from "react"
import { AppState, Platform } from "react-native"
import type { Service } from "react-native-zeroconf"

import { createClientId } from "@/features/game/domain"
import { LocalGameRepository } from "@/features/game/localPersistence"

import {
  connectedSeatCount,
  createLanGame,
  LAN_MIN_PLAYERS,
  joinLanGame,
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
} from "./lanGame"
import {
  connectLan,
  hostLan,
  resolveLanService,
  type LanConnection,
  type LanHost,
} from "./lanTransport"

const RECONNECT_DELAY_MS = 1_500

export interface LanSessionState {
  role?: "host" | "guest"
  status: "idle" | "connecting" | "connected" | "reconnecting"
  game?: LanGame
  serviceName?: string
  error?: string
}

const IDLE: LanSessionState = { status: "idle" }

const defaultName = () =>
  Platform.OS === "ios"
    ? Platform.isPad
      ? "iPad"
      : "iPhone"
    : Platform.OS === "android"
      ? "Android"
      : "Player"

class LanSession {
  readonly playerId = new LocalGameRepository().getDeviceId()
  private state: LanSessionState = IDLE
  private listeners = new Set<() => void>()
  private server?: LanHost
  private serverClosed = false
  private peers = new Map<string, LanConnection<LanHostMessage>>()
  // why: a socket that hasn't sent its join yet isn't in peers, but still has to close when the host leaves.
  private accepted = new Set<LanConnection<LanHostMessage>>()
  private connection?: LanConnection<LanGuestMessage>
  private ownLife?: LanLife
  private reconnectTimer?: ReturnType<typeof setTimeout>
  // why: hosting and joining finish asynchronously; one that lands after leave() must not revive the session.
  private session = 0

  constructor() {
    // why: iOS tears down the host's listening socket while the app is in the background.
    AppState.addEventListener("change", (appState) => {
      if (appState === "active" && this.state.role === "host" && this.serverClosed)
        void this.listen({ recovering: true })
    })
  }

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
    for (const listener of this.listeners) listener()
  }

  async host() {
    this.session += 1
    const name = defaultName()
    const game = createLanGame(createClientId("lan"), { playerId: this.playerId, name })
    this.set({
      role: "host",
      status: "connecting",
      game,
      serviceName: `${name} ${game.id.slice(-4)}`,
      error: undefined,
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
        () => {
          this.serverClosed = true
        },
      )
      if (session !== this.session) return void server.stop()
      this.server = server
      this.set({ status: "connected", serviceName: server.name, error: undefined })
    } catch (error) {
      if (session !== this.session) return
      const message = `Could not host: ${String(error)}`
      if (!recovering) return this.replace({ ...IDLE, error: message })
      // why: a game in progress outlives a failed restart; guests keep retrying until the host is back.
      this.serverClosed = true
      this.set({ status: "reconnecting", error: message })
      setTimeout(() => {
        if (session === this.session && this.serverClosed) void this.listen({ recovering: true })
      }, RECONNECT_DELAY_MS)
    }
  }

  private acceptPeer(peer: LanConnection<LanHostMessage>) {
    let peerId: string | undefined
    const session = this.session
    this.accepted.add(peer)
    return {
      onMessage: (message: LanGuestMessage) => {
        const game = this.state.game
        if (!game || session !== this.session) return
        if (message.type === "join") {
          const joined = joinLanGame(game, message)
          if ("rejected" in joined) {
            return peer.sendAndClose({ type: "rejected", reason: joined.rejected })
          }
          peerId = message.playerId
          const previous = this.peers.get(peerId)
          this.peers.set(peerId, peer)
          previous?.close()
          return this.publish(joined)
        }
        if (peerId && game.status === "active") this.publish(setLanLife(game, peerId, message))
      },
      onClose: () => {
        this.accepted.delete(peer)
        if (!peerId || this.peers.get(peerId) !== peer) return
        this.peers.delete(peerId)
        if (this.state.game) this.publish(releaseLanSeat(this.state.game, peerId))
      },
    }
  }

  private publish(game: LanGame) {
    this.set({ game })
    for (const peer of this.peers.values()) peer.send({ type: "game", game })
  }

  async join(service: Service) {
    this.ownLife = undefined
    this.replace({ role: "guest", status: "connecting", serviceName: service.name })
    const session = ++this.session
    try {
      await this.connect(service, session)
    } catch (error) {
      if (session === this.session)
        this.replace({ ...IDLE, error: `Could not join: ${String(error)}` })
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
          this.set({ status: "reconnecting" })
          this.scheduleReconnect(session)
        },
      },
    )
    if (session !== this.session) return connection.close()
    this.connection = connection
    connection.send({
      type: "join",
      playerId: this.playerId,
      name: defaultName(),
      ...(this.ownLife ? { life: this.ownLife } : {}),
    })
  }

  private receive(message: LanHostMessage) {
    if (message.type === "rejected") {
      this.leave()
      return this.set({ error: message.reason })
    }
    if (this.ownLife?.round !== message.game.round) this.ownLife = undefined
    const game = mergeHostGame(message.game, this.playerId, this.ownLife)
    this.set({ game, status: "connected" })
    if (game.status === "abandoned") return this.leave({ keepGame: true })
    const hostSeat = message.game.seats.find((seat) => seat.playerId === this.playerId)
    if (this.ownLife && hostSeat && this.ownLife.version > hostSeat.version)
      this.connection?.send({ type: "life", ...this.ownLife })
  }

  private scheduleReconnect(session: number) {
    clearTimeout(this.reconnectTimer)
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

  changeLife(playerId: string, delta: number) {
    const { game, role } = this.state
    const seat = game?.seats.find((candidate) => candidate.playerId === playerId)
    if (!game || !seat || playerId !== this.playerId || game.status !== "active") return
    const life = { life: seat.life + delta, version: seat.version + 1, round: game.round }
    if (role === "host") return this.publish(setLanLife(game, playerId, life))
    this.ownLife = life
    this.set({ game: setLanLife(game, playerId, life) })
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
    if (role === "host" && game && game.status !== "abandoned")
      this.publish({ ...game, status: "abandoned" })
    const server = this.server
    const peers = [...this.accepted]
    this.server = undefined
    this.peers.clear()
    this.accepted.clear()
    this.connection?.close()
    this.connection = undefined
    this.ownLife = undefined
    // why: give the abandoned state a moment to flush before the sockets close.
    setTimeout(() => {
      for (const peer of peers) peer.close()
      void server?.stop()
    }, 300)
    this.replace(keepGame && game ? { ...IDLE, game } : IDLE)
  }
}

export const lanSession = new LanSession()

export const useLanSession = () => useSyncExternalStore(lanSession.subscribe, lanSession.getState)
