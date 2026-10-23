import { useSyncExternalStore } from "react"
import { ConvexError } from "convex/values"
import type { Service } from "react-native-zeroconf"

import { createClientId } from "@/features/game/domain"
import { connectLan, resolveLanService, type LanConnection } from "@/features/lan/lanTransport"
import { loadString, saveString } from "@/utils/storage"

import type { HubCommand } from "./hubEvent"
import {
  NEARBY_EVENT_PROTOCOL,
  parseHostMessage,
  type NearbyGuestMessage,
  type NearbyHostMessage,
  type NearbyRejection,
} from "./nearbyEventProtocol"
import type { PlayerStanding } from "../../../../convex/lib/events/model"
import type { EventView } from "../eventSource"

const RECONNECT_MS = 2_000

export type ClientStatus = "idle" | "connecting" | "connected" | "lost" | "rejected"

export interface NearbyClientState {
  readonly code: string | null
  readonly status: ClientStatus
  readonly view: EventView | null
  readonly standings: readonly PlayerStanding[] | undefined
  readonly rejection?: NearbyRejection
  readonly rejectionCode?: string
}

const IDLE: NearbyClientState = { code: null, status: "idle", view: null, standings: undefined }

/** why: the host knows a device by this token, so keeping it is what brings a player back to their seat after a dropped connection. */
function deviceToken(code: string) {
  const key = `events.nearby.token.${code}`
  const saved = loadString(key)
  if (saved) return saved
  const token = createClientId("token")
  saveString(key, token)
  return token
}

class NearbyEventClient {
  private state: NearbyClientState = IDLE
  private listeners = new Set<() => void>()
  private connection: LanConnection<NearbyGuestMessage> | undefined
  private target: { service: Service; code: string; name: string } | undefined
  private pending = new Map<number, { resolve: () => void; reject: (error: Error) => void }>()
  private nextId = 1
  private retry: ReturnType<typeof setTimeout> | undefined
  private joined: (outcome: "joined" | NearbyRejection) => void = () => undefined

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState = () => this.state

  private set(patch: Partial<NearbyClientState>) {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  join(service: Service, code: string, name: string): Promise<"joined" | NearbyRejection> {
    this.leave()
    this.target = { service, code, name }
    this.set({ ...IDLE, code, status: "connecting" })
    return new Promise((resolve) => {
      this.joined = resolve
      void this.connect()
    })
  }

  leave() {
    clearTimeout(this.retry)
    this.target = undefined
    this.connection?.close()
    this.connection = undefined
    this.failPending()
    this.state = IDLE
  }

  private failPending() {
    for (const { reject } of this.pending.values()) reject(new Error("Lost the host"))
    this.pending.clear()
  }

  private async connect(resolve = false) {
    const target = this.target
    if (!target) return
    try {
      // why: a host that restarts publishes on a new port, so a retry looks the event up again by name.
      const service = resolve ? await resolveLanService(target.service.name) : target.service
      const connection = await connectLan<NearbyHostMessage, NearbyGuestMessage>(
        service,
        parseHostMessage,
        {
          onMessage: (message) => this.receive(message),
          onClose: () => this.lost(connection),
        },
      )
      if (this.target !== target) return connection.close()
      this.connection = connection
      connection.send({
        t: "hello",
        v: NEARBY_EVENT_PROTOCOL,
        code: target.code,
        name: target.name,
        token: deviceToken(target.code),
      })
    } catch {
      this.lost(undefined)
    }
  }

  private lost(connection: LanConnection<NearbyGuestMessage> | undefined) {
    if (connection && connection !== this.connection) return
    this.connection = undefined
    this.failPending()
    if (!this.target || this.state.status === "rejected") return
    this.set({ status: this.state.status === "connecting" ? "connecting" : "lost" })
    clearTimeout(this.retry)
    this.retry = setTimeout(() => void this.connect(true), RECONNECT_MS)
  }

  private receive(message: NearbyHostMessage) {
    switch (message.t) {
      case "welcome":
        this.set({ status: "connected" })
        this.joined("joined")
        return
      case "rejected":
        this.target = undefined
        this.set({ status: "rejected", rejection: message.reason, rejectionCode: message.code })
        this.joined(message.reason)
        return
      case "view":
        this.set({ view: message.view, standings: message.standings, status: "connected" })
        return
      case "done": {
        const waiting = this.pending.get(message.id)
        this.pending.delete(message.id)
        if (!waiting) return
        if (message.error === undefined) waiting.resolve()
        else
          waiting.reject(
            message.code
              ? new ConvexError({ code: message.code, message: message.error })
              : new Error(message.error),
          )
      }
    }
  }

  run(command: HubCommand): Promise<void> {
    const connection = this.connection
    if (!connection || this.state.status !== "connected")
      return Promise.reject(new Error("Not connected to the host"))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      connection.send({ t: "do", id, command })
    })
  }
}

export const nearbyEventClient = new NearbyEventClient()

export const useNearbyEventClient = () =>
  useSyncExternalStore(nearbyEventClient.subscribe, nearbyEventClient.getState)
