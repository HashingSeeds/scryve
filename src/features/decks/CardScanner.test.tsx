import { View } from "react-native"
import { act, fireEvent, render, within } from "@testing-library/react-native"

import { DEFAULT_LOCAL_SETTINGS, localGameRepository } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"
import { captureAnalytics } from "@/utils/analytics"

import { cardNameIndex } from "./cardNameMatch"
import { CardScanner, type ScannedCardAdd } from "./CardScanner"
import { scanHaptic, type CardPhotoText } from "../../../modules/card-text-reader"

let mockOnText: ((event: { nativeEvent: CardPhotoText }) => void) | undefined
jest.mock("../../../modules/card-text-reader", () => ({
  CardTextCamera: (props: { onText: typeof mockOnText }) => {
    mockOnText = props.onText
    return null
  },
  scanHaptic: jest.fn(),
  prepareScanHaptics: jest.fn(),
}))
jest.mock("./cardTextLayout", () => ({
  framedLinesFromCardTop: (photo: CardPhotoText) => photo.lines.map((line) => line.text),
}))
jest.mock("@/utils/analytics", () => ({ captureAnalytics: jest.fn() }))
jest.mock("expo-camera", () => ({
  useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
}))

const nameIndex = cardNameIndex(["Sol Ring", "Arcane Signet", "Forest"])

function renderScanner(props: {
  singleton: boolean
  inDeck?: Record<string, number>
  addCards?: (names: string[]) => Promise<ScannedCardAdd[]>
}) {
  const addCards = jest.fn(
    props.addCards ?? (async (names: string[]): Promise<ScannedCardAdd[]> => names.map(() => ({}))),
  )
  const removeCard = jest.fn()
  const onClose = jest.fn()
  const scanner = (adding: typeof addCards) => (
    <ThemeProvider initialContext="dark">
      <CardScanner
        game="mtg"
        nameIndex={nameIndex}
        singleton={props.singleton}
        copiesInDeck={(name) => props.inDeck?.[name] ?? 0}
        addCards={adding}
        removeCard={removeCard}
        onClose={onClose}
      />
    </ThemeProvider>
  )
  const view = render(scanner(addCards))
  const layout = { x: 0, y: 0, width: 400, height: 700 }
  for (const laidOut of view.UNSAFE_getAllByType(View).filter((node) => node.props.onLayout))
    fireEvent(laidOut, "layout", { nativeEvent: { layout }, persist: () => undefined })
  return {
    view,
    addCards,
    removeCard,
    onClose,
    rerenderWith: (adding: typeof addCards) => view.rerender(scanner(adding)),
  }
}

function show(...texts: string[]) {
  const lines = texts.map((text) => ({
    text,
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    angle: 0,
    confidence: 1,
  }))
  act(() => mockOnText?.({ nativeEvent: { width: 960, height: 1280, lines } }))
}

function scan(...lines: string[]) {
  show(...lines)
  show(...lines)
  show()
}

function slowAdds() {
  let land: () => void = () => undefined
  const addCards = (names: string[]) =>
    new Promise<ScannedCardAdd[]>((resolve) => {
      land = () => resolve(names.map(() => ({})))
    })
  return { addCards, land: () => act(async () => land()) }
}

async function finish(view: ReturnType<typeof render>) {
  await act(async () => fireEvent.press(view.getByText("Done")))
}

test("skips a card the Commander deck already holds and says so", async () => {
  const { view, addCards } = renderScanner({ singleton: true, inDeck: { "Sol Ring": 1 } })
  show("Sol Ring")
  show("Sol Ring")
  expect(view.getByText("Sol Ring is already in the deck")).toBeTruthy()
  expect(scanHaptic).toHaveBeenLastCalledWith("skipped")
  show()
  scan("Arcane Signet")
  expect(scanHaptic).toHaveBeenLastCalledWith("added")
  scan("Arcane Signet")
  await finish(view)
  expect(addCards.mock.calls.flat(2)).toEqual(["Arcane Signet"])
})

test("adds repeat copies in formats that allow them", async () => {
  const { view, addCards } = renderScanner({ singleton: false })
  scan("Sol Ring")
  scan("Sol Ring")
  await finish(view)
  expect(addCards.mock.calls.flat(2)).toEqual(["Sol Ring", "Sol Ring"])
})

test("asks once how many of a basic land the deck holds and tops it up", async () => {
  const { view, addCards } = renderScanner({ singleton: true, inDeck: { Forest: 2 } })
  scan("Forest")
  expect(view.getByText("How many in the deck?")).toBeTruthy()
  expect(view.getByTestId("card-scan-land-count")).toHaveTextContent("2")
  fireEvent.press(view.getByLabelText("Increase Forest"))
  fireEvent.press(view.getByLabelText("Increase Forest"))
  fireEvent.press(view.getByTestId("card-scan-add-lands"))
  scan("Forest")
  expect(view.queryByText("How many in the deck?")).toBeNull()
  await finish(view)
  expect(addCards.mock.calls.flat(2)).toEqual(["Forest", "Forest"])
})

test("waits for adds still in flight before closing and ignores reads after Done", async () => {
  jest.useFakeTimers()
  try {
    const slow = slowAdds()
    const { view, onClose } = renderScanner({ singleton: false, addCards: slow.addCards })
    scan("Sol Ring")
    act(() => jest.advanceTimersByTime(1500))
    fireEvent.press(view.getByText("Done"))
    scan("Arcane Signet")
    expect(view.queryByText("Arcane Signet")).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    await slow.land()
    expect(onClose).toHaveBeenCalledTimes(1)
  } finally {
    jest.useRealTimers()
  }
})

test("Wrong card removes a card whose add was still in flight once it lands", async () => {
  jest.useFakeTimers()
  try {
    const slow = slowAdds()
    const { view, removeCard } = renderScanner({ singleton: false, addCards: slow.addCards })
    scan("Sol Ring")
    act(() => jest.advanceTimersByTime(1500))
    fireEvent.press(view.getByText("Wrong card"))
    fireEvent.press(view.getByText("Remove it"))
    expect(removeCard).not.toHaveBeenCalled()
    await slow.land()
    expect(removeCard).toHaveBeenCalledWith("Sol Ring")
  } finally {
    jest.useRealTimers()
  }
})

test("an earlier scanned card can be checked and removed from the review list", async () => {
  jest.useFakeTimers()
  try {
    const { view, removeCard } = renderScanner({ singleton: true })
    scan("Sol Ring")
    scan("Arcane Signet")
    await act(async () => jest.advanceTimersByTime(1500))
    fireEvent.press(view.getByTestId("card-scan-review"))
    const list = view.getByTestId("card-scan-review-list")
    expect(within(list).getByText("Sol Ring")).toBeTruthy()
    fireEvent.press(within(list).getAllByText("Wrong card")[1])
    await act(async () => fireEvent.press(view.getByText("Remove it")))
    expect(removeCard).toHaveBeenCalledWith("Sol Ring")
    expect(within(list).queryByText("Sol Ring")).toBeNull()
  } finally {
    jest.useRealTimers()
  }
})

test("an alternate picked after a misread follows the basic land count prompt", async () => {
  const { view, addCards } = renderScanner({ singleton: true })
  scan("Sol Ring", "Forest")
  fireEvent.press(view.getByText("Wrong card"))
  await act(async () => fireEvent.press(view.getByText("Forest")))
  expect(view.getByText("How many in the deck?")).toBeTruthy()
  fireEvent.press(view.getByTestId("card-scan-add-lands"))
  await finish(view)
  expect(addCards.mock.calls.flat(2)).toEqual(["Forest"])
})

test("Done keeps an alternate chosen while the wrong card was still being added", async () => {
  jest.useFakeTimers()
  try {
    let land: () => void = () => undefined
    const addCards = jest.fn(
      (names: string[]) =>
        new Promise<ScannedCardAdd[]>((resolve) => {
          land = () => resolve(names.map(() => ({})))
        }),
    )
    const { view, removeCard, onClose } = renderScanner({ singleton: false, addCards })
    scan("Sol Ring", "Arcane Signet")
    act(() => jest.advanceTimersByTime(1500))
    fireEvent.press(view.getByText("Wrong card"))
    fireEvent.press(view.getByText("Arcane Signet"))
    fireEvent.press(view.getByText("Done"))
    await act(async () => land())
    await act(async () => land())
    expect(removeCard).toHaveBeenCalledWith("Sol Ring")
    expect(addCards.mock.calls.flat(2)).toEqual(["Sol Ring", "Arcane Signet"])
    expect(onClose).toHaveBeenCalledTimes(1)
  } finally {
    jest.useRealTimers()
  }
})

test("Done waits for the land count when an alternate turns out to be a basic land", async () => {
  jest.useFakeTimers()
  try {
    const slow = slowAdds()
    const { view, addCards, onClose } = renderScanner({ singleton: false, addCards: slow.addCards })
    scan("Sol Ring", "Forest")
    act(() => jest.advanceTimersByTime(1500))
    fireEvent.press(view.getByText("Wrong card"))
    fireEvent.press(view.getByText("Forest"))
    fireEvent.press(view.getByText("Done"))
    await slow.land()
    expect(onClose).not.toHaveBeenCalled()
    expect(view.getByText("How many in the deck?")).toBeTruthy()
    fireEvent.press(view.getByTestId("card-scan-add-lands"))
    await act(async () => fireEvent.press(view.getByText("Done")))
    await slow.land()
    expect(addCards.mock.calls.flat(2)).toEqual(["Sol Ring", "Forest"])
    expect(onClose).toHaveBeenCalledTimes(1)
  } finally {
    jest.useRealTimers()
  }
})

test("a card whose add failed can be scanned again in a Commander deck", async () => {
  jest.useFakeTimers()
  try {
    const addCards = jest
      .fn<Promise<ScannedCardAdd[]>, [string[]]>()
      .mockResolvedValueOnce([{ error: "Couldn't add the scanned cards." }])
      .mockImplementation(async (names) => names.map(() => ({})))
    const { view } = renderScanner({ singleton: true, addCards })
    scan("Sol Ring")
    await act(async () => jest.advanceTimersByTime(1500))
    scan("Sol Ring")
    expect(view.queryByText("Sol Ring is already in the deck")).toBeNull()
    await act(async () => jest.advanceTimersByTime(1500))
    expect(addCards.mock.calls.flat(2)).toEqual(["Sol Ring", "Sol Ring"])
  } finally {
    jest.useRealTimers()
  }
})

test("a retry after reconnecting adds through the deck's latest add", async () => {
  jest.useFakeTimers()
  try {
    const offline = jest.fn(async (names: string[]): Promise<ScannedCardAdd[]> =>
      names.map(() => ({ error: "You're offline.", retryable: true })),
    )
    const online = jest.fn(async (names: string[]): Promise<ScannedCardAdd[]> =>
      names.map(() => ({})),
    )
    const { view, rerenderWith } = renderScanner({ singleton: true, addCards: offline })
    scan("Sol Ring")
    await act(async () => jest.advanceTimersByTime(1500))
    rerenderWith(online)
    await act(async () => jest.advanceTimersByTime(2000 + 1500))
    expect(online.mock.calls.flat(2)).toEqual(["Sol Ring"])
    expect(view.getByText("1 added")).toBeTruthy()
  } finally {
    jest.useRealTimers()
  }
})

test("retries a card whose lookup failed until it is added", async () => {
  jest.useFakeTimers()
  try {
    const addCards = jest
      .fn<Promise<ScannedCardAdd[]>, [string[]]>()
      .mockResolvedValueOnce([{ error: "Lookups paused", retryable: true, retryAfterMs: 4000 }])
      .mockImplementation(async (names) => names.map(() => ({})))
    const { view } = renderScanner({ singleton: true, addCards })
    scan("Sol Ring")
    await act(async () => jest.advanceTimersByTime(1500))
    expect(view.getByText("0 added · 1 retrying")).toBeTruthy()
    await act(async () => jest.advanceTimersByTime(4000 + 1500))
    expect(addCards.mock.calls.flat(2)).toEqual(["Sol Ring", "Sol Ring"])
    expect(view.getByText("1 added")).toBeTruthy()
  } finally {
    jest.useRealTimers()
  }
})

test("Done waits out retries and counts cards that were never added", async () => {
  jest.useFakeTimers()
  try {
    const addCards = jest.fn(async (names: string[]): Promise<ScannedCardAdd[]> =>
      names.map(() => ({ error: "Lookups paused", retryable: true })),
    )
    const { view, onClose } = renderScanner({ singleton: true, addCards })
    scan("Sol Ring")
    fireEvent.press(view.getByText("Done"))
    for (let step = 0; step < 6; step++) await act(async () => jest.advanceTimersByTime(30_000))
    expect(addCards).toHaveBeenCalledTimes(5)
    expect(view.getByText("0 added · 1 not added")).toBeTruthy()
    expect(onClose).toHaveBeenCalledTimes(1)
  } finally {
    jest.useRealTimers()
  }
})

test("a misread basic land can be closed without adding it", async () => {
  const { view, addCards } = renderScanner({ singleton: true })
  scan("Forest")
  fireEvent.press(view.getByLabelText("Decrease Forest"))
  expect(view.getByTestId("card-scan-land-count")).toHaveTextContent("0")
  fireEvent.press(view.getByTestId("card-scan-add-lands"))
  scan("Sol Ring")
  scan("Forest")
  expect(view.getByText("How many in the deck?")).toBeTruthy()
  fireEvent.press(view.getByTestId("card-scan-add-lands"))
  await finish(view)
  expect(addCards.mock.calls.flat(2)).toEqual(["Sol Ring", "Forest"])
})

test("a land retry counts copies still being added", async () => {
  let landSecondBatch: () => void = () => undefined
  const addCards = jest
    .fn<Promise<ScannedCardAdd[]>, [string[]]>()
    .mockImplementationOnce(async (names) => names.map(() => ({ error: "Offline" })))
    .mockImplementationOnce(
      (names) =>
        new Promise((resolve) => {
          landSecondBatch = () => resolve(names.map(() => ({})))
        }),
    )
    .mockImplementation(async (names) => names.map(() => ({})))
  const { view } = renderScanner({ singleton: true, addCards })
  scan("Forest")
  for (let tap = 1; tap < 20; tap++) fireEvent.press(view.getByLabelText("Increase Forest"))
  await act(async () => fireEvent.press(view.getByTestId("card-scan-add-lands")))
  scan("Forest")
  expect(view.getByTestId("card-scan-land-count")).toHaveTextContent("10")
  await act(async () => landSecondBatch())
})

test("Done reports how the scan went without naming any card", async () => {
  const { view } = renderScanner({ singleton: true, inDeck: { "Sol Ring": 1 } })
  show("Sol Ring")
  show("Sol Ring")
  show()
  act(() =>
    mockOnText?.({
      nativeEvent: {
        width: 960,
        height: 1280,
        lines: [],
        cardCorners: [],
        detection: { rectangles: [], thermal: "fair" },
      },
    }),
  )
  scan("Arcane Signet")
  await finish(view)
  expect(captureAnalytics).toHaveBeenCalledWith("card_scan_completed", {
    duration_ms: expect.any(Number),
    added_count: 1,
    failed_count: 0,
    skipped_count: 1,
    fixed_count: 0,
    read_count: 7,
    outlined_read_count: 1,
    peak_heat: "fair",
  })
})

test("Stats for nerds shows why each rectangle was or wasn't taken as the card", () => {
  act(() => localGameRepository.saveSettings({ ...DEFAULT_LOCAL_SETTINGS, syncStats: true }))
  try {
    const { view } = renderScanner({ singleton: true })
    act(() =>
      mockOnText?.({
        nativeEvent: {
          width: 960,
          height: 1280,
          lines: [],
          detection: {
            thermal: "serious",
            rectangles: [
              { aspect: 0.714, share: 0.82 },
              { aspect: 0.95, share: 0.4, rejected: "shape" },
            ],
          },
        },
      }),
    )
    expect(view.getByText("Outline: none")).toBeTruthy()
    expect(view.getByText("Heat: hot")).toBeTruthy()
    expect(view.getByText("0.71 · 82% · card")).toBeTruthy()
    expect(view.getByText("0.95 · 40% · shape")).toBeTruthy()
  } finally {
    act(() => localGameRepository.saveSettings(DEFAULT_LOCAL_SETTINGS))
  }
})

test("the scanner hides detection details with Stats for nerds off", () => {
  const { view } = renderScanner({ singleton: true })
  show("Sol Ring")
  expect(view.queryByTestId("card-scan-stats")).toBeNull()
})
