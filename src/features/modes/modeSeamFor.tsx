import { ModeSeam } from "@/components/modes/ModeSeam"
import type { BoardSeamGeometry } from "@/features/game/GameBoardStage"

import type { BoardModes } from "./useBoardModes"

/** why: a plate reads right side up for the seat it faces; seats on the board's sides read it sideways, so it stays level for them. */
const plateRotation = (facing: number | undefined) => (facing === 180 ? 180 : 0)

export function modeSeamFor(
  modes: BoardModes,
  { dieOnSeam, slotOf }: { dieOnSeam: boolean; slotOf: (playerId: string) => number | undefined },
) {
  const { planar, scheme } = modes
  if (!planar && !scheme) return undefined
  return function renderSeam({ anchor, facings }: BoardSeamGeometry) {
    const facingOf = (playerId: string | undefined) => {
      const slot = playerId === undefined ? undefined : slotOf(playerId)
      return slot === undefined ? undefined : facings[slot]
    }
    return (
      <ModeSeam
        anchor={anchor}
        planar={planar}
        scheme={scheme}
        dieOnSeam={dieOnSeam}
        planeRotation={plateRotation(facingOf(planar?.activeId ?? planar?.roller))}
        schemeRotation={plateRotation(facingOf(scheme?.archenemyId))}
        onOpen={modes.openDialog}
      />
    )
  }
}
