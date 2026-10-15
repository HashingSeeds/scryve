import { useSyncExternalStore } from "react"
import { AppState, Platform } from "react-native"
import type { Service } from "react-native-zeroconf"

import { createClientId } from "@/features/game/domain"
import { LocalGameRepository } from "@/features/game/localPersistence"

import {
  createLanGame,
  joinLanGame,
  mergeHostGame,
  parseGuestMessage,
  parseHostMessage,
  setLanConnected,
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
  private connection?: LanConnection<LanGuestMessage>
  private ownLife?: LanLife
  private reconnectTimer?: ReturnType<typeof setTimeout>

  constructor() {
    // why: iOS tears down the host's listening socket while the app is in the background.
    AppState.addEventListener("change", (appState) => {
      if (appState === "active" && this.state.role === "host" && this.serverClosed)
        void this.listen()
    })
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState = () => this.state

  private set(next: Partial<LanSessionState>) {
    this.state = { ...this.state, ...next }
    for (const listener of this.listeners) listener()
  }

  async host() {
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

  private async listen() {
    const { serviceName } = this.state
    if (!serviceName) return
    this.serverClosed = false
    await this.server?.stop()
    try {
      this.server = await hostLan<LanGuestMessage, LanHostMessage>(
        serviceName,
        parseGuestMessage,
        (peer) => this.acceptPeer(peer),
        () => {
          this.serverClosed = true
        },
      )
      this.set({ status: "connected", serviceName: this.server.name })
    } catch (error) {
      this.set({ status: "idle", error: `Could not host: ${String(error)}` })
    }
  }

  private acceptPeer(peer: LanConnection<LanHostMessage>) {
    let peerId: string | undefined
    return {
      onMessage: (message: LanGuestMessage) => {
        const game = this.state.game
        if (!game) return
        if (message.type === "join") {
          const joined = joinLanGame(game, message)
          if ("rejected" in joined) {
            peer.send({ type: "rejected", reason: joined.rejected })
            return peer.close()
          }
          peerId = message.playerId
          const previous = this.peers.get(peerId)
          this.peers.set(peerId, peer)
          previous?.close()
          return this.publish(joined)
        }
        if (peerId) this.publish(setLanLife(game, peerId, message))
      },
      onClose: () => {
        if (!peerId || this.peers.get(peerId) !== peer) return
        this.peers.delete(peerId)
        if (this.state.game) this.publish(setLanConnected(this.state.game, peerId, false))
      },
    }
  }

  private publish(game: LanGame) {
    this.set({ game })
    for (const peer of this.peers.values()) peer.send({ type: "game", game })
  }

  async join(service: Service) {
    this.ownLife = undefined
    this.set({ role: "guest", status: "connecting", serviceName: service.name, error: undefined })
    try {
      await this.connect(service)
    } catch (error) {
      this.set({ ...IDLE, error: `Could not join: ${String(error)}` })
    }
  }

  private async connect(service: Service) {
    this.connection = await connectLan<LanHostMessage, LanGuestMessage>(service, parseHostMessage, {
      onMessage: (message) => this.receive(message),
      onClose: () => {
        this.connection = undefined
        if (this.state.role !== "guest") return
        this.set({ status: "reconnecting" })
        this.scheduleReconnect()
      },
    })
    this.connection.send({
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
    const game = mergeHostGame(message.game, this.playerId, this.ownLife)
    this.set({ game, status: "connected" })
    if (game.status === "abandoned") return this.leave({ keepGame: true })
    const hostSeat = message.game.seats.find((seat) => seat.playerId === this.playerId)
    if (this.ownLife && hostSeat && this.ownLife.version > hostSeat.version)
      this.connection?.send({ type: "life", ...this.ownLife })
  }

  private scheduleReconnect() {
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(async () => {
      const { serviceName } = this.state
      if (this.state.role !== "guest" || !serviceName) return
      try {
        await this.connect(await resolveLanService(serviceName))
      } catch {
        this.scheduleReconnect()
      }
    }, RECONNECT_DELAY_MS)
  }

  changeLife(playerId: string, delta: number) {
    const { game, role } = this.state
    const seat = game?.seats.find((candidate) => candidate.playerId === playerId)
    if (!game || !seat || playerId !== this.playerId || game.status !== "active") return
    const life = { life: seat.life + delta, version: seat.version + 1 }
    if (role === "host") return this.publish(setLanLife(game, playerId, life))
    this.ownLife = life
    this.set({ game: setLanLife(game, playerId, life) })
    this.connection?.send({ type: "life", ...life })
  }

  start(startingLife: number) {
    const { game, role } = this.state
    if (role === "host" && game) this.publish(startLanGame(game, startingLife))
  }

  finish() {
    const { game, role } = this.state
    if (role === "host" && game?.status === "active") this.publish({ ...game, status: "finished" })
  }

  leave({ keepGame = false }: { keepGame?: boolean } = {}) {
    const { game, role } = this.state
    clearTimeout(this.reconnectTimer)
    if (role === "host" && game && game.status !== "abandoned")
      this.publish({ ...game, status: "abandoned" })
    const server = this.server
    const peers = [...this.peers.values()]
    this.server = undefined
    this.peers.clear()
    this.connection?.close()
    this.connection = undefined
    this.ownLife = undefined
    // why: give the abandoned state a moment to flush before the sockets close.
    setTimeout(() => {
      for (const peer of peers) peer.close()
      void server?.stop()
    }, 300)
    this.state = keepGame && game ? { ...IDLE, game } : IDLE
    for (const listener of this.listeners) listener()
  }
}

export const lanSession = new LanSession()

export const useLanSession = () => useSyncExternalStore(lanSession.subscribe, lanSession.getState)
