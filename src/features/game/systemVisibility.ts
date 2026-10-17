import { buildEnvironment } from "@/utils/buildEnvironment"

import { NO_PLAY_SYSTEM, playSystemShortLabel } from "./playSystems"
import { SYSTEM_IDS, systemDefinition } from "../../../convex/lib/systems"

const betaSystemsShown = buildEnvironment() !== "production"

export function isSystemVisible(system: unknown) {
  const release = systemDefinition(system)?.release
  return release === "general" || (release === "beta" && betaSystemsShown)
}

export const VISIBLE_SYSTEM_IDS = SYSTEM_IDS.filter(isSystemVisible)

export function playSystemChoices() {
  return [NO_PLAY_SYSTEM, ...VISIBLE_SYSTEM_IDS].map((id) => ({
    id,
    label: playSystemShortLabel(id),
  }))
}
