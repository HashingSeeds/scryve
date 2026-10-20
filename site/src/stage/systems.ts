import type { PlaySystemId } from "@/features/game/playSystems"

import { SYSTEMS } from "../../../convex/lib/systems"

// Games the site's picker offers: ones with a designed demo, once they're released to everyone.
// The footer's required notices cover every general system, so these always have theirs.
export const SITE_SYSTEM_IDS = (
  ["mtg", "pokemon"] as const satisfies readonly PlaySystemId[]
).filter((id) => SYSTEMS[id].release === "general")
