import type { HubCommand } from "./hubEvent"
import type { PlayerStanding } from "../../../../convex/lib/events/model"
import type { EventView } from "../eventSource"

export const NEARBY_EVENT_PROTOCOL = 1
/** why: events share the `_scryve._tcp` Bonjour type with nearby games (a new type needs a native build), so the name tells them apart. */
export const NEARBY_EVENT_PREFIX = "event-"

// why: Bonjour names stop at 63 bytes, and the code must survive whole for joining.
export const nearbyEventServiceName = (code: string, name: string) =>
  `${NEARBY_EVENT_PREFIX}${code} ${name}`.slice(0, 60)
export const isNearbyEventService = (name: string) => name.startsWith(NEARBY_EVENT_PREFIX)
export const nearbyEventCode = (service: string) =>
  service.slice(NEARBY_EVENT_PREFIX.length, NEARBY_EVENT_PREFIX.length + 6)
export const nearbyEventTitle = (service: string) => service.slice(NEARBY_EVENT_PREFIX.length + 7)

export type NearbyGuestMessage =
  | {
      readonly t: "hello"
      readonly v: number
      readonly code: string
      readonly name: string
      readonly token: string
    }
  | { readonly t: "do"; readonly id: number; readonly command: HubCommand }

export type NearbyRejection = "code" | "protocol" | "closed" | "invalid"

export type NearbyHostMessage =
  | { readonly t: "welcome"; readonly playerId: string }
  | { readonly t: "rejected"; readonly reason: NearbyRejection; readonly code?: string }
  | {
      readonly t: "view"
      readonly view: EventView
      readonly standings: readonly PlayerStanding[]
    }
  | { readonly t: "done"; readonly id: number; readonly error?: string; readonly code?: string }

const COMMAND_KINDS = new Set<HubCommand["kind"]>([
  "update",
  "addGuest",
  "drop",
  "undrop",
  "startRound",
  "report",
  "confirm",
  "clock",
  "finish",
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export function parseGuestMessage(line: string): NearbyGuestMessage | null {
  const message: unknown = JSON.parse(line)
  if (!isRecord(message)) return null
  if (message.t === "hello") {
    const { v, code, name, token } = message
    return typeof v === "number" &&
      typeof code === "string" &&
      typeof name === "string" &&
      typeof token === "string" &&
      token.length >= 16 &&
      token.length <= 128
      ? { t: "hello", v, code, name, token }
      : null
  }
  if (message.t === "do") {
    const { id, command } = message
    if (typeof id !== "number" || !isRecord(command)) return null
    const kind = command.kind
    if (typeof kind !== "string" || !COMMAND_KINDS.has(kind as HubCommand["kind"])) return null
    return { t: "do", id, command: command as unknown as HubCommand }
  }
  return null
}

export function parseHostMessage(line: string): NearbyHostMessage | null {
  const message: unknown = JSON.parse(line)
  if (!isRecord(message) || typeof message.t !== "string") return null
  return message as unknown as NearbyHostMessage
}
