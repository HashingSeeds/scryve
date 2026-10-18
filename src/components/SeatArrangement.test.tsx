import { fireEvent, render, within } from "@testing-library/react-native"

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
          board={undefined}
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

  it("maps seats from the board's size, not the window's", () => {
    const view = render(
      <ThemeProvider>
        <SeatArrangement
          players={players.slice(0, 3)}
          layoutVariant="auto"
          board={{ width: 844, height: 390 }}
          seatOrder={undefined}
          onChange={jest.fn()}
        />
      </ThemeProvider>,
    )

    const row = within(view.getByTestId("seat-arrangement-row-0"))
    expect(
      [0, 1, 2].map((slot) => row.queryByTestId(`seat-arrangement-slot-${slot}`)),
    ).not.toContain(null)
  })
})
