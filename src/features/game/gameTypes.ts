import { translate } from "@/i18n/translate"

import {
  counterValueLabel,
  defaultStartingLife,
  playFormatLabel,
  playSystemFormats,
  playSystemShortLabel,
  type PlaySystemId,
} from "./playSystems"
import { isSystemVisible, VISIBLE_SYSTEM_IDS } from "./systemVisibility"
import type { GameVariant } from "../../../convex/lib/treachery"

export interface GameType {
  id: string
  system?: PlaySystemId
  format?: string
  variant?: GameVariant
}

const FEATURED: readonly GameType[] = [
  { id: "commander", system: "mtg", format: "commander" },
  { id: "treachery", system: "mtg", format: "commander", variant: "treachery" },
  { id: "mtg-standard", system: "mtg", format: "standard" },
  { id: "ygo-advanced", system: "ygo", format: "advanced" },
  { id: "pokemon-standard", system: "pokemon", format: "standard" },
  { id: "none" },
]

export const FEATURED_GAME_TYPES = FEATURED.filter(
  (type) => !type.system || isSystemVisible(type.system),
)

function featuredFormat(system: PlaySystemId, format: string) {
  return FEATURED_GAME_TYPES.find(
    (type) => !type.variant && type.system === system && type.format === format,
  )
}

export const MORE_GAME_TYPES: readonly GameType[] = VISIBLE_SYSTEM_IDS.flatMap((system) =>
  playSystemFormats(system)
    .filter(({ id }) => !featuredFormat(system, id))
    .map(({ id }) => ({ id: `${system}-${id}`, system, format: id })),
)

export function gameTypeId(system: PlaySystemId | undefined, format?: string, treachery = false) {
  if (!system || !format) return "none"
  if (treachery) return "treachery"
  return featuredFormat(system, format)?.id ?? `${system}-${format}`
}

const SUGGESTED_COUNT = 3

type Played = Pick<GameType, "system" | "format" | "variant">

export function newGameTypes({
  chosen,
  recent,
  connected,
}: {
  chosen?: Played
  recent?: Played
  connected: boolean
}) {
  const offered = [...FEATURED_GAME_TYPES, ...MORE_GAME_TYPES].filter(
    (type) => connected || type.variant !== "treachery",
  )
  const recentId =
    recent && gameTypeId(recent.system, recent.format, recent.variant === "treachery")
  const candidates = offered.filter((type) => type.id !== recentId)
  const chosenId = chosen && gameTypeId(chosen.system, chosen.format)
  const played = [chosen?.system, recent?.system]
  const featured = candidates.filter((type) => type.system && FEATURED_GAME_TYPES.includes(type))
  const ranked = new Set([
    ...candidates.filter((type) => type.system && type.id === chosenId),
    ...featured.filter((type) => played.includes(type.system)),
    ...featured,
  ])
  const suggested = [
    ...[...ranked].slice(0, SUGGESTED_COUNT),
    ...candidates.filter((type) => !type.system),
  ]
  return { suggested, more: offered.filter((type) => !suggested.includes(type)) }
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
