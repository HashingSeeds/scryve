import { render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { asActorId, asDeviceId, asGameId, asOperationId, asPlayerId } from "./domain"
import { GameLogDialog } from "./GameLogDialog"
import type { GameEvent } from "./types"

const ada = asPlayerId("ada")
const change = (id: string, delta: number, undoes?: string): GameEvent => ({
  type: "life.changed",
  operationId: asOperationId(id),
  gameId: asGameId("game"),
  actorId: asActorId("me"),
  deviceId: asDeviceId("device"),
  clientCreatedAt: 1,
  playerId: ada,
  delta,
  ...(undoes ? { compensatesOperationId: asOperationId(undoes) } : {}),
})

describe("GameLogDialog", () => {
  it("reads on past pages whose changes the log hides", () => {
    const onMore = jest.fn()
    const dialog = (events: GameEvent[]) => (
      <ThemeProvider>
        <GameLogDialog
          players={[{ id: ada, name: "Ada", life: 40, color: "#000" }]}
          events={events}
          canUndo={false}
          onMore={onMore}
          onUndo={jest.fn()}
          onClose={jest.fn()}
        />
      </ThemeProvider>
    )
    const hidden = [change("op-2", 3, "op-1"), change("op-1", -3)]
    const view = render(dialog(hidden))
    expect(onMore).toHaveBeenCalledTimes(1)

    view.rerender(dialog([...hidden, change("op-4", 2, "op-3"), change("op-3", -2)]))
    expect(onMore).toHaveBeenCalledTimes(2)

    view.rerender(
      dialog([...hidden, change("op-4", 2, "op-3"), change("op-3", -2), change("op-5", -1)]),
    )
    expect(onMore).toHaveBeenCalledTimes(2)
  })
})
