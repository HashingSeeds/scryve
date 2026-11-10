import { PlanarDieButton, SchemeDueButton } from "@/components/modes/ModeSeam"

import type { BoardModes } from "./useBoardModes"

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
