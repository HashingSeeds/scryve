import { ModeSeam } from "@/components/modes/ModeSeam"
import type { TeamBinding } from "@/components/TeamPanelLayer"
import type { BoardSeamGeometry } from "@/features/game/GameBoardStage"

import { chipCrowdedBySeam, planSeam, seamRoom, type SeamItem } from "./seamPlan"
import type { BoardModes } from "./useBoardModes"

const EDGE = 8
const EDGE_WITH_TABS = 40

export function modeSeamFor(
  modes: BoardModes,
  {
    dieOnChip,
    turnChips,
    slotOf,
    teamBinding,
  }: {
    dieOnChip: boolean
    turnChips: boolean
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
      rivets: teamBinding === "frame" ? [] : rivets,
    }
    const crowded = chipCrowdedBySeam(geometry, busySlots)
    const seamHoldsScheme = !turnChips && !!scheme?.mine
    const schemeItem: SeamItem | undefined =
      scheme?.due && scheme.mine && (crowded || !turnChips)
        ? "schemeDue"
        : scheme && (scheme.ongoing.length > 0 || scheme.shown || seamHoldsScheme)
          ? "scheme"
          : undefined
    const items: SeamItem[] = [
      ...(planar ? ["plane" as const] : []),
      ...(planar && (!dieOnChip || crowded) ? ["die" as const] : []),
      ...(schemeItem ? [schemeItem] : []),
    ]
    const rooms = {
      left: seamRoom(geometry, "left", busySlots),
      right: seamRoom(geometry, "right", busySlots),
    }
    const planned = planSeam(rooms, items)
    const placed = [planned.left, planned.right].some((slot) => slot?.items.includes("schemeDue"))
    const compactDue = schemeItem === "schemeDue" && !placed
    const plan = compactDue
      ? planSeam(
          rooms,
          items.map((item) => (item === "schemeDue" ? "scheme" : item)),
        )
      : planned
    return (
      <ModeSeam
        anchorY={anchor.y}
        plan={plan}
        planar={planar}
        scheme={scheme}
        compactDue={compactDue}
        onOpen={modes.openDialog}
      />
    )
  }
}
