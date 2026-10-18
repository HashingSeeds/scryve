import { fireEvent, render } from "@testing-library/react-native"

import { asPlayerId } from "@/features/game/domain"
import { ThemeProvider } from "@/theme/context"

import { SeatArrangement } from "./SeatArrangement"

const players = ["Ada", "Grace", "Linus", "Margaret"].map((name, index) => ({
  id: asPlayerId(`player-${index}`),
  name,
  color: "#41476E",
}))

describe("SeatArrangement", () => {
  it("swaps the two seats tapped and ignores a seat tapped twice", () => {
    const onChange = jest.fn()
    const view = render(
      <ThemeProvider>
        <SeatArrangement
          players={players}
          layoutVariant="auto"
          seatOrder={[1, 0, 2, 3]}
          onChange={onChange}
        />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByTestId("seat-arrangement-slot-2"))
    fireEvent.press(view.getByTestId("seat-arrangement-slot-2"))
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.press(view.getByTestId("seat-arrangement-slot-0"))
    fireEvent.press(view.getByTestId("seat-arrangement-slot-3"))
    expect(onChange).toHaveBeenCalledWith([3, 0, 2, 1])
  })
})
