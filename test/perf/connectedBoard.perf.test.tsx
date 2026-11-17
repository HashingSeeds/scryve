import { type ComponentProps, type memo, Profiler } from "react"
import { act, render } from "@testing-library/react-native"

import { expectWithinBudget } from "./budget"
import { ConnectedBoardScreen } from "../../src/screens/ConnectedBoardScreen"
import { connectedHarness, resetConnectedHarness, themed } from "../support/connectedHarness"

const mockCounts = new Map<string, number>()
function mockCount(name: string) {
  mockCounts.set(name, (mockCounts.get(name) ?? 0) + 1)
}

jest.mock("@/components/LifeCard", () => {
  const { memo: rememo }: typeof import("react") = jest.requireActual("react")
  const actual: typeof import("@/components/LifeCard") = jest.requireActual("@/components/LifeCard")
  const { type: Card, compare } = actual.LifeCard as typeof actual.LifeCard & {
    compare: Parameters<typeof memo>[1]
  }
  // why: calling the card's own function counts renders from its state and context too.
  const CountedCard = (props: ComponentProps<typeof actual.LifeCard>) => {
    mockCount(`LifeCard ${props.playerName}`)
    return Card(props)
  }
  return { ...actual, LifeCard: rememo(CountedCard, compare) }
})
jest.mock("@/features/rules/rulesSource", () => ({ prefetchRules: jest.fn() }))
jest.mock("@/utils/useStoreReview", () => ({ useStoreReview: jest.fn() }))
jest.mock("expo-router", () => ({ useFocusEffect: jest.fn() }))
jest.mock("@clerk/expo", () =>
  jest
    .requireActual<typeof import("../support/connectedHarness")>("../support/connectedHarness")
    .createClerkMock(),
)
jest.mock("convex/react", () =>
  jest
    .requireActual<typeof import("../support/connectedHarness")>("../support/connectedHarness")
    .createConvexReactMock(),
)
jest.mock("@/features/connected/useConnectedGame", () =>
  jest
    .requireActual<typeof import("../support/connectedHarness")>("../support/connectedHarness")
    .createConnectedGameMock(),
)
jest.mock("../../convex/_generated/api", () =>
  jest
    .requireActual<typeof import("../support/connectedHarness")>("../support/connectedHarness")
    .createGeneratedApiMock(),
)

function fourPlayerProjection(lifeOfSeat3: number) {
  return {
    ...connectedHarness.runtime.projection,
    playerCount: 4,
    players: Array.from({ length: 4 }, (_, index) => ({
      playerId: `player-${index + 1}`,
      seat: index + 1,
      displayName: `Player ${index + 1}`,
      color: "#7C3AED",
      currentLife: index === 2 ? lifeOfSeat3 : 40,
      pendingDelta: 0,
      controlledByMe: index === 0,
    })),
  }
}

function board() {
  return (
    <Profiler id="board" onRender={() => mockCount("commits")}>
      {themed(<ConnectedBoardScreen publicId="game-public" />)}
    </Profiler>
  )
}

describe("connected board render budget", () => {
  beforeEach(() => {
    resetConnectedHarness()
    jest.useFakeTimers()
  })
  afterEach(() => jest.useRealTimers())

  it("another player's life change renders only their seat", () => {
    connectedHarness.runtime = { ...connectedHarness.runtime, projection: fourPlayerProjection(40) }
    const view = render(board())
    act(() => jest.runOnlyPendingTimers())
    mockCounts.clear()

    connectedHarness.runtime = { ...connectedHarness.runtime, projection: fourPlayerProjection(39) }
    view.rerender(board())
    act(() => jest.runOnlyPendingTimers())

    expectWithinBudget(Object.fromEntries(mockCounts), { "commits": 1, "LifeCard Player 3": 1 })
  })
})
