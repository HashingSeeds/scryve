import type { ComponentProps, memo } from "react"
import { render } from "@testing-library/react-native"

import { asPlayerId } from "@/features/game/domain"
import { ThemeProvider } from "@/theme/context"

import { PlayerGrid } from "./PlayerGrid"

const mockRenders = new Map<number, number>()

jest.mock("./LifeCard", () => {
  const { memo: rememo }: typeof import("react") = jest.requireActual("react")
  const actual: typeof import("./LifeCard") = jest.requireActual("./LifeCard")
  const { type: Card, compare } = actual.LifeCard as typeof actual.LifeCard & {
    compare: Parameters<typeof memo>[1]
  }
  const CountedCard = (props: ComponentProps<typeof actual.LifeCard>) => {
    mockRenders.set(props.seatNumber, (mockRenders.get(props.seatNumber) ?? 0) + 1)
    return <Card {...props} />
  }
  return { ...actual, LifeCard: rememo(CountedCard, compare) }
})

const players = Array.from({ length: 4 }, (_, seat) => ({
  id: asPlayerId(`player-${seat}`),
  name: `Player ${seat + 1}`,
  color: "#41476E",
  life: 40,
  seat,
}))

const commanderDamage = {
  incomingFor: () => ({}),
  lethal: 21,
  attack: {
    armedPlayerId: null,
    inspectedPlayerId: null,
    acted: false,
    stagedTargets: undefined,
    against: jest.fn(),
    dispatch: jest.fn(),
  },
  inspection: { playerId: null, onChange: jest.fn() },
  onPressSword: jest.fn(),
}

describe("PlayerGrid renders", () => {
  it.each([
    ["standard", undefined],
    ["commander", commanderDamage],
  ])("re-renders only the changed card on a %s board", (_, damage) => {
    const onChange = jest.fn()
    const grid = (current: typeof players) => (
      <ThemeProvider>
        <PlayerGrid players={current} commanderDamage={damage} onChange={onChange} />
      </ThemeProvider>
    )
    const view = render(grid(players))
    mockRenders.clear()

    view.rerender(
      grid(players.map((player) => (player.seat === 1 ? { ...player, life: 39 } : player))),
    )

    expect(Object.fromEntries(mockRenders)).toEqual({ 2: 1 })
  })

  it("keeps every seat's card mounted through a rematch's new player ids", () => {
    const grid = (current: typeof players) => (
      <ThemeProvider>
        <PlayerGrid players={current} onChange={jest.fn()} />
      </ThemeProvider>
    )
    const view = render(grid(players))
    const before = players.map(({ seat }) => view.getByTestId(`life-card-seat-${seat + 1}`))

    view.rerender(
      grid(players.map((player) => ({ ...player, id: asPlayerId(`rematch-${player.seat}`) }))),
    )

    players.forEach(({ seat }) =>
      expect(view.getByTestId(`life-card-seat-${seat + 1}`)).toBe(before[seat]),
    )
  })
})
