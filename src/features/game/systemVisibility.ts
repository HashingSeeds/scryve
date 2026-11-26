import { buildEnvironment } from "@/utils/buildEnvironment"

import { NO_PLAY_SYSTEM, playSystemShortLabel } from "./playSystems"
import { SYSTEM_IDS, systemDefinition, type SystemDefinition } from "../../../convex/lib/systems"

const environment = buildEnvironment()
const RELEASES_SHOWN: Readonly<Record<SystemDefinition["release"], boolean>> = {
  general: true,
  // why: riot-review only. Riot's reviewer sees released games plus Riftbound, not unreleased betas. Never merge to main.
  beta: false,
  alpha: environment !== "production" && environment !== "beta",
}

export function isSystemVisible(system: unknown) {
  const release = systemDefinition(system)?.release
  return release !== undefined && RELEASES_SHOWN[release]
}

export const VISIBLE_SYSTEM_IDS = SYSTEM_IDS.filter(isSystemVisible)

export function playSystemChoices() {
  return [NO_PLAY_SYSTEM, ...VISIBLE_SYSTEM_IDS].map((id) => ({
    id,
    label: playSystemShortLabel(id),
  }))
}
