import type { ComponentProps } from "react"
import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { DeckView } from "./DeckView"

jest.mock("convex/react", () => ({
  useConvex: () => ({ query: jest.fn() }),
  useConvexConnectionState: () => ({ isWebSocketConnected: false }),
}))

function renderDeckView(overrides: Partial<ComponentProps<typeof DeckView>> = {}) {
  const noop = jest.fn()
  return render(
    <ThemeProvider initialContext="dark">
      <DeckView
        tab="cards"
        onTabChange={noop}
        name="Deck"
        game="mtg"
        format="commander"
        cards={[{ name: "Forest", quantity: 1, scryfallId: "forest" }]}
        note=""
        editing={false}
        dirty={false}
        onBack={noop}
        onEdit={noop}
        onSave={noop}
        onCancel={noop}
        onDetails={noop}
        onAdd={noop}
        onNoteChange={noop}
        onFocus={noop}
        onIncrement={noop}
        onDecrement={noop}
        {...overrides}
      />
    </ThemeProvider>,
  )
}

it("keeps the back action available in read-only mode", () => {
  const onBack = jest.fn()
  const view = renderDeckView({ cards: [], onBack })

  fireEvent.press(view.getByLabelText("Back"))
  expect(onBack).toHaveBeenCalledTimes(1)
})

it.each(["cardsCached", "cardsUnavailable", "editingDisabled", "busy"] as const)(
  "keeps shared card controls disabled for %s while previews remain available",
  (disabledState) => {
    const onIncrement = jest.fn()
    const onDecrement = jest.fn()
    const onFocus = jest.fn()
    const view = renderDeckView({
      editing: true,
      dirty: true,
      [disabledState]: true,
      onFocus,
      onIncrement,
      onDecrement,
    })
    expect(view.getByLabelText("Remove Forest")).toBeDisabled()
    expect(view.getByLabelText("Increase Forest")).toBeDisabled()
    fireEvent.press(view.getByLabelText("Remove Forest"))
    fireEvent.press(view.getByLabelText("Increase Forest"))
    expect(onIncrement).not.toHaveBeenCalled()
    expect(onDecrement).not.toHaveBeenCalled()
    fireEvent.press(view.getByLabelText("1× Forest"))
    expect(onFocus).toHaveBeenCalledWith(expect.objectContaining({ scryfallId: "forest" }))
  },
)

describe("analysis commander nudge", () => {
  it("opens the commander chooser", () => {
    const onChooseCommander = jest.fn()
    const view = renderDeckView({ tab: "analysis", onChooseCommander })
    fireEvent.press(view.getByLabelText("Choose commander"))
    expect(onChooseCommander).toHaveBeenCalledTimes(1)
  })

  it("is plain text when the deck cannot be edited", () => {
    const view = renderDeckView({ tab: "analysis" })
    expect(view.getByTestId("deck-analysis-no-commander")).toBeTruthy()
    expect(view.queryByTestId("deck-analysis-choose-commander")).toBeNull()
  })
})
