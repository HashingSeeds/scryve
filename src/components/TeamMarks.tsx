import type { ViewStyle } from "react-native"
import { View } from "react-native"

import { PlayerMark } from "./PlayerMark"
import type { PlayerMarkShape } from "../../convex/lib/appearance"

export interface TeamMark {
  seatNumber: number
  color: string
  shape?: PlayerMarkShape
  foil?: boolean
}

const MARK = 28
const TEAM_MARK = 22

/**
 * why: a team's winner choice shows every teammate's mark, so the team reads at a glance. Each
 * keeps its own color until the row is chosen; then all take the row's ink to stay legible on its
 * fill. A single seat draws as it always has.
 */
export function TeamMarks({
  marks,
  color,
  selected,
}: {
  marks: readonly TeamMark[]
  color: string
  selected: boolean
}) {
  if (marks.length < 2) {
    const [mark] = marks
    return mark ? <PlayerMark {...mark} color={color} size={MARK} /> : null
  }
  return (
    <View testID="team-marks" style={$row}>
      {marks.map((mark) => (
        <PlayerMark
          key={mark.seatNumber}
          {...mark}
          color={selected ? color : mark.color}
          size={TEAM_MARK}
        />
      ))}
    </View>
  )
}

const $row: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 2 }
