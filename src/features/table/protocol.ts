import {
  applyGameCommand,
  commanderDamageBetween,
  commanderDamageKey,
} from "@/features/game/domain"
import type {
  CommandContext,
  GameCommand,
  GameStatus,
  LocalGame,
  LocalGameResult,
} from "@/features/game/types"

/** why: guests may only touch life and commander damage; ending or undoing stays with the host. */
export type TableCommand = Extract<GameCommand, { type: "life.change" | "commanderDamage.assign" }>

/** why: each guest's highest applied command id, so a guest can time its taps even when the host merged several into one update. */
export type TableAcks = Record<string, number>

/** why: after the first full board only life, commander damage, and status change; keyed by seat index they fit one frame. */
export interface TablePatch {
  life: number[]
  damage: [from: number, to: number, total: number][]
  status: GameStatus
  result?: LocalGameResult
}

export type TableMessage =
  | { type: "sync" }
  | { type: "command"; command: TableCommand; guest: string; id: number }
  | { type: "game"; game: LocalGame; acks: TableAcks }
  | { type: "patch"; patch: TablePatch; acks: TableAcks }

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

function readAcks(value: unknown): TableAcks {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  )
}

export function parseTableMessage(text: string): TableMessage | undefined {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!isRecord(value)) return undefined
  if (value.type === "sync") return { type: "sync" }
  if (
    value.type === "command" &&
    isTableCommand(value.command) &&
    typeof value.guest === "string" &&
    typeof value.id === "number"
  )
    return { type: "command", command: value.command, guest: value.guest, id: value.id }
  if (value.type === "game" && isRecord(value.game) && Array.isArray(value.game.players))
    return { type: "game", game: value.game as unknown as LocalGame, acks: readAcks(value.acks) }
  if (value.type === "patch" && isRecord(value.patch) && Array.isArray(value.patch.life))
    return {
      type: "patch",
      patch: value.patch as unknown as TablePatch,
      acks: readAcks(value.acks),
    }
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

export function tablePatch(game: LocalGame): TablePatch {
  const damage: TablePatch["damage"] = []
  game.players.forEach((from, fromIndex) =>
    game.players.forEach((to, toIndex) => {
      const total = commanderDamageBetween(game, from.id, to.id)
      if (total) damage.push([fromIndex, toIndex, total])
    }),
  )
  return {
    life: game.players.map((player) => player.life),
    damage,
    status: game.status,
    ...(game.result ? { result: game.result } : {}),
  }
}

/** why: undefined means the guest's board is not the one the patch was made from, so it should ask for a full board. */
export function applyTablePatch(game: LocalGame, patch: TablePatch): LocalGame | undefined {
  if (patch.life.length !== game.players.length) return undefined
  const commanderDamage: Record<string, number> = {}
  for (const [from, to, total] of patch.damage) {
    const fromPlayer = game.players[from]
    const toPlayer = game.players[to]
    if (!fromPlayer || !toPlayer) return undefined
    commanderDamage[commanderDamageKey(fromPlayer.id, toPlayer.id)] = total
  }
  return {
    ...game,
    players: game.players.map((player, index) => ({ ...player, life: patch.life[index]! })),
    commanderDamage,
    status: patch.status,
    result: patch.result,
  }
}

export interface PendingTableCommand {
  id: number
  command: TableCommand
}

/**
 * why: a guest's taps show at once, on top of the host's last board, through the same rules
 * the host will apply, so the count never snaps back while the host's answer is in flight.
 */
export function withPendingCommands(
  board: LocalGame,
  pending: readonly PendingTableCommand[],
  context: CommandContext,
): LocalGame {
  return pending.reduce(
    (current, { command }) => applyGameCommand(current, command, context),
    board,
  )
}

export const unconfirmedCommands = (
  pending: readonly PendingTableCommand[],
  acked: number,
): PendingTableCommand[] => pending.filter(({ id }) => id > acked)
