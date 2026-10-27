import { View } from "react-native"
import { act, fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { cardNameIndex } from "./cardNameMatch"
import { CardScanner } from "./CardScanner"
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

function renderScanner(props: { singleton: boolean; inDeck?: Record<string, number> }) {
  const addCards = jest.fn(async (names: string[]) => names.map(() => ({})))
  const view = render(
    <ThemeProvider initialContext="dark">
      <CardScanner
        game="mtg"
        nameIndex={nameIndex}
        singleton={props.singleton}
        copiesInDeck={(name) => props.inDeck?.[name] ?? 0}
        addCards={addCards}
        onClose={jest.fn()}
      />
    </ThemeProvider>,
  )
  const layout = { x: 0, y: 0, width: 400, height: 700 }
  for (const laidOut of view.UNSAFE_getAllByType(View).filter((node) => node.props.onLayout))
    fireEvent(laidOut, "layout", { nativeEvent: { layout }, persist: () => undefined })
  return { view, addCards }
}

function show(text?: string) {
  const lines = text ? [{ text, x: 0, y: 0, width: 100, height: 20, angle: 0, confidence: 1 }] : []
  act(() => mockOnText?.({ nativeEvent: { width: 960, height: 1280, lines } }))
}

function scan(name: string) {
  show(name)
  show(name)
  show()
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
