import { ConvexError } from "convex/values"

export const PERMANENT_GAME_WRITE_CODES = [
  "seat_owner_required",
  "game_membership_required",
  "game_not_active",
  "game_not_found",
  "sync_operation_mismatch",
  "invalid_operation_id",
  "invalid_device_id",
  "invalid_client_timestamp",
  "invalid_life_delta",
  "invalid_table_action",
] as const

export type GameWriteErrorCode = (typeof PERMANENT_GAME_WRITE_CODES)[number]

export function gameWriteError(code: GameWriteErrorCode, message: string) {
  return new ConvexError({ code, message })
}
