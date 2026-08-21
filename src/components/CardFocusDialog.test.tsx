import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { CardFocusDialog } from "./CardFocusDialog"

const card = {
  name: "Llanowar Elves",
  imageUrl: "https://cards.scryfall.io/normal/elves.jpg",
  quantity: 2,
  boardLabel: "Main",
}

const details = {
  manaCost: "{G}",
  typeLine: "Creature — Elf Druid",
  oracleText: "{T}: Add {G}.",
  setName: "Dominaria",
  collectorNumber: "168",
  rarity: "common",
}

function renderDialog(props: Partial<Parameters<typeof CardFocusDialog>[0]> = {}) {
  const handlers = { onIncrement: jest.fn(), onDecrement: jest.fn(), onClose: jest.fn() }
  const view = render(
    <ThemeProvider initialContext="light">
      <CardFocusDialog card={card} details={details} {...handlers} {...props} />
    </ThemeProvider>,
  )
  return { ...view, ...handlers }
}

describe("CardFocusDialog", () => {
  it("shows the focused card image, rich details and deck context", () => {
    const view = renderDialog()
    expect(view.getByTestId("card-focus-dialog")).toBeTruthy()
    expect(view.getByTestId("card-focus-image")).toBeTruthy()
    expect(view.getByText("Llanowar Elves")).toBeTruthy()
    expect(view.getByText("{G}")).toBeTruthy()
    expect(view.getByText("Creature — Elf Druid")).toBeTruthy()
    expect(view.getByText("{T}: Add {G}.")).toBeTruthy()
    expect(view.getByText("Dominaria · #168 · Common")).toBeTruthy()
    expect(view.getByText("Copies in Main")).toBeTruthy()
    expect(view.getByTestId("card-focus-quantity")).toHaveTextContent("2")
  })

  it("reports quantity changes to the screen", () => {
    const view = renderDialog()
    fireEvent.press(view.getByTestId("card-focus-increment"))
    fireEvent.press(view.getByTestId("card-focus-decrement"))
    fireEvent.press(view.getByTestId("card-focus-close"))
    expect(view.onIncrement).toHaveBeenCalledTimes(1)
    expect(view.onDecrement).toHaveBeenCalledTimes(1)
    expect(view.onClose).toHaveBeenCalledTimes(1)
  })

  it("keeps the card usable while details are loading or failed", () => {
    const loading = renderDialog({ details: undefined })
    expect(loading.getByText("Loading details…")).toBeTruthy()
    loading.unmount()
    const failed = renderDialog({ details: undefined, detailsError: "Could not load card details" })
    expect(failed.queryByText("Loading details…")).toBeNull()
    expect(failed.getByText("Could not load card details")).toBeTruthy()
    fireEvent.press(failed.getByTestId("card-focus-increment"))
    expect(failed.onIncrement).toHaveBeenCalledTimes(1)
  })

  it("falls back to a named placeholder when the printing has no image", () => {
    const view = renderDialog({ card: { ...card, imageUrl: undefined } })
    expect(view.queryByTestId("card-focus-image")).toBeNull()
    expect(view.getAllByText("Llanowar Elves").length).toBeGreaterThan(0)
  })
})
