import type { PlaySystemId } from "@/features/game/playSystems"

import { SYSTEMS } from "../../../convex/lib/systems"

// Games the site's picker offers: ones with a designed demo, once they're released to everyone.
// The footer's required notices cover every general system, so these always have theirs.
const DEMO_SYSTEM_IDS = ["mtg", "ygo", "pokemon"] as const satisfies readonly PlaySystemId[]
export type SiteSystemId = (typeof DEMO_SYSTEM_IDS)[number]
export const SITE_SYSTEM_IDS: readonly SiteSystemId[] = DEMO_SYSTEM_IDS.filter(
  (id) => SYSTEMS[id].release === "general",
)
