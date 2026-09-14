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
