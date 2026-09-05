import { act, renderHook } from "@testing-library/react-native"

import { createLocalGame } from "./domain"
import { LocalGameRepository, type StringStorage } from "./localPersistence"
import { useLocalGame } from "./useLocalGame"

class MemoryStorage implements StringStorage {
  values = new Map<string, string>()

  getString(key: string) {
    return this.values.get(key)
  }

  set(key: string, value: string) {
    this.values.set(key, value)
  }

  delete(key: string) {
    this.values.delete(key)
  }
}

function game() {
  return createLocalGame({
    now: 1,
    startingLife: 20,
    players: [
      { name: "Ada", color: "#000" },
      { name: "Grace", color: "#111" },
    ],
  })
}

describe("useLocalGame persistence", () => {
  it("persists a life change before publishing it", () => {
    const storage = new MemoryStorage()
    const repository = new LocalGameRepository(storage)
    const initial = game()
    const { result } = renderHook(() => useLocalGame(initial, repository))

    act(() => result.current.changeLife(initial.players[0].id, 1))

    expect(result.current.game.players[0].life).toBe(21)
    expect(new LocalGameRepository(storage).loadActiveGame()?.players[0].life).toBe(21)
  })

  it("does not publish a change when persistence fails", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const initial = game()
    jest.spyOn(repository, "saveActiveGame").mockImplementation(() => {
      throw new Error("storage unavailable")
    })
    const { result } = renderHook(() => useLocalGame(initial, repository))

    expect(() => act(() => result.current.changeLife(initial.players[0].id, 1))).toThrow(
      "storage unavailable",
    )
    expect(result.current.game).toBe(initial)
    expect(result.current.game.players[0].life).toBe(20)
  })
})
