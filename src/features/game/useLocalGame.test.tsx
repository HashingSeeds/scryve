import { act, renderHook } from "@testing-library/react-native"

import { captureGame } from "@/utils/analytics"
import { recordReviewCompletion } from "@/utils/storeReview"

import { createLocalGame } from "./domain"
import { LocalGameRepository, type StringStorage } from "./localPersistence"
import type { LocalGame } from "./types"
import { useLocalGame } from "./useLocalGame"

jest.mock("@/utils/analytics", () => ({ captureGame: jest.fn() }))
jest.mock("@/utils/storeReview", () => ({ recordReviewCompletion: jest.fn() }))

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
  it("keeps one table runtime across a life change and replaces it when the table changes", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const initial = createLocalGame({
      now: 1,
      system: "pokemon",
      format: "standard",
      startingLife: 6,
      players: [
        { name: "Ada", color: "#000" },
        { name: "Grace", color: "#111" },
      ],
    })
    const { result } = renderHook(() => useLocalGame(initial, repository))
    const before = result.current.tableRuntime

    act(() => result.current.changeLife(initial.players[0].id, -1))
    expect(result.current.game.players[0].life).toBe(5)
    expect(result.current.tableRuntime).toBe(before)

    act(() => {
      result.current.placePokemon(initial.players[0].id, "active", { hp: 60, prizes: 1 })
    })
    expect(result.current.tableRuntime).not.toBe(before)
    expect(
      result.current.tableRuntime.table.players[initial.players[0].id]?.pokemon?.active,
    ).toMatchObject({ hp: 60 })
  })

  it("persists a life change before publishing it", () => {
    const storage = new MemoryStorage()
    const repository = new LocalGameRepository(storage)
    const initial = game()
    const { result } = renderHook(() => useLocalGame(initial, repository))

    act(() => result.current.changeLife(initial.players[0].id, 1))

    expect(result.current.game.players[0].life).toBe(21)
    expect(new LocalGameRepository(storage).loadActiveGame()?.players[0].life).toBe(21)
  })

  it("persists layout before a following life change", () => {
    const storage = new MemoryStorage()
    const repository = new LocalGameRepository(storage)
    const initial = game()
    const { result } = renderHook(() => useLocalGame(initial, repository))
    const save = jest.spyOn(repository, "saveActiveGame")
    act(() => result.current.changeLayout("even-grid"))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ layout: "even-grid" }))
    act(() => result.current.changeLife(initial.players[0].id, 1))
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ layout: "even-grid" }))
    expect(new LocalGameRepository(storage).loadActiveGame()?.players[0].life).toBe(21)
  })

  it("adopts a rename made under it in the same millisecond before its next tap saves", () => {
    const storage = new MemoryStorage()
    const repository = new LocalGameRepository(storage)
    const initial = game()
    repository.saveActiveGame(initial)
    const { result, rerender } = renderHook(
      ({ storedGame }: { storedGame: LocalGame }) => useLocalGame(storedGame, repository),
      { initialProps: { storedGame: initial } },
    )
    jest.spyOn(Date, "now").mockReturnValueOnce(initial.updatedAt)
    repository.updateActivePlayers(initial.id, [
      { name: "Alice", color: "#000" },
      { name: "Grace", color: "#111" },
    ])
    expect(repository.loadActiveGame()?.updatedAt).toBe(initial.updatedAt)
    rerender({ storedGame: repository.loadActiveGame() ?? initial })

    act(() => result.current.changeLife(initial.players[1].id, 1))

    const stored = new LocalGameRepository(storage).loadActiveGame()
    expect(stored?.players.map(({ name, life }) => [name, life])).toEqual([
      ["Alice", 20],
      ["Grace", 21],
    ])
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

it("counts the first gameplay action once, then explicit completion", () => {
  jest.mocked(captureGame).mockClear()
  const initial = game()
  const repository = new LocalGameRepository(new MemoryStorage())
  const { result } = renderHook(() => useLocalGame(initial, repository))
  expect(captureGame).not.toHaveBeenCalled()
  act(() => result.current.changeLayout("even-grid"))
  expect(captureGame).not.toHaveBeenCalled()
  act(() => result.current.changeLife(initial.players[0].id, 1))
  act(() => result.current.changeLife(initial.players[0].id, -1))
  expect(captureGame).toHaveBeenCalledTimes(1)
  expect(captureGame).toHaveBeenLastCalledWith(
    "game_started",
    expect.objectContaining({ playerCount: 2 }),
    "local",
  )
  act(() => result.current.finish({ kind: "draw" }))
  expect(captureGame).toHaveBeenLastCalledWith(
    "game_completed",
    expect.objectContaining({ playerCount: 2 }),
    "local",
    "game_menu",
  )
})

it("counts a finished local game for reviews but not an abandoned game", () => {
  jest.mocked(recordReviewCompletion).mockClear()
  const repository = new LocalGameRepository(new MemoryStorage())
  const initial = game()
  const finished = renderHook(() => useLocalGame(initial, repository))
  act(() => finished.result.current.finish({ kind: "draw" }))
  expect(recordReviewCompletion).toHaveBeenCalledWith(`local:${initial.id}`)
  const unfinished = game()
  const abandoned = renderHook(() => useLocalGame(unfinished, repository))
  act(() => abandoned.result.current.abandon())
  expect(recordReviewCompletion).toHaveBeenCalledTimes(1)
})
