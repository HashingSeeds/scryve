import { ModeSeam } from "@/components/modes/ModeSeam"
import type { BoardSeamGeometry } from "@/features/game/GameBoardStage"

import { dieOnSeam, planSeam, seamRoom, type SeamItem } from "./seamPlan"
import type { BoardModes } from "./useBoardModes"

const EDGE = 8
/** why: clears the first-player and round clock tabs at the board's edges while they show. */
const EDGE_WITH_TABS = 40

export function modeSeamFor(
  modes: BoardModes,
  { dieOnChip, slotOf }: { dieOnChip: boolean; slotOf: (playerId: string) => number | undefined },
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
    }
    const items: SeamItem[] = [
      ...(planar ? ["plane" as const] : []),
      ...(planar && (!dieOnChip || dieOnSeam(geometry, busySlots)) ? ["die" as const] : []),
      ...(scheme ? ["scheme" as const] : []),
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
