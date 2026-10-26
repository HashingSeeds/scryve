import { useSyncExternalStore } from "react"

import { createClientId } from "@/features/game/domain"
import { hostLan, type LanConnection, type LanHost } from "@/features/lan/lanTransport"
import { convexErrorCode } from "@/utils/convexError"
import { load, remove, save } from "@/utils/storage"

import { applyHubCommand, joinHub, type HubCommand, type HubEvent } from "./hubEvent"
import { guestViewMessage, nextHostFeed, type HostFeed } from "./nearbyEventFeed"
import {
  NEARBY_EVENT_PROTOCOL,
  nearbyEventServiceName,
  parseGuestMessage,
  type NearbyGuestMessage,
  type NearbyHostMessage,
} from "./nearbyEventProtocol"
import type { EventActor } from "../../../../convex/lib/events/commands"

const STORAGE_KEY = "events.nearby.hosted"

export type HostStatus = "idle" | "starting" | "hosting" | "error"

export interface NearbyHostState {
  readonly event: HubEvent | null
  readonly hostPlayerId: string | null
  readonly status: HostStatus
  readonly error?: string
}

interface Guest {
  playerId: string | null
  patches: boolean
  synced: boolean
}

function stored(): Pick<NearbyHostState, "event" | "hostPlayerId"> {
  const value = load(STORAGE_KEY)
  if (typeof value !== "object" || value === null || !("event" in value)) {
    return { event: null, hostPlayerId: null }
  }
  const { event, hostPlayerId } = value as { event: HubEvent; hostPlayerId?: string | null }
  return { event, hostPlayerId: hostPlayerId ?? null }
}

class NearbyEventHost {
  private state: NearbyHostState = { ...stored(), status: "idle" }
  private listeners = new Set<() => void>()
  private guests = new Map<LanConnection<NearbyHostMessage>, Guest>()
  private server: LanHost | undefined
  private feed: HostFeed | undefined

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState = () => this.state

  private set(patch: Partial<NearbyHostState>) {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  private commit(event: HubEvent, hostPlayerId = this.state.hostPlayerId) {
    save(STORAGE_KEY, { event, hostPlayerId })
    this.set({ event, hostPlayerId })
    this.broadcast()
  }

  async create(event: HubEvent, organizerPlays: { name: string } | null) {
    if (this.state.event && this.state.event.status !== "finished")
      throw new Error("Finish the event this device is running first")
    let next = event
    let hostPlayerId: string | null = null
    if (organizerPlays) {
      const joined = joinHub(
        next,
        { name: organizerPlays.name, token: createClientId("token") },
        createClientId("player"),
      )
      next = joined.event
      hostPlayerId = joined.playerId
    }
    await this.stop()
    this.commit(next, hostPlayerId)
    await this.start()
  }

  async start() {
    const { event, status } = this.state
    if (!event || status === "starting" || status === "hosting") return
    this.set({ status: "starting", error: undefined })
    try {
      this.server = await hostLan<NearbyGuestMessage, NearbyHostMessage>(
        nearbyEventServiceName(event.code, event.name),
        parseGuestMessage,
        (peer) => this.admit(peer),
        () => {
          this.server = undefined
          this.set({ status: "error", error: "closed" })
        },
      )
      this.set({ status: "hosting" })
    } catch (cause) {
      this.set({ status: "error", error: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  async stop() {
    const server = this.server
    this.server = undefined
    for (const peer of this.guests.keys()) peer.close()
    this.guests.clear()
    if (server) await server.stop()
    this.set({ status: "idle" })
  }

  async discard() {
    await this.stop()
    remove(STORAGE_KEY)
    this.set({ event: null, hostPlayerId: null })
  }

  run(command: HubCommand) {
    const { event } = this.state
    if (!event) throw new Error("No nearby event")
    this.commit(applyHubCommand(event, { kind: "organizer" }, command, Date.now()))
  }

  private admit(peer: LanConnection<NearbyHostMessage>) {
    const guest: Guest = { playerId: null, patches: false, synced: false }
    this.guests.set(peer, guest)
    return {
      onMessage: (message: NearbyGuestMessage) => this.receive(peer, guest, message),
      onClose: () => this.guests.delete(peer),
    }
  }

  private receive(
    peer: LanConnection<NearbyHostMessage>,
    guest: Guest,
    message: NearbyGuestMessage,
  ) {
    const { event } = this.state
    if (!event) return peer.sendAndClose({ t: "rejected", reason: "closed" })
    if (message.t === "hello") {
      if (guest.playerId) return
      if (message.v !== NEARBY_EVENT_PROTOCOL)
        return peer.sendAndClose({ t: "rejected", reason: "protocol" })
      if (message.code.toUpperCase() !== event.code)
        return peer.sendAndClose({ t: "rejected", reason: "code" })
      try {
        const joined = joinHub(event, message, createClientId("player"))
        guest.playerId = joined.playerId
        guest.patches = message.patches === true
        peer.send({ t: "welcome", playerId: joined.playerId })
        if (joined.event !== event) this.commit(joined.event)
        else this.broadcast()
      } catch (cause) {
        peer.sendAndClose({ t: "rejected", reason: "invalid", code: convexErrorCode(cause) })
      }
      return
    }
    if (!guest.playerId) return peer.sendAndClose({ t: "rejected", reason: "invalid" })
    const actor: EventActor = { kind: "player", playerId: guest.playerId }
    try {
      const next = applyHubCommand(event, actor, message.command, Date.now())
      peer.send({ t: "done", id: message.id })
      this.commit(next)
    } catch (cause) {
      peer.send({
        t: "done",
        id: message.id,
        error: cause instanceof Error ? cause.message : "failed",
        code: convexErrorCode(cause),
      })
    }
  }

  private broadcast() {
    const { event } = this.state
    if (!event) return
    const { feed, patch } = nextHostFeed(this.feed, event)
    this.feed = feed
    for (const [peer, guest] of this.guests) {
      if (!guest.playerId) continue
      if (patch && guest.synced && guest.patches) peer.send(patch)
      else if (patch || !guest.synced) {
        guest.synced = true
        peer.send(guestViewMessage(feed, guest.playerId))
      }
    }
  }
}

export const nearbyEventHost = new NearbyEventHost()

export const useNearbyEventHost = () =>
  useSyncExternalStore(nearbyEventHost.subscribe, nearbyEventHost.getState)
