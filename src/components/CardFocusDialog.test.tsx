import { act, fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { CardFocusDialog } from "./CardFocusDialog"

const mockAction = jest.fn()
jest.mock("convex/react", () => ({ useConvex: () => ({ action: mockAction }) }))
jest.mock("@/features/rules/rulesSource", () => ({
  loadStoredRules: () => ({
    url: "rules.txt",
    rules: {
      chapters: [
        {
          id: "7",
          title: "Additional Rules",
          sections: [
            {
              id: "702",
              title: "Keyword Abilities",
              rules: [
                { id: "702.9", text: "Flying", examples: [] },
                { id: "702.9a", text: "Flying is an evasion ability.", examples: [] },
              ],
            },
          ],
        },
      ],
      glossary: [{ term: "Flying", text: "Restricts blocking. See rule 702.9." }],
      notice: [],
    },
  }),
}))

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
      <CardFocusDialog
        visible
        onDismissed={jest.fn()}
        card={card}
        details={details}
        {...handlers}
        {...props}
      />
    </ThemeProvider>,
  )
  return { ...view, ...handlers }
}

describe("CardFocusDialog", () => {
  it("keeps Rulings closed when you collapse them before they load", async () => {
    let resolve: (rulings: unknown) => void = () => {}
    mockAction.mockReturnValue(new Promise((done) => (resolve = done)))
    const view = renderDialog({
      card: { ...card, game: "mtg", cardId: "11111111-2222-3333-4444-555555555555" },
    })
    fireEvent.press(view.getByTestId("card-rulings"))
    fireEvent.press(view.getByTestId("card-rulings"))
    await act(async () => resolve([{ publishedAt: "2020-01-01", comment: "Late ruling." }]))
    expect(view.queryByText("Late ruling.")).toBeNull()
  })

  it("loads a Magic card's official rulings when you open them", async () => {
    mockAction.mockResolvedValue([{ publishedAt: "2009-10-01", comment: "Protection applies." }])
    const view = renderDialog({
      card: { ...card, game: "mtg", cardId: "4bd3014b-94bb-4a9f-92cf-239a2dcc7e97" },
    })
    expect(view.queryByText("Protection applies.")).toBeNull()
    fireEvent.press(view.getByTestId("card-rulings"))
    expect(await view.findByText("Protection applies.")).toBeTruthy()
    expect(mockAction).toHaveBeenCalledWith(expect.anything(), {
      scryfallId: "4bd3014b-94bb-4a9f-92cf-239a2dcc7e97",
      deviceId: expect.any(String),
    })
  })

  it("defines a Magic keyword in place when you tap it", () => {
    const view = renderDialog({
      card: { ...card, game: "mtg" },
      details: { ...details, oracleText: "Flying, vigilance", keywords: "Flying\nVigilance" },
    })
    expect(view.queryByTestId("card-focus-keyword")).toBeNull()
    fireEvent.press(view.getByText("Flying"))
    expect(view.getByText("Restricts blocking.")).toBeTruthy()
    expect(view.getByText("Flying is an evasion ability.")).toBeTruthy()
    fireEvent.press(view.getAllByText("Flying")[0])
    expect(view.queryByTestId("card-focus-keyword")).toBeNull()
  })

  it("shows the focused card image with rules, printing, and deck context", () => {
    const view = renderDialog()
    expect(view.getByTestId("card-focus-dialog")).toBeTruthy()
    expect(view.getByTestId("card-focus-image")).toBeTruthy()
    expect(view.getByText("Llanowar Elves")).toBeTruthy()
    expect(view.getByText("{G}")).toBeTruthy()
    expect(view.getByText("Creature — Elf Druid")).toBeTruthy()
    expect(view.getByText("{T}: Add {G}.")).toBeTruthy()
    expect(view.getByTestId("card-focus-image").props.accessibilityLabel).toBe(
      "Llanowar Elves. Creature — Elf Druid. {T}: Add {G}.",
    )
    expect(view.getByText("Dominaria · #168 · Common")).toBeTruthy()
    expect(view.getByText("2× in Main")).toBeTruthy()
    expect(view.getByTestId("card-focus-image").props.contentFit).toBe("contain")
    expect(view.getByTestId("card-focus-quantity")).toBeTruthy()
  })

  it("explains the full color identity of a double-faced commander", () => {
    const view = renderDialog({
      card: { ...card, name: "Ajani, Nacatl Pariah // Ajani, Nacatl Avenger" },
      details: { ...details, colorIdentity: "RW" },
    })
    expect(view.getByText("Color identity: White, Red · Both faces")).toBeTruthy()
  })

  it("switches the image and rules while preserving identity and commander assignment", () => {
    const onSetCommander = jest.fn()
    const view = renderDialog({
      card: { ...card, name: "Ajani, Nacatl Pariah // Ajani, Nacatl Avenger" },
      details: {
        ...details,
        commanderEligibility: "eligible",
        commanderLegality: "legal",
        colorIdentity: "RW",
        faceDetails: JSON.stringify([
          {
            name: "Ajani, Nacatl Pariah",
            imageUrl: "https://cards.scryfall.io/front.jpg",
            manaCost: "{1}{W}",
            typeLine: "Legendary Creature",
            oracleText: "Front rules",
          },
          {
            name: "Ajani, Nacatl Avenger",
            imageUrl: "https://cards.scryfall.io/back.jpg",
            typeLine: "Legendary Planeswalker",
            oracleText: "Back rules",
          },
        ]),
      },
      onSetCommander,
    })
    expect(view.getByText("Front rules")).toBeTruthy()
    expect(view.queryByText("Back rules")).toBeNull()
    fireEvent.press(view.getByTestId("card-face-1"))
    expect(view.getByText("Ajani, Nacatl Avenger")).toBeTruthy()
    expect(view.getByText("Back rules")).toBeTruthy()
    expect(view.queryByText("Front rules")).toBeNull()
    expect(view.queryByText("{1}{W}")).toBeNull()
    expect(view.getByTestId("card-focus-image").props.source).toEqual([
      { uri: "https://cards.scryfall.io/back.jpg" },
    ])
    expect(view.getByText("Color identity: White, Red · Both faces")).toBeTruthy()
    fireEvent.press(view.getByTestId("set-commander"))
    expect(onSetCommander).toHaveBeenCalledWith(undefined)
    fireEvent.press(view.getByTestId("card-face-0"))
    expect(view.getByText("Front rules")).toBeTruthy()
    expect(view.getByTestId("card-focus-image").props.source).toEqual([
      { uri: "https://cards.scryfall.io/front.jpg" },
    ])
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

  it("retries failed details with the shared countdown UI", () => {
    jest.useFakeTimers()
    try {
      const onRetryDetails = jest.fn()
      const view = renderDialog({
        details: undefined,
        detailsError: "Scryfall requests are paused. Try again shortly.",
        detailsRetryAfterMs: 3000,
        onRetryDetails,
      })
      expect(view.getByText("Retrying in 3s")).toBeTruthy()
      expect(view.getByTestId("retry-card-details")).toBeDisabled()
      view.unmount()
      const manual = renderDialog({
        details: undefined,
        detailsError: "Could not load card details",
        onRetryDetails,
      })
      fireEvent.press(manual.getByTestId("retry-card-details"))
      expect(onRetryDetails).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })
  it("falls back to a no-image placeholder when the printing has no image", () => {
    const view = renderDialog({ card: { ...card, imageUrl: undefined } })
    expect(view.queryByTestId("card-focus-image")).toBeNull()
    expect(view.getByText("No image found")).toBeTruthy()
  })

  it("requires a chosen color before designating a color-choice commander", () => {
    const onSetCommander = jest.fn()
    const view = renderDialog({
      details: {
        ...details,
        commanderEligibility: "color-choice",
        commanderLegality: "legal",
        colorIdentity: "",
      },
      onSetCommander,
    })
    expect(view.getByTestId("set-commander")).toBeDisabled()
    fireEvent.press(view.getByTestId("commander-color"))
    fireEvent.press(view.getByTestId("commander-color-option-U"))
    fireEvent.press(view.getByTestId("set-commander"))
    expect(onSetCommander).toHaveBeenCalledWith("U")
  })

  it("tells the owner other players see a blocked commander name as Commander", () => {
    const commander = { ...details, commanderEligibility: "eligible", commanderLegality: "legal" }
    const blocked = renderDialog({
      card: { ...card, name: "Hitler" },
      details: commander,
      onSetCommander: jest.fn(),
    })
    expect(blocked.getByTestId("commander-name-warning")).toHaveTextContent(
      'Other players will see "Commander" instead.',
    )
    blocked.unmount()
    const ineligible = renderDialog({
      card: { ...card, name: "Hitler" },
      details: { ...commander, commanderEligibility: "ineligible" },
      onSetCommander: jest.fn(),
    })
    expect(ineligible.queryByTestId("commander-name-warning")).toBeNull()
    ineligible.unmount()
    const fine = renderDialog({ details: commander, onSetCommander: jest.fn() })
    expect(fine.queryByTestId("commander-name-warning")).toBeNull()
  })
})
