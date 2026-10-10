import type { GameCommand, LocalGame } from "@/features/game/types"

/** why: guests may only touch life and commander damage; ending or undoing stays with the host. */
export type TableCommand = Extract<GameCommand, { type: "life.change" | "commanderDamage.assign" }>

export type TableMessage =
  { type: "sync" } | { type: "command"; command: TableCommand } | { type: "game"; game: LocalGame }

/**
 * why: 180 bytes fits one notification at the smallest MTU either platform negotiates
 * (iOS 185), so no frame is ever truncated. Bytes 0-2 are message id, index, and count.
 */
export const FRAME_BYTES = 180
const HEADER_BYTES = 3
const PAYLOAD_BYTES = FRAME_BYTES - HEADER_BYTES

function utf8Bytes(text: string): number[] {
  const escaped = encodeURIComponent(text)
  const bytes: number[] = []
  for (let i = 0; i < escaped.length; i++) {
    if (escaped[i] === "%") {
      bytes.push(parseInt(escaped.slice(i + 1, i + 3), 16))
      i += 2
    } else bytes.push(escaped.charCodeAt(i))
  }
  return bytes
}

const hexByte = (byte: number) => byte.toString(16).padStart(2, "0")

function utf8Text(bytes: readonly number[]) {
  return decodeURIComponent(bytes.map((byte) => `%${hexByte(byte)}`).join(""))
}

function hexToBytes(hex: string): number[] {
  const bytes: number[] = []
  for (let i = 0; i + 1 < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16))
  return bytes
}

/** why: the Bluetooth library reads and writes hex strings. */
export function encodeFrames(message: TableMessage, messageId: number): string[] {
  const payload = utf8Bytes(JSON.stringify(message))
  const count = Math.max(1, Math.ceil(payload.length / PAYLOAD_BYTES))
  if (count > 255) throw new Error("Table message is too large to send")
  return Array.from({ length: count }, (_, index) =>
    [
      messageId & 0xff,
      index,
      count,
      ...payload.slice(index * PAYLOAD_BYTES, (index + 1) * PAYLOAD_BYTES),
    ]
      .map(hexByte)
      .join(""),
  )
}

function isTableCommand(value: unknown): value is TableCommand {
  if (typeof value !== "object" || value === null) return false
  const command = value as Record<string, unknown>
  if (command.type === "life.change")
    return typeof command.playerId === "string" && typeof command.delta === "number"
  if (command.type === "commanderDamage.assign")
    return (
      typeof command.fromPlayerId === "string" &&
      typeof command.toPlayerId === "string" &&
      typeof command.delta === "number"
    )
  return false
}

export function parseTableMessage(text: string): TableMessage | undefined {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof value !== "object" || value === null) return undefined
  const message = value as Record<string, unknown>
  if (message.type === "sync") return { type: "sync" }
  if (message.type === "command" && isTableCommand(message.command))
    return { type: "command", command: message.command }
  if (
    message.type === "game" &&
    typeof message.game === "object" &&
    message.game !== null &&
    Array.isArray((message.game as LocalGame).players)
  )
    return { type: "game", game: message.game as LocalGame }
  return undefined
}

/**
 * why: one in-flight message per sender is enough. Frames on one link
 * arrive in order, so a frame for a different message drops the unfinished one; the
 * next snapshot replaces whatever was lost.
 */
export function createReassembler() {
  const inFlight = new Map<string, { id: number; parts: number[][]; count: number }>()
  return (sender: string, hex: string): TableMessage | undefined => {
    const bytes = hexToBytes(hex)
    if (bytes.length < HEADER_BYTES) return undefined
    const [id, index, count] = bytes as [number, number, number]
    let current = inFlight.get(sender)
    if (index === 0) {
      current = { id, parts: [], count }
      inFlight.set(sender, current)
    }
    if (!current || current.id !== id || current.count !== count || index !== current.parts.length)
      return undefined
    current.parts.push(bytes.slice(HEADER_BYTES))
    if (current.parts.length < count) return undefined
    inFlight.delete(sender)
    try {
      return parseTableMessage(utf8Text(current.parts.flat()))
    } catch {
      return undefined
    }
  }
}

/** why: the guest only draws the board, so the host leaves the event log behind and frames stay few. */
export function tableSnapshot(game: LocalGame): LocalGame {
  return { ...game, events: [] }
}
