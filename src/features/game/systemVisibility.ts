import { buildEnvironment } from "@/utils/buildEnvironment"

import { SYSTEM_IDS, systemDefinition } from "../../../convex/lib/systems"

const betaSystemsShown = buildEnvironment() !== "production"

export function isSystemVisible(system: unknown) {
  const release = systemDefinition(system)?.release
  return release === "general" || (release === "beta" && betaSystemsShown)
}

export const VISIBLE_SYSTEM_IDS = SYSTEM_IDS.filter(isSystemVisible)
