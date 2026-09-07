import { act, renderHook } from "@testing-library/react-native"

import { captureGame } from "@/utils/analytics"
import { recordReviewCompletion } from "@/utils/storeReview"

import { createLocalGame } from "./domain"
import { LocalGameRepository, type StringStorage } from "./localPersistence"
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
  const abandoned = renderHook(() => useLocalGame(game(), repository))
  act(() => abandoned.result.current.abandon())
  expect(recordReviewCompletion).toHaveBeenCalledTimes(1)
})
