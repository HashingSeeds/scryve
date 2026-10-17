import { translate } from "@/i18n/translate"

import {
  counterValueLabel,
  defaultStartingLife,
  PLAY_SYSTEM_IDS,
  playFormatLabel,
  playSystemFormats,
  playSystemShortLabel,
  type PlaySystemId,
} from "./playSystems"
import type { GameVariant } from "../../../convex/lib/treachery"

export interface GameType {
  id: string
  system?: PlaySystemId
  format?: string
  variant?: GameVariant
}

export const FEATURED_GAME_TYPES: readonly GameType[] = [
  { id: "commander", system: "mtg", format: "commander" },
  { id: "treachery", system: "mtg", format: "commander", variant: "treachery" },
  { id: "mtg-standard", system: "mtg", format: "standard" },
  { id: "ygo-advanced", system: "ygo", format: "advanced" },
  { id: "pokemon-standard", system: "pokemon", format: "standard" },
  { id: "fab-cc", system: "fab", format: "cc" },
  { id: "none" },
]

function featuredFormat(system: PlaySystemId, format: string) {
  return FEATURED_GAME_TYPES.find(
    (type) => !type.variant && type.system === system && type.format === format,
  )
}

export const MORE_GAME_TYPES: readonly GameType[] = PLAY_SYSTEM_IDS.flatMap((system) =>
  playSystemFormats(system)
    .filter(({ id }) => !featuredFormat(system, id))
    .map(({ id }) => ({ id: `${system}-${id}`, system, format: id })),
)

export function isFeaturedGameType(id: string) {
  return FEATURED_GAME_TYPES.some((type) => type.id === id)
}

export function gameTypeId(system: PlaySystemId | undefined, format?: string, treachery = false) {
  if (!system || !format) return "none"
  if (treachery) return "treachery"
  return featuredFormat(system, format)?.id ?? `${system}-${format}`
}

export function gameTypeLabel(type: GameType) {
  if (type.variant === "treachery") return translate("connected:treachery.name")
  if (!type.system) return translate("systems:noSystem")
  return playFormatLabel(type.system, type.format)
}

export function gameTypeDetail(type: GameType, seats: number) {
  const life = counterValueLabel(type.system, defaultStartingLife(type.system, type.format, seats))
  return type.system ? `${playSystemShortLabel(type.system)} · ${life}` : life
}
