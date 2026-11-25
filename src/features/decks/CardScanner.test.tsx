import { View } from "react-native"
import { act, fireEvent, render, within } from "@testing-library/react-native"

import { DEFAULT_LOCAL_SETTINGS, localGameRepository } from "@/features/game/localPersistence"
import { catalogDb } from "@/storage/catalogDb"
import { ThemeProvider } from "@/theme/context"
import { captureAnalytics } from "@/utils/analytics"

import { cardNameIndex } from "./cardNameMatch"
import { CardScanner, type ScannedCardAdd } from "./CardScanner"
import { scanHaptic, type CardPhotoText } from "../../../modules/card-text-reader"

let mockOnText: ((event: { nativeEvent: CardPhotoText }) => void) | undefined
let mockQueueText: typeof mockOnText
let mockGuide: unknown
jest.mock("../../../modules/card-text-reader", () => ({
  CardTextCamera: (props: { onText: NonNullable<typeof mockOnText>; guide?: unknown }) => {
    mockGuide = props.guide
    mockQueueText = props.onText
    mockOnText = (event) => {
      const faked = "clock" in setTimeout
      if (!faked) jest.useFakeTimers()
      props.onText(event)
      jest.advanceTimersByTime(0)
      if (!faked) jest.useRealTimers()
    }
    return null
  },
  scanHaptic: jest.fn(),
  prepareScanHaptics: jest.fn(),
}))
jest.mock("./cardTextLayout", () => ({
  framedLinesFromCardTop: (photo: CardPhotoText) => photo.lines.map((line) => line.text),
  framedLineObjectsFromCardBottom: (photo: CardPhotoText) => photo.lines.slice(1),
  framedLinesFromCardBottom: (photo: CardPhotoText) =>
    photo.lines.slice(1).map((line) => line.text),
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

test("a short slot shrinks the frame to a full card and guides the camera in view coordinates", () => {
  const { view } = renderScanner({ singleton: false })
  const layout = { x: 0, y: 100, width: 320, height: 280 }
  fireEvent(view.getByTestId("card-scan-frame-slot"), "layout", {
    nativeEvent: { layout },
    persist: () => undefined,
  })
  const width = (280 * 63) / 88
  expect(mockGuide).toEqual({ x: (320 - width) / 2, y: 100, width, height: 280 })
})

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
    expect(removeCard).toHaveBeenCalledWith("Sol Ring", 0)
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
    expect(removeCard).toHaveBeenCalledWith("Sol Ring", 0)
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
    expect(removeCard).toHaveBeenCalledWith("Sol Ring", 0)
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
    read_count: 8,
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

test("locks on 1 frame in bulk mode, scans duplicates on sceneChanged, and fires hit haptics for high-value printings", async () => {
  catalogDb.clearAll()
  catalogDb.replacePrintings(
    "mtg",
    [
      {
        game: "mtg",
        printingId: "lea-sol",
        cardId: "ora-sol",
        name: "Sol Ring",
        nameNormalized: "sol ring",
        setCode: "lea",
        setName: "Limited Edition Alpha",
        collectorNumber: "269",
        rarity: "uncommon",
        finishes: ["nonfoil"],
      },
      {
        game: "mtg",
        printingId: "cmm-sol",
        cardId: "ora-sol",
        name: "Sol Ring",
        nameNormalized: "sol ring",
        setCode: "cmm",
        setName: "Commander Masters",
        collectorNumber: "410",
        rarity: "uncommon",
        finishes: ["nonfoil", "foil"],
      },
    ],
    "v1",
  )
  catalogDb.replacePrices("mtg", [
    {
      game: "mtg",
      printingId: "lea-sol",
      finish: "nonfoil",
      source: "tcgplayer",
      currency: "USD",
      retailCents: 45000,
      updatedAt: "2026-11-24T00:00:00Z",
    },
    {
      game: "mtg",
      printingId: "cmm-sol",
      finish: "foil",
      source: "tcgplayer",
      currency: "USD",
      retailCents: 850,
      updatedAt: "2026-11-24T00:00:00Z",
    },
  ])

  const { view, addCards } = renderScanner({ singleton: false })
  fireEvent.press(view.getByTestId("card-scan-mode"))

  act(() =>
    mockOnText?.({
      nativeEvent: {
        width: 960,
        height: 1280,
        lines: [{ text: "Sol Ring", x: 0, y: 0, width: 100, height: 20, angle: 0, confidence: 1 }],
        bottomLines: [
          {
            text: "LEA • EN 269/302",
            x: 0,
            y: 1200,
            width: 100,
            height: 20,
            angle: 0,
            confidence: 1,
          },
        ],
      },
    }),
  )
  expect(scanHaptic).toHaveBeenLastCalledWith("bigHit")

  act(() =>
    mockOnText?.({
      nativeEvent: {
        width: 960,
        height: 1280,
        sceneChanged: true,
        lines: [{ text: "Sol Ring", x: 0, y: 0, width: 100, height: 20, angle: 0, confidence: 1 }],
        bottomLines: [
          { text: "CMM ★ EN 0410", x: 0, y: 1200, width: 100, height: 20, angle: 0, confidence: 1 },
        ],
      },
    }),
  )
  expect(scanHaptic).toHaveBeenLastCalledWith("hit")

  await finish(view)
  expect(addCards).toHaveBeenCalledWith(
    ["Sol Ring", "Sol Ring"],
    [
      expect.objectContaining({ printingId: "lea-sol", setCode: "lea", collectorNumber: "269" }),
      expect.objectContaining({ printingId: "cmm-sol", setCode: "cmm", collectorNumber: "410" }),
    ],
  )
  catalogDb.clearAll()
})

test("blocks adding a card outside the locked set and allows re-arming identical copies in bulk mode", async () => {
  catalogDb.clearAll()
  catalogDb.replacePrintings(
    "mtg",
    [
      {
        game: "mtg",
        printingId: "cmm-sol",
        cardId: "ora-sol",
        name: "Sol Ring",
        nameNormalized: "sol ring",
        setCode: "cmm",
        setName: "Commander Masters",
        collectorNumber: "410",
        rarity: "uncommon",
        finishes: ["nonfoil"],
      },
    ],
    "v1",
  )

  const { view, addCards } = renderScanner({ singleton: false })
  fireEvent.press(view.getByTestId("card-scan-mode"))
  fireEvent.press(view.getByTestId("card-scan-set-lock"))
  fireEvent.changeText(view.getByTestId("card-scan-set-lock-input"), "FDN")
  fireEvent.press(view.getAllByText("Done").at(-1)!)

  act(() =>
    mockOnText?.({
      nativeEvent: {
        width: 960,
        height: 1280,
        lines: [{ text: "Sol Ring", x: 0, y: 0, width: 100, height: 20, angle: 0, confidence: 1 }],
      },
    }),
  )
  expect(view.getByText("Sol Ring isn't in FDN.")).toBeTruthy()
  expect(addCards).not.toHaveBeenCalled()

  fireEvent.press(view.getByTestId("card-scan-set-lock"))
  fireEvent.press(view.getByText("Clear set lock"))
  fireEvent.press(view.getByTestId("card-scan-next-copy"))

  const frame = {
    nativeEvent: {
      width: 960,
      height: 1280,
      lines: [{ text: "Sol Ring", x: 0, y: 0, width: 100, height: 20, angle: 0, confidence: 1 }],
    },
  }
  act(() => mockOnText?.(frame))
  fireEvent.press(view.getByTestId("card-scan-next-copy"))
  act(() => mockOnText?.(frame))

  await finish(view)
  expect(addCards).toHaveBeenCalledWith(
    ["Sol Ring", "Sol Ring"],
    [
      expect.objectContaining({ printingId: "cmm-sol" }),
      expect.objectContaining({ printingId: "cmm-sol" }),
    ],
  )
  catalogDb.clearAll()
})

test("ignores a single empty frame so the same card is not double-scanned, and resolves set from full-frame bottom lines", async () => {
  catalogDb.clearAll()
  catalogDb.replacePrintings(
    "mtg",
    [
      {
        game: "mtg",
        printingId: "pw26-sol",
        cardId: "ora-sol",
        name: "Sol Ring",
        nameNormalized: "sol ring",
        setCode: "pw26",
        setName: "Promo",
        collectorNumber: "1",
        rarity: "uncommon",
        finishes: ["nonfoil"],
      },
      {
        game: "mtg",
        printingId: "trk-sol",
        cardId: "ora-sol",
        name: "Sol Ring",
        nameNormalized: "sol ring",
        setCode: "trk",
        setName: "Star Trek",
        collectorNumber: "50",
        rarity: "uncommon",
        finishes: ["nonfoil"],
      },
    ],
    "v1",
  )

  const { view, addCards } = renderScanner({ singleton: false })
  show("Sol Ring", "TRK")
  show("unreadable blur")
  show("Sol Ring")
  show()
  show("Sol Ring", "TRK")
  show("Sol Ring", "TRK", "will defend", "2/3")
  show("Sol Ring", "TRK", "stop it", "2/3")

  await finish(view)
  expect(addCards).toHaveBeenCalledWith(
    ["Sol Ring"],
    [expect.objectContaining({ printingId: "trk-sol", setCode: "trk" })],
  )
  catalogDb.clearAll()
})

test("blocks rapid A-B-A ping-pong without leaving frame and progressively upgrades foil on next frame", async () => {
  catalogDb.clearAll()
  catalogDb.replacePrintings(
    "mtg",
    [
      {
        game: "mtg",
        printingId: "trk-sol",
        cardId: "ora-sol",
        name: "Sol Ring",
        nameNormalized: "sol ring",
        setCode: "trk",
        setName: "Star Trek",
        collectorNumber: "50",
        rarity: "uncommon",
        finishes: ["nonfoil", "foil"],
      },
    ],
    "v1",
  )

  const onScanPrinting = jest.fn()
  const onUpdatePrinting = jest.fn()
  const view = render(
    <ThemeProvider initialContext="dark">
      <CardScanner
        game="mtg"
        nameIndex={nameIndex}
        singleton={false}
        copiesInDeck={() => 0}
        addCards={async (names) => names.map(() => ({}))}
        onScanPrinting={onScanPrinting}
        onUpdatePrinting={onUpdatePrinting}
        onClose={jest.fn()}
      />
    </ThemeProvider>,
  )
  const layout = { x: 0, y: 0, width: 400, height: 700 }
  for (const laidOut of view.UNSAFE_getAllByType(View).filter((node) => node.props.onLayout))
    fireEvent(laidOut, "layout", { nativeEvent: { layout }, persist: () => undefined })

  show("Sol Ring", "TRK • EN")
  show("Sol Ring", "TRK • EN")
  expect(onScanPrinting).toHaveBeenCalledTimes(1)
  expect(onScanPrinting).toHaveBeenLastCalledWith(
    expect.objectContaining({ name: "Sol Ring", finish: "nonfoil" }),
  )

  act(() =>
    mockOnText?.({
      nativeEvent: {
        width: 960,
        height: 1280,
        lines: [
          { text: "Sol Ring", x: 0, y: 100, width: 100, height: 20, angle: 0, confidence: 1 },
        ],
        bottomLines: [
          {
            text: "TRK * EN",
            x: 0,
            y: 1100,
            width: 100,
            height: 20,
            angle: 0,
            confidence: 1,
            foilStar: true,
          },
        ],
      },
    }),
  )
  await act(async () => {})
  expect(onUpdatePrinting).toHaveBeenCalledWith(
    expect.any(Number),
    expect.objectContaining({ name: "Sol Ring", printingId: "trk-sol", finish: "foil" }),
  )

  show("Arcane Signet")
  show("Arcane Signet")
  expect(onScanPrinting).toHaveBeenCalledTimes(2)

  show("Sol Ring")
  show("Sol Ring")
  expect(onScanPrinting).toHaveBeenCalledTimes(2)
  catalogDb.clearAll()
})

test("keeps card locked across title-glare frames that still show bottom text and refines an un-hinted default printing", async () => {
  catalogDb.clearAll()
  catalogDb.replacePrintings(
    "mtg",
    [
      {
        game: "mtg",
        printingId: "10e-sol",
        cardId: "ora-sol",
        name: "Sol Ring",
        nameNormalized: "sol ring",
        setCode: "10e",
        setName: "Tenth Edition",
        collectorNumber: "335",
        rarity: "uncommon",
        finishes: ["nonfoil", "foil"],
      },
      {
        game: "mtg",
        printingId: "40k-sol",
        cardId: "ora-sol",
        name: "Sol Ring",
        nameNormalized: "sol ring",
        setCode: "40k",
        setName: "Warhammer 40,000",
        collectorNumber: "240",
        rarity: "uncommon",
        finishes: ["nonfoil", "foil"],
      },
    ],
    "v1",
  )

  const onScanPrinting = jest.fn()
  const onUpdatePrinting = jest.fn()
  const view = render(
    <ThemeProvider initialContext="dark">
      <CardScanner
        game="mtg"
        nameIndex={nameIndex}
        singleton={false}
        copiesInDeck={() => 0}
        addCards={async (names) => names.map(() => ({}))}
        onScanPrinting={onScanPrinting}
        onUpdatePrinting={onUpdatePrinting}
        onClose={jest.fn()}
      />
    </ThemeProvider>,
  )
  const layout = { x: 0, y: 0, width: 400, height: 700 }
  for (const laidOut of view.UNSAFE_getAllByType(View).filter((node) => node.props.onLayout))
    fireEvent(laidOut, "layout", { nativeEvent: { layout }, persist: () => undefined })

  show("Sol Ring")
  show("Sol Ring")
  expect(onScanPrinting).toHaveBeenCalledTimes(1)
  expect(onScanPrinting).toHaveBeenLastCalledWith(
    expect.objectContaining({ name: "Sol Ring", printingId: "10e-sol", finish: "nonfoil" }),
  )

  for (let i = 0; i < 2; i += 1) {
    act(() =>
      mockOnText?.({
        nativeEvent: {
          width: 960,
          height: 1280,
          lines: [],
          bottomLines: [
            {
              text: "40K EN ARTIST",
              x: 0,
              y: 1100,
              width: 100,
              height: 20,
              angle: 0,
              confidence: 1,
            },
          ],
        },
      }),
    )
  }

  act(() =>
    mockOnText?.({
      nativeEvent: {
        width: 960,
        height: 1280,
        lines: [
          { text: "Sol Ring", x: 0, y: 100, width: 100, height: 20, angle: 0, confidence: 1 },
        ],
        bottomLines: [
          {
            text: "40K * EN ARTIST",
            x: 0,
            y: 1100,
            width: 100,
            height: 20,
            angle: 0,
            confidence: 1,
            foilStar: true,
          },
        ],
      },
    }),
  )
  expect(onScanPrinting).toHaveBeenCalledTimes(1)
  await act(async () => {})
  expect(onUpdatePrinting).toHaveBeenCalledWith(
    expect.any(Number),
    expect.objectContaining({
      name: "Sol Ring",
      printingId: "40k-sol",
      setCode: "40k",
      finish: "foil",
    }),
  )
  catalogDb.clearAll()
})

test("handheld cooldown counts from the last sighting, so a card peeking behind the next one is not re-added", () => {
  jest.useFakeTimers()
  try {
    const onScanPrinting = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <CardScanner
          game="mtg"
          nameIndex={nameIndex}
          singleton={false}
          copiesInDeck={() => 0}
          addCards={async (names) => names.map(() => ({}))}
          onScanPrinting={onScanPrinting}
          onClose={jest.fn()}
        />
      </ThemeProvider>,
    )
    const layout = { x: 0, y: 0, width: 400, height: 700 }
    for (const laidOut of view.UNSAFE_getAllByType(View).filter((node) => node.props.onLayout))
      fireEvent(laidOut, "layout", { nativeEvent: { layout }, persist: () => undefined })

    show("Sol Ring")
    show("Sol Ring")
    act(() => jest.advanceTimersByTime(3_000))
    show("Sol Ring")
    show("Arcane Signet")
    show("Arcane Signet")
    expect(onScanPrinting.mock.calls.map(([scan]) => scan.name)).toEqual([
      "Sol Ring",
      "Arcane Signet",
    ])

    const pastCooldownSinceAddButNotSinceLastSeen = 2_000
    act(() => jest.advanceTimersByTime(pastCooldownSinceAddButNotSinceLastSeen))
    show("Sol Ring")
    show("Sol Ring")
    expect(onScanPrinting).toHaveBeenCalledTimes(2)
  } finally {
    jest.useRealTimers()
  }
})

test("frames that arrive while a read is pending are skipped, so only the newest is read", () => {
  jest.useFakeTimers()
  try {
    const { addCards } = renderScanner({ singleton: false })
    const frame = (text: string) => ({
      nativeEvent: {
        width: 960,
        height: 1280,
        lines: [{ text, x: 0, y: 0, width: 100, height: 20, angle: 0, confidence: 1 }],
      },
    })
    act(() => {
      mockQueueText?.(frame("Sol Ring"))
      mockQueueText?.(frame("Arcane Signet"))
      mockQueueText?.(frame("Arcane Signet"))
      jest.advanceTimersByTime(0)
    })
    act(() => jest.advanceTimersByTime(1_500))
    const queuedFramesCountedAsOneVote = !addCards.mock.calls.length
    expect(queuedFramesCountedAsOneVote).toBe(true)
    show("Arcane Signet")
    act(() => jest.advanceTimersByTime(1_500))
    expect(addCards.mock.calls.map(([names]) => names)).toEqual([["Arcane Signet"]])
  } finally {
    jest.useRealTimers()
  }
})

function solRingPrintings(
  ...printings: { id: string; set: string; number: string; finishes?: string[] }[]
) {
  catalogDb.clearAll()
  catalogDb.replacePrintings(
    "mtg",
    printings.map(({ id, set, number, finishes = ["nonfoil", "foil"] }) => ({
      game: "mtg",
      printingId: id,
      cardId: "ora-sol",
      name: "Sol Ring",
      nameNormalized: "sol ring",
      setCode: set,
      setName: set,
      collectorNumber: number,
      rarity: "uncommon",
      finishes,
    })),
    "v1",
  )
}

function collectorFrame(collector: string, extra: Partial<CardPhotoText> = {}) {
  act(() =>
    mockOnText?.({
      nativeEvent: {
        width: 960,
        height: 1280,
        lines: [
          { text: "Sol Ring", x: 0, y: 100, width: 100, height: 20, angle: 0, confidence: 1 },
        ],
        bottomLines: [
          { text: collector, x: 0, y: 1100, width: 100, height: 20, angle: 0, confidence: 1 },
        ],
        ...extra,
      },
    }),
  )
}

function renderPrintingScanner(initialSetLock?: string) {
  const onScanPrinting = jest.fn()
  const onUpdatePrinting = jest.fn((_id: number, _update: object): boolean => true)
  const view = render(
    <ThemeProvider initialContext="dark">
      <CardScanner
        game="mtg"
        nameIndex={nameIndex}
        singleton={false}
        copiesInDeck={() => 0}
        addCards={async (names) => names.map(() => ({}))}
        onScanPrinting={onScanPrinting}
        onUpdatePrinting={onUpdatePrinting}
        initialSetLock={initialSetLock}
        onClose={jest.fn()}
      />
    </ThemeProvider>,
  )
  const layout = { x: 0, y: 0, width: 400, height: 700 }
  for (const laidOut of view.UNSAFE_getAllByType(View).filter((node) => node.props.onLayout))
    fireEvent(laidOut, "layout", { nativeEvent: { layout }, persist: () => undefined })
  return { view, onScanPrinting, onUpdatePrinting }
}

test("a set-only read keeps refining until a collector number pins the printing", async () => {
  solRingPrintings(
    { id: "tmc-sol", set: "tmc", number: "100" },
    { id: "tmc-sol-ext", set: "tmc", number: "200" },
  )
  const { onScanPrinting, onUpdatePrinting } = renderPrintingScanner()
  collectorFrame("TMC • EN")
  collectorFrame("TMC • EN")
  expect(onScanPrinting).toHaveBeenLastCalledWith(
    expect.objectContaining({ printingId: "tmc-sol" }),
  )

  collectorFrame("200/350 U TMC • EN")
  await act(async () => {})
  expect(onUpdatePrinting).toHaveBeenLastCalledWith(
    expect.any(Number),
    expect.objectContaining({ printingId: "tmc-sol-ext" }),
  )
  catalogDb.clearAll()
})

test("with a set lock, a later collector number alone refines the printing", async () => {
  solRingPrintings(
    { id: "tmc-sol", set: "tmc", number: "100" },
    { id: "tmc-sol-ext", set: "tmc", number: "200" },
  )
  const { onScanPrinting, onUpdatePrinting } = renderPrintingScanner("TMC")
  collectorFrame("EN")
  collectorFrame("EN")
  expect(onScanPrinting).toHaveBeenLastCalledWith(
    expect.objectContaining({ printingId: "tmc-sol" }),
  )

  collectorFrame("200/350 U")
  await act(async () => {})
  expect(onUpdatePrinting).toHaveBeenLastCalledWith(
    expect.any(Number),
    expect.objectContaining({ printingId: "tmc-sol-ext" }),
  )
  catalogDb.clearAll()
})

test("a misread collector number that falls back to another printing still lets a later read refine", async () => {
  solRingPrintings(
    { id: "tmc-sol", set: "tmc", number: "100" },
    { id: "tmc-sol-ext", set: "tmc", number: "200" },
  )
  const { onScanPrinting, onUpdatePrinting } = renderPrintingScanner("TMC")
  collectorFrame("999/350 U")
  collectorFrame("999/350 U")
  expect(onScanPrinting).toHaveBeenLastCalledWith(
    expect.objectContaining({ printingId: "tmc-sol" }),
  )

  collectorFrame("200/350 U")
  await act(async () => {})
  expect(onUpdatePrinting).toHaveBeenLastCalledWith(
    expect.any(Number),
    expect.objectContaining({ printingId: "tmc-sol-ext" }),
  )
  catalogDb.clearAll()
})

test("a refinement the deck refuses rolls back to the shown printing so a later frame retries", async () => {
  solRingPrintings(
    { id: "tmc-sol", set: "tmc", number: "100" },
    { id: "tmc-sol-ext", set: "tmc", number: "200" },
  )
  const { onScanPrinting, onUpdatePrinting } = renderPrintingScanner()
  onUpdatePrinting.mockReturnValueOnce(false)
  collectorFrame("TMC • EN")
  collectorFrame("TMC • EN")
  expect(onScanPrinting).toHaveBeenLastCalledWith(
    expect.objectContaining({ printingId: "tmc-sol" }),
  )

  collectorFrame("200/350 U TMC • EN")
  collectorFrame("", {
    bottomLines: [
      {
        text: "200/350 U TMC * EN",
        x: 0,
        y: 1100,
        width: 100,
        height: 20,
        angle: 0,
        confidence: 1,
        foilStar: true,
      },
    ],
  })
  await act(async () => {})
  expect(onUpdatePrinting).toHaveBeenCalledTimes(1)

  collectorFrame("200/350 U TMC • EN")
  await act(async () => {})
  expect(onUpdatePrinting).toHaveBeenCalledTimes(2)
  expect(onUpdatePrinting).toHaveBeenLastCalledWith(
    expect.any(Number),
    expect.objectContaining({ printingId: "tmc-sol-ext" }),
  )
  catalogDb.clearAll()
})

test("a foil star with no collector number keeps the accepted printing", async () => {
  solRingPrintings(
    { id: "10e-sol", set: "10e", number: "320" },
    { id: "tmc-sol", set: "tmc", number: "59" },
  )
  const { onScanPrinting, onUpdatePrinting } = renderPrintingScanner()
  collectorFrame("059/350 U TMC • EN")
  collectorFrame("059/350 U TMC • EN")
  expect(onScanPrinting).toHaveBeenLastCalledWith(
    expect.objectContaining({ printingId: "tmc-sol" }),
  )

  collectorFrame("", {
    bottomLines: [
      { text: "*", x: 0, y: 1100, width: 10, height: 20, angle: 0, confidence: 1, foilStar: true },
    ],
  })
  await act(async () => {})
  expect(onUpdatePrinting).toHaveBeenLastCalledWith(
    expect.any(Number),
    expect.objectContaining({ printingId: "tmc-sol", finish: "foil" }),
  )
  catalogDb.clearAll()
})

test("blank text frames while the card is still outlined do not unlock a handheld re-add", () => {
  jest.useFakeTimers()
  try {
    const { addCards } = renderScanner({ singleton: false })
    show("Sol Ring")
    show("Sol Ring")
    const outlinedButUnread = {
      width: 960,
      height: 1280,
      lines: [],
      cardCorners: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
    }
    act(() => mockOnText?.({ nativeEvent: outlinedButUnread }))
    act(() => mockOnText?.({ nativeEvent: outlinedButUnread }))
    show("Sol Ring")
    show("Sol Ring")
    act(() => jest.advanceTimersByTime(1_500))
    expect(addCards.mock.calls.flatMap(([names]) => names)).toEqual(["Sol Ring"])
  } finally {
    jest.useRealTimers()
  }
})

test("refining to a foil-only printing saves it as foil", async () => {
  solRingPrintings(
    { id: "tmc-sol", set: "tmc", number: "100" },
    { id: "tmc-sol-foil", set: "tmc", number: "200", finishes: ["foil"] },
  )
  const { onScanPrinting, onUpdatePrinting } = renderPrintingScanner()
  collectorFrame("TMC • EN")
  collectorFrame("TMC • EN")
  expect(onScanPrinting).toHaveBeenLastCalledWith(
    expect.objectContaining({ printingId: "tmc-sol", finish: "nonfoil" }),
  )

  collectorFrame("200/350 U TMC • EN")
  await act(async () => {})
  expect(onUpdatePrinting).toHaveBeenLastCalledWith(
    expect.any(Number),
    expect.objectContaining({ printingId: "tmc-sol-foil", finish: "foil" }),
  )
  catalogDb.clearAll()
})

test.each([
  ["after", false],
  ["before", true],
])(
  "a star on another card's collector strip listed %s this card's does not make it foil",
  (_order, otherFirst) => {
    solRingPrintings({ id: "tmc-sol", set: "tmc", number: "100" })
    const { onScanPrinting } = renderPrintingScanner()
    const own = { text: "TMC • EN", x: 0, y: 1100, width: 100, height: 20, angle: 0, confidence: 1 }
    const other = {
      text: "NCC ★ EN",
      x: 0,
      y: 600,
      width: 100,
      height: 20,
      angle: 0,
      confidence: 1,
    }
    const strips = { bottomLines: otherFirst ? [other, own] : [own, other] }
    collectorFrame("", strips)
    collectorFrame("", strips)
    expect(onScanPrinting).toHaveBeenLastCalledWith(
      expect.objectContaining({ printingId: "tmc-sol", finish: "nonfoil" }),
    )
    catalogDb.clearAll()
  },
)

test("clearing the set lock lets a handheld card it rejected be added while still in frame", () => {
  solRingPrintings({ id: "tmc-sol", set: "tmc", number: "100" })
  const { view, addCards } = renderScanner({ singleton: false })
  fireEvent.press(view.getByTestId("card-scan-set-lock"))
  fireEvent.changeText(view.getByTestId("card-scan-set-lock-input"), "FDN")
  fireEvent.press(view.getAllByText("Done").at(-1)!)
  show("Sol Ring")
  show("Sol Ring")
  expect(view.getByText("Sol Ring isn't in FDN.")).toBeTruthy()

  fireEvent.press(view.getByTestId("card-scan-set-lock"))
  fireEvent.press(view.getByText("Clear set lock"))
  jest.useFakeTimers()
  try {
    show("Sol Ring")
    show("Sol Ring")
    act(() => jest.advanceTimersByTime(1_500))
    expect(addCards.mock.calls.flatMap(([names]) => names)).toEqual(["Sol Ring"])
  } finally {
    jest.useRealTimers()
  }
  catalogDb.clearAll()
})

const nameOutOfFrameStar = {
  lines: [
    {
      text: "Legendary Artifact Creature",
      x: 0,
      y: 100,
      width: 100,
      height: 20,
      angle: 0,
      confidence: 1,
    },
  ],
  bottomLines: [
    { text: "100/350 U", x: 0, y: 1080, width: 100, height: 20, angle: 0, confidence: 1 },
    {
      text: "TMC * EN",
      x: 0,
      y: 1100,
      width: 100,
      height: 20,
      angle: 0,
      confidence: 1,
      foilStar: true,
    },
  ],
}

test("a foil star seen while the name is out of frame upgrades the card its collector number pins", async () => {
  solRingPrintings({ id: "tmc-sol", set: "tmc", number: "100" })
  const { onScanPrinting, onUpdatePrinting } = renderPrintingScanner()
  collectorFrame("100/350 U TMC • EN")
  collectorFrame("100/350 U TMC • EN")
  expect(onScanPrinting).toHaveBeenLastCalledWith(expect.objectContaining({ finish: "nonfoil" }))

  collectorFrame("", nameOutOfFrameStar)
  await act(async () => {})
  expect(onUpdatePrinting).toHaveBeenLastCalledWith(
    expect.any(Number),
    expect.objectContaining({ printingId: "tmc-sol", finish: "foil" }),
  )
  catalogDb.clearAll()
})

test("a foil star seen just before the name is read makes the add foil", () => {
  solRingPrintings({ id: "tmc-sol", set: "tmc", number: "100" })
  const { onScanPrinting } = renderPrintingScanner()
  collectorFrame("", nameOutOfFrameStar)
  collectorFrame("100/350 U TMC • EN")
  collectorFrame("100/350 U TMC • EN")
  expect(onScanPrinting).toHaveBeenLastCalledWith(
    expect.objectContaining({ printingId: "tmc-sol", finish: "foil" }),
  )
  catalogDb.clearAll()
})

test("in bulk mode a new card on the stand does not inherit the last card's foil star", () => {
  solRingPrintings({ id: "tmc-sol", set: "tmc", number: "100" })
  const { view, onScanPrinting } = renderPrintingScanner()
  fireEvent.press(view.getByTestId("card-scan-mode"))
  collectorFrame("", {
    bottomLines: [
      { text: "100/350 U", x: 0, y: 1080, width: 100, height: 20, angle: 0, confidence: 1 },
      {
        text: "TMC * EN",
        x: 0,
        y: 1100,
        width: 100,
        height: 20,
        angle: 0,
        confidence: 1,
        foilStar: true,
      },
    ],
  })
  expect(onScanPrinting).toHaveBeenLastCalledWith(expect.objectContaining({ finish: "foil" }))

  collectorFrame("100/350 U TMC • EN", { sceneChanged: true })
  expect(onScanPrinting).toHaveBeenCalledTimes(2)
  expect(onScanPrinting).toHaveBeenLastCalledWith(expect.objectContaining({ finish: "nonfoil" }))
  catalogDb.clearAll()
})

test("in bulk mode a collector number read after a title-only match refines that card instead of adding another", async () => {
  solRingPrintings(
    { id: "10e-sol", set: "10e", number: "335" },
    { id: "40k-sol", set: "40k", number: "240" },
  )
  const { view, onScanPrinting, onUpdatePrinting } = renderPrintingScanner()
  fireEvent.press(view.getByTestId("card-scan-mode"))
  show("Sol Ring")
  expect(onScanPrinting).toHaveBeenLastCalledWith(
    expect.objectContaining({ printingId: "10e-sol" }),
  )

  collectorFrame("240/250 U 40K • EN")
  await act(async () => {})
  expect(onScanPrinting).toHaveBeenCalledTimes(1)
  expect(onUpdatePrinting).toHaveBeenLastCalledWith(
    expect.any(Number),
    expect.objectContaining({ printingId: "40k-sol" }),
  )

  collectorFrame("335/383 U 10E • EN")
  expect(onScanPrinting).toHaveBeenCalledTimes(2)
  catalogDb.clearAll()
})
