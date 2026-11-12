import { StyleSheet } from "react-native"
import { render } from "@testing-library/react-native"

import { CLAIM_CHIP } from "@/features/game/dice"
import { ThemeProvider } from "@/theme/context"

import { DiceChips } from "./DiceChips"
import { seatMarkArt } from "./SeatIdentity"
import { shapeForSeat } from "../../convex/lib/appearance"

describe("DiceChips", () => {
  it.each([false, true])("draws the 1st chip as tall as the seat mark (compact %s)", (compact) => {
    const view = render(
      <ThemeProvider>
        <DiceChips
          seatNumber={1}
          playerName="Ada"
          foreground="#FFFFFF"
          compact={compact}
          chips={[CLAIM_CHIP, { kind: "roll", roll: { tool: "d20", value: 17 } }]}
          onPress={() => {}}
        />
      </ThemeProvider>,
    )
    const { height } = seatMarkArt(shapeForSeat(1), compact)
    for (const chip of ["dice-chip-1-claim", "dice-chip-1-d20"]) {
      expect(StyleSheet.flatten(view.getByTestId(chip).props.style).height).toBe(height)
    }
  })
})
