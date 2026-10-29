import { act, fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import type { ScannedCardAdd } from "./CardScanner"
import { CardSearchScreen } from "./CardSearchScreen"

const mockAction = jest.fn()
const mockClient = { action: mockAction, query: jest.fn() }
const mockConnection = { isWebSocketConnected: true }
jest.mock("convex/react", () => ({
  useConvex: () => mockClient,
  useAction: () => jest.fn(),
  useConvexConnectionState: () => mockConnection,
}))
jest.mock("../../../modules/card-text-reader", () => ({ canReadCardText: true }))
let mockAddCards: ((names: string[]) => Promise<ScannedCardAdd[]>) | undefined
jest.mock("./CardScanner", () => ({
  CardScanner: (props: { addCards: typeof mockAddCards }) => {
    mockAddCards = props.addCards
    return null
  },
}))

const solRing = { name: "Sol Ring", scryfallId: "ring", oracleId: "ring-oracle" }

function scanInto(onAdd: () => string | undefined) {
  mockAction.mockResolvedValue({ cards: [solRing], lookupFailed: false })
  const view = render(
    <ThemeProvider initialContext="dark">
      <CardSearchScreen game="mtg" format="commander" onAdd={onAdd} onClose={jest.fn()} />
    </ThemeProvider>,
  )
  fireEvent.press(view.getByTestId("card-scan-button"))
}

test("a scanned card the deck refused while offline is retried", async () => {
  mockConnection.isWebSocketConnected = false
  scanInto(() => "You're offline.")
  let results: ScannedCardAdd[] = []
  await act(async () => {
    results = (await mockAddCards?.(["Sol Ring"])) ?? []
  })
  expect(results).toEqual([{ error: "You're offline.", retryable: true }])
})

test("a scanned card the deck refused while online is not retried", async () => {
  mockConnection.isWebSocketConnected = true
  scanInto(() => "Too many copies.")
  let results: ScannedCardAdd[] = []
  await act(async () => {
    results = (await mockAddCards?.(["Sol Ring"])) ?? []
  })
  expect(results).toEqual([{ error: "Too many copies.", retryable: false }])
})
