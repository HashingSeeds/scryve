import type { ComponentProps } from "react"
import { fireEvent, render } from "@testing-library/react-native"

import { Text } from "@/components/Text"
import { ThemeProvider } from "@/theme/context"

import { useDeckSearchHost } from "./deckSearchHost"
import { DeckView } from "./DeckView"

const mockPush = jest.fn()
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }))

jest.mock("convex/react", () => ({
  useConvex: () => ({ query: jest.fn() }),
  useConvexConnectionState: () => ({ isWebSocketConnected: false }),
}))

jest.mock("./CardSearchScreen", () => ({
  CardSearchScreen: ({ initialSection }: { initialSection?: string }) => {
    const { Text: MockText } = jest.requireActual<typeof import("react-native")>("react-native")
    return <MockText testID="card-search">{initialSection ?? "cards"}</MockText>
  },
}))

const forest = { name: "Forest", quantity: 1, scryfallId: "forest" }
const island = { name: "Island", quantity: 2, scryfallId: "island" }

function deckView(overrides: Partial<ComponentProps<typeof DeckView>> = {}) {
  const noop = jest.fn()
  return (
    <ThemeProvider initialContext="dark">
      <DeckView
        mode="build"
        onModeChange={noop}
        name="Deck"
        game="mtg"
        format="commander"
        cards={[forest]}
        savedCards={[forest]}
        note=""
        play={null}
        changes={0}
        onBack={noop}
        onSave={noop}
        onDiscard={noop}
        onDetails={noop}
        cardSearch={{
          deckId: "deck-1",
          onAdd: () => undefined,
          onRemove: noop,
          cards: () => [forest],
          subscribe: () => noop,
        }}
        onNoteChange={noop}
        onFocus={noop}
        onIncrement={noop}
        onDecrement={noop}
        {...overrides}
      />
    </ThemeProvider>
  )
}

function renderDeckView(overrides: Partial<ComponentProps<typeof DeckView>> = {}) {
  return render(deckView(overrides))
}

it("keeps the back action available", () => {
  const onBack = jest.fn()
  const view = renderDeckView({ cards: [], onBack })

  fireEvent.press(view.getByLabelText("Back"))
  expect(onBack).toHaveBeenCalledTimes(1)
})

it.each(["cardsCached", "cardsUnavailable", "editingDisabled", "busy"] as const)(
  "keeps Build card controls disabled for %s while previews remain available",
  (disabledState) => {
    const onIncrement = jest.fn()
    const onDecrement = jest.fn()
    const onFocus = jest.fn()
    const view = renderDeckView({ [disabledState]: true, onFocus, onIncrement, onDecrement })
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

it("shows the Play body and no card list in Play", () => {
  const { Text: MockText } = jest.requireActual<typeof import("react-native")>("react-native")
  const view = renderDeckView({
    mode: "play",
    cards: [forest],
    savedCards: [island],
    play: <MockText testID="play-body" />,
  })

  expect(view.getByTestId("play-body")).toBeTruthy()
  expect(view.getByText("Magic · Commander · 2 cards")).toBeTruthy()
  expect(view.queryByLabelText("2× Island")).toBeNull()
  expect(view.queryByLabelText("1× Forest")).toBeNull()
  expect(view.queryByTestId("deck-note-input")).toBeNull()
})

describe("Play bar", () => {
  it("records a match or starts a game", () => {
    const onAddMatch = jest.fn()
    const onStartGame = jest.fn()
    const view = renderDeckView({ mode: "play", onAddMatch, onStartGame })

    fireEvent.press(view.getByText("Add match result"))
    fireEvent.press(view.getByText("Start a game"))
    expect(onAddMatch).toHaveBeenCalledTimes(1)
    expect(onStartGame).toHaveBeenCalledTimes(1)
  })

  it("has no match entry for a game without results", () => {
    const view = renderDeckView({
      mode: "play",
      game: "riftbound",
      format: "constructed",
      onAddMatch: jest.fn(),
    })

    expect(view.queryByText("Add match result")).toBeNull()
    expect(view.getByText("Start a game")).toBeTruthy()
  })

  it("gives way to the draft bar while Build has unsaved changes", () => {
    const view = renderDeckView({ mode: "play", changes: 1, onStartGame: jest.fn() })

    expect(view.getByTestId("deck-draft-bar")).toBeTruthy()
    expect(view.queryByTestId("deck-play-bar")).toBeNull()
  })
})

it("switches views from the toggle", () => {
  const onModeChange = jest.fn()
  const view = renderDeckView({ mode: "play", onModeChange })

  fireEvent.press(view.getByTestId("deck-mode-build"))
  expect(onModeChange).toHaveBeenCalledWith("build")
})

describe("draft bar", () => {
  it("shows the save status when nothing changed", () => {
    const view = renderDeckView({ saveStatus: "Synced" })

    expect(view.getByText("Synced")).toBeTruthy()
    expect(view.queryByTestId("deck-draft-bar")).toBeNull()
  })

  it("counts changes and saves them", () => {
    const onSave = jest.fn()
    const view = renderDeckView({ changes: 2, onSave })

    expect(view.getByText("2 changes")).toBeTruthy()
    fireEvent.press(view.getByTestId("save-version-button"))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it("asks before Discard drops the changes", () => {
    const onDiscard = jest.fn()
    const view = renderDeckView({ changes: 2, onDiscard })

    fireEvent.press(view.getByTestId("deck-draft-discard"))
    expect(view.getByText("Discard changes?")).toBeTruthy()
    fireEvent.press(view.getByTestId("deck-discard-cancel"))
    expect(onDiscard).not.toHaveBeenCalled()
    expect(view.queryByTestId("deck-discard-dialog")).toBeNull()

    fireEvent.press(view.getByTestId("deck-draft-discard"))
    fireEvent.press(view.getByTestId("deck-discard-confirm"))
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it("does not reopen the confirm after the draft empties elsewhere", () => {
    const view = renderDeckView({ changes: 1 })

    fireEvent.press(view.getByTestId("deck-draft-discard"))
    view.rerender(deckView({ changes: 0 }))
    view.rerender(deckView({ changes: 1 }))
    expect(view.queryByTestId("deck-discard-dialog")).toBeNull()
  })
})

it("opens /cards for this deck from the find field", () => {
  const view = renderDeckView()

  fireEvent.press(view.getByLabelText("Find or add a card"))
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/cards",
    params: { deckId: "deck-1", game: "mtg" },
  })
  expect(view.queryByTestId("card-search")).toBeNull()
})

it("lends /cards its search only while Build can add cards", () => {
  function Host(props: Partial<ComponentProps<typeof DeckView>>) {
    const host = useDeckSearchHost("deck-1")
    return (
      <ThemeProvider initialContext="dark">
        {deckView(props)}
        <Text testID="host" text={host ? `${host.game}:${host.format}` : "none"} />
      </ThemeProvider>
    )
  }
  const view = render(<Host />)
  expect(view.getByTestId("host")).toHaveTextContent("mtg:commander")

  view.rerender(<Host mode="play" />)
  expect(view.getByTestId("host")).toHaveTextContent("none")
  view.rerender(<Host editingDisabled />)
  expect(view.getByTestId("host")).toHaveTextContent("none")
  view.rerender(<Host />)
  view.unmount()
  expect(render(<Host mode="play" />).getByTestId("host")).toHaveTextContent("none")
})

describe("sideboard", () => {
  const bolt = { name: "Bolt", quantity: 4, scryfallId: "bolt" }
  const path = { name: "Path", quantity: 2, scryfallId: "path", section: "sideboard" }

  it("counts main and side apart and moves a copy either way with ⇄", () => {
    const onMove = jest.fn()
    const view = renderDeckView({ format: "modern", cards: [bolt, path], onMove })

    expect(view.getByText("Magic · Modern · 4 + 2")).toBeTruthy()
    expect(view.getByText("Sideboard")).toBeTruthy()
    fireEvent.press(view.getByLabelText("Move one Bolt to Sideboard"))
    fireEvent.press(view.getByLabelText("Move one Path to Main deck"))
    expect(onMove.mock.calls).toEqual([[bolt], [path]])
  })

  it("has no ⇄ where the format has no sideboard", () => {
    const onMove = jest.fn()
    expect(
      renderDeckView({
        game: "pokemon",
        format: "standard",
        cards: [bolt],
        onMove,
      }).queryByLabelText(/Move one/),
    ).toBeNull()
  })
})

describe("analysis sheet", () => {
  it("opens from the curve strip, closes from its header, and its commander nudge opens the chooser", () => {
    const view = renderDeckView({ canChooseCommander: true })

    expect(view.queryByTestId("deck-analysis")).toBeNull()
    fireEvent.press(view.getByTestId("open-deck-analysis"))
    fireEvent.press(view.getByTestId("close-deck-analysis"))
    expect(view.queryByTestId("deck-analysis")).toBeNull()
    fireEvent.press(view.getByTestId("open-deck-analysis"))
    fireEvent.press(view.getByTestId("deck-analysis-choose-commander"))
    expect(view.getByTestId("card-search")).toHaveTextContent("commander")
  })

  it("leaves the nudge as plain text when the commander cannot be chosen", () => {
    const view = renderDeckView()

    fireEvent.press(view.getByTestId("open-deck-analysis"))
    expect(view.getByTestId("deck-analysis-no-commander")).toBeTruthy()
    expect(view.queryByTestId("deck-analysis-choose-commander")).toBeNull()
  })
})
