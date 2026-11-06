import { asPlayerId } from "@/features/game/domain"
import type { GameModeRow } from "@/features/game/LifeLog"

import type { ModeLogRow } from "./useBoardModes"

export const modeLogRow = ({ key, text, at, entry }: ModeLogRow): GameModeRow => ({
  kind: "mode",
  id: key,
  playerId: asPlayerId(entry.playerId),
  at,
  text,
})
