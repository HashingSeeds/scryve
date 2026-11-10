import { render, screen } from "@testing-library/react-native"

import type { SchemeView } from "@/features/modes/useBoardModes"
import { ThemeProvider } from "@/theme/context"

import { ModeSeam } from "./ModeSeam"

const room = {
  width: 40,
  shift: 0,
  rotation: 0,
  start: 0,
  direction: 1,
  inActiveCard: false,
} as const

describe("ModeSeam", () => {
  it("names and marks a scheme plate that has no card to show", () => {
    const scheme: SchemeView = {
      archenemyId: "ada",
      ownCards: true,
      due: false,
      mine: true,
      ongoing: [],
      reveal: () => {},
      abandon: () => {},
    }
    render(
      <ThemeProvider initialContext="dark">
        <ModeSeam
          anchorY={0.5}
          plan={{ right: { room, items: ["scheme"] } }}
          scheme={scheme}
          onOpen={() => {}}
        />
      </ThemeProvider>,
    )
    expect(screen.getByTestId("scheme-plate").props.accessibilityLabel).toBe("Archenemy: Schemes")
    expect(screen.getByTestId("scheme-glyph")).toBeTruthy()
  })
})
