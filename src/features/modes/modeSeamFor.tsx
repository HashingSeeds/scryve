import { ModeSeam } from "@/components/modes/ModeSeam"
import type { TeamBinding } from "@/components/TeamPanelLayer"
import type { BoardSeamGeometry } from "@/features/game/GameBoardStage"

import { chipCrowdedBySeam, planSeam, seamRoom, type SeamItem } from "./seamPlan"
import type { BoardModes } from "./useBoardModes"

const EDGE = 8
/** why: clears the first-player and round clock tabs at the board's edges while they show. */
const EDGE_WITH_TABS = 40

export function modeSeamFor(
  modes: BoardModes,
  {
    dieOnChip,
    slotOf,
    teamBinding,
  }: {
    dieOnChip: boolean
    slotOf: (playerId: string) => number | undefined
    teamBinding?: TeamBinding
  },
) {
  const { planar, scheme } = modes
  if (!planar && !scheme) return undefined
  return function renderSeam({
    anchor,
    facings,
    edgeTabs,
    sides,
    width,
    menuSize,
    rivets,
  }: BoardSeamGeometry) {
    const busySlots = new Set(
      modes.activeGroup.flatMap((playerId) => {
        const slot = slotOf(playerId)
        return slot === undefined ? [] : [slot]
      }),
    )
    const geometry = {
      sides,
      facings,
      anchorX: anchor.x,
      width,
      menuSize,
      edge: edgeTabs ? EDGE_WITH_TABS : EDGE,
      // why: the frame binding on trial draws no rivet.
      rivets: teamBinding === "frame" ? [] : rivets,
    }
    const crowded = chipCrowdedBySeam(geometry, busySlots)
    const items: SeamItem[] = [
      ...(planar ? ["plane" as const] : []),
      ...(planar && (!dieOnChip || crowded) ? ["die" as const] : []),
      ...(scheme?.due && scheme.mine && crowded
        ? ["schemeDue" as const]
        : scheme && (scheme.ongoing.length > 0 || scheme.shown)
          ? ["scheme" as const]
          : []),
    ]
    const plan = planSeam(
      {
        left: seamRoom(geometry, "left", busySlots),
        right: seamRoom(geometry, "right", busySlots),
      },
      items,
    )
    return (
      <ModeSeam
        anchorY={anchor.y}
        plan={plan}
        planar={planar}
        scheme={scheme}
        onOpen={modes.openDialog}
      />
    )
  }
}
