import { type ComponentProps, type memo, Profiler } from "react"
import { act, fireEvent, render } from "@testing-library/react-native"
import type { ReactTestInstance } from "react-test-renderer"

import { createLocalGame } from "@/features/game/domain"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"

import { expectWithinBudget } from "./budget"
import { CurrentGameScreen } from "../../src/screens/CurrentGameScreen"
import { MemoryStorage } from "../support/memoryStorage"

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
jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}))

function renderFourPlayerBoard() {
  const game = createLocalGame({
    players: ["Ada", "Grace", "Katherine", "Dorothy"].map((name) => ({ name, color: "#41476E" })),
    startingLife: 40,
    now: 1,
  })
  const view = render(
    <Profiler id="board" onRender={() => mockCount("commits")}>
      <ThemeProvider>
        <CurrentGameScreen
          initialGame={game}
          repository={new LocalGameRepository(new MemoryStorage())}
          onViewSummary={jest.fn()}
        />
      </ThemeProvider>
    </Profiler>,
  )
  act(() => jest.runOnlyPendingTimers())
  mockCounts.clear()
  return view
}

function tap(target: ReactTestInstance) {
  fireEvent(target, "pressIn")
  fireEvent(target, "pressOut")
  fireEvent.press(target)
}

function countRendersOf(interact: () => void) {
  interact()
  act(() => jest.runOnlyPendingTimers())
  return Object.fromEntries(mockCounts)
}

describe("local board render budget", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("a life tap renders only the tapped seat", () => {
    const view = renderFourPlayerBoard()

    const counts = countRendersOf(() => tap(view.getByTestId("life-seat-2-1")))

    expectWithinBudget(counts, { "commits": 7, "LifeCard Grace": 5 })
  })

  it("opening the game menu renders each seat once", () => {
    const view = renderFourPlayerBoard()

    const counts = countRendersOf(() => fireEvent.press(view.getByTestId("game-menu-button")))

    expectWithinBudget(counts, {
      "commits": 1,
      "LifeCard Ada": 1,
      "LifeCard Grace": 1,
      "LifeCard Katherine": 1,
      "LifeCard Dorothy": 1,
    })
  })
})
