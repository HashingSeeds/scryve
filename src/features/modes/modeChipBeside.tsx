import { PlanarDieButton, SchemeDueButton } from "@/components/modes/ModeSeam"

import type { BoardModes } from "./useBoardModes"

/**
 * why: each player on the active team may roll with their own cost (CR 805.9, 901.9), so a die
 * rides beside the chip of each seat this device plays; on one shared device that's every
 * teammate's chip, on a connected device only its own. The archenemy's chip also carries their
 * scheme prompt while one is due.
 */
export function modeChipBeside(
  modes: BoardModes,
  seat: string,
  { dieOnChip, plays }: { dieOnChip: boolean; plays: (seat: string) => boolean },
) {
  const die = dieOnChip && modes.planar && plays(seat)
  const due = modes.scheme?.due && modes.scheme.mine && modes.scheme.archenemyId === seat
  if (!die && !due) return undefined
  return (
    <>
      {die && modes.planar ? (
        <PlanarDieButton
          planar={modes.planar}
          seat={seat}
          size={36}
          testID={`planar-die-chip-${seat}`}
        />
      ) : null}
      {due ? <SchemeDueButton onPress={() => modes.openDialog("scheme")} /> : null}
    </>
  )
}
