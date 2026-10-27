import { View } from "react-native"
import { act, fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { cardNameIndex } from "./cardNameMatch"
import { CardScanner, type ScannedCardAdd } from "./CardScanner"
import type { CardPhotoText } from "../../../modules/card-text-reader"

let mockOnText: ((event: { nativeEvent: CardPhotoText }) => void) | undefined
jest.mock("../../../modules/card-text-reader", () => ({
  CardTextCamera: (props: { onText: typeof mockOnText }) => {
    mockOnText = props.onText
    return null
  },
}))
jest.mock("./cardTextLayout", () => ({
  framedLinesFromCardTop: (photo: CardPhotoText) => photo.lines.map((line) => line.text),
}))
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
  const view = render(
    <ThemeProvider initialContext="dark">
      <CardScanner
        game="mtg"
        nameIndex={nameIndex}
        singleton={props.singleton}
        copiesInDeck={(name) => props.inDeck?.[name] ?? 0}
        addCards={addCards}
        removeCard={removeCard}
        onClose={onClose}
      />
    </ThemeProvider>,
  )
  const layout = { x: 0, y: 0, width: 400, height: 700 }
  for (const laidOut of view.UNSAFE_getAllByType(View).filter((node) => node.props.onLayout))
    fireEvent(laidOut, "layout", { nativeEvent: { layout }, persist: () => undefined })
  return { view, addCards, removeCard, onClose }
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
  show()
  scan("Arcane Signet")
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
