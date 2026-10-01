import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { DeckView } from "./DeckView"

jest.mock("@/i18n/translate", () => ({
  translate: (key: string) => (key === "common:back" ? "Back" : key),
}))

it("keeps the back action available in read-only mode", () => {
  const onBack = jest.fn()
  const noop = jest.fn()
  const view = render(
    <ThemeProvider initialContext="light">
      <DeckView
        tab="cards"
        onTabChange={noop}
        name="Offline rename"
        game="mtg"
        format="commander"
        cards={[]}
        note=""
        editing={false}
        dirty={false}
        onBack={onBack}
        onEdit={noop}
        onSave={noop}
        onCancel={noop}
        onDetails={noop}
        onAdd={noop}
        onNoteChange={noop}
        onFocus={noop}
        onIncrement={noop}
        onDecrement={noop}
      />
    </ThemeProvider>,
  )

  fireEvent.press(view.getByLabelText("Back"))
  expect(onBack).toHaveBeenCalledTimes(1)
})

it.each(["cardsCached", "cardsUnavailable", "editingDisabled", "busy"] as const)(
  "keeps shared card controls disabled for %s while previews remain available",
  (disabledState) => {
    const onIncrement = jest.fn()
    const onDecrement = jest.fn()
    const onFocus = jest.fn()
    const noop = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <DeckView
          tab="cards"
          onTabChange={noop}
          name="Cached deck"
          game="mtg"
          format="commander"
          cards={[{ name: "Forest", quantity: 1, scryfallId: "forest" }]}
          note=""
          editing
          dirty
          {...{ [disabledState]: true }}
          onBack={noop}
          onEdit={noop}
          onSave={noop}
          onCancel={noop}
          onDetails={noop}
          onAdd={noop}
          onNoteChange={noop}
          onFocus={onFocus}
          onIncrement={onIncrement}
          onDecrement={onDecrement}
        />
      </ThemeProvider>,
    )
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
