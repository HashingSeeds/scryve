import { StyleSheet } from "react-native"
import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { SeatIdentity } from "./SeatIdentity"

describe("SeatIdentity", () => {
  it("keeps the name's height while the name is retracted, so its fading copy holds still", () => {
    const seat = (nameRetracted: boolean) => (
      <ThemeProvider>
        <SeatIdentity
          seatNumber={2}
          playerName="Player 2"
          color="#FFFFFF"
          nameRetracted={nameRetracted}
        />
      </ThemeProvider>
    )
    const view = render(seat(false))
    fireEvent(view.getByTestId("player-name-seat-2"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 70, height: 22 } },
    })

    view.rerender(seat(true))
    expect(view.queryByTestId("player-name-seat-2")).toBeNull()
    expect(StyleSheet.flatten(view.getByTestId("life-status-seat-2").props.style)).toMatchObject({
      minHeight: 22,
    })
  })
})
