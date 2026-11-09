import { StyleSheet } from "react-native"
import { render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { seatCardRadius } from "./playerCardTypes"
import { SeatSpotlight, TurnSpotlightContext } from "./TurnSpotlight"

function frame(props: Parameters<typeof SeatSpotlight>[0]) {
  const view = render(
    <ThemeProvider initialContext="dark">
      <TurnSpotlightContext.Provider value={{ active: ["ada"], next: ["bo"] }}>
        <SeatSpotlight {...props} />
      </TurnSpotlightContext.Provider>
    </ThemeProvider>,
  )
  return StyleSheet.flatten(view.getByTestId(/^seat-spotlight-/).props.style)
}

describe("SeatSpotlight", () => {
  it("rounds with its card, compact or not, and squares the corners its card squares", () => {
    expect(frame({ playerId: "ada" }).borderRadius).toBe(seatCardRadius())
    const compact = frame({
      playerId: "bo",
      compact: true,
      corners: { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
    })
    expect(compact).toMatchObject({
      borderRadius: seatCardRadius(true),
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
      borderStyle: "dashed",
    })
  })

  it("says solid on the active frame, since Android keeps a next frame's dash when the style drops it", () => {
    expect(frame({ playerId: "ada" }).borderStyle).toBe("solid")
  })
})
