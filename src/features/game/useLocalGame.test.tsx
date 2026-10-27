import { AccessibilityInfo, Alert } from "react-native"
import * as Haptics from "expo-haptics"
import { act, renderHook } from "@testing-library/react-native"

import { captureGame } from "@/utils/analytics"
import { reportCrash } from "@/utils/crashReporting"
import { recordReviewCompletion } from "@/utils/storeReview"
import { resetReducedMotionCacheForTests } from "@/utils/useReducedMotion"

import { createLocalGame } from "./domain"
import { LocalGameRepository, type StringStorage } from "./localPersistence"
import type { LocalGame } from "./types"
import { useLocalGame } from "./useLocalGame"

jest.mock("@/utils/analytics", () => ({ captureGame: jest.fn() }))
jest.mock("@/utils/storeReview", () => ({ recordReviewCompletion: jest.fn() }))
jest.mock("@/utils/crashReporting", () => ({
  ErrorType: { HANDLED: "Handled" },
  reportCrash: jest.fn(),
}))

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
  it("closes the first-player offer in the write that starts play, so clearing the change never reopens it", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const initial = createLocalGame({
      now: 1,
      system: "mtg",
      startingLife: 20,
      players: [
        { name: "Ada", color: "#000" },
        { name: "Grace", color: "#111" },
      ],
    })
    const { result } = renderHook(() => useLocalGame(initial, repository))
    expect(result.current.game.firstPlayerOffered).toBeUndefined()

    act(() => result.current.adjustCounter(initial.players[0].id, "poison", 1))
    expect(result.current.game.firstPlayerOffered).toBe(true)
    expect(repository.loadActiveGame()?.firstPlayerOffered).toBe(true)

    act(() => result.current.adjustCounter(initial.players[0].id, "poison", -1))
    expect(result.current.game.firstPlayerOffered).toBe(true)
  })

  it("closes the first-player offer on any board action, even one that leaves no damage", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const initial = createLocalGame({
      now: 1,
      system: "pokemon",
      startingLife: 6,
      players: [
        { name: "Ash", color: "#000" },
        { name: "Misty", color: "#111" },
      ],
    })
    const { result } = renderHook(() => useLocalGame(initial, repository))

    act(() => {
      result.current.placePokemon(initial.players[0].id, "active", {
        name: "Pikachu",
        hp: 60,
        prizes: 1,
      })
    })
    expect(result.current.game.firstPlayerOffered).toBe(true)
  })

  it("closes the offer when a reopened save already in play is cleared back to its start", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const initial = createLocalGame({
      now: 1,
      system: "mtg",
      startingLife: 20,
      players: [
        { name: "Ada", color: "#000" },
        { name: "Grace", color: "#111" },
      ],
    })
    const first = renderHook(() => useLocalGame(initial, repository))
    act(() => first.result.current.adjustCounter(initial.players[0].id, "poison", 1))
    const { firstPlayerOffered: _, ...unmarked } = first.result.current.game
    repository.saveActiveGame(unmarked)
    first.unmount()

    const reopened = repository.loadActiveGame()!
    const { result } = renderHook(() => useLocalGame(reopened, repository))
    expect(result.current.game.firstPlayerOffered).toBeUndefined()
    act(() => result.current.adjustCounter(initial.players[0].id, "poison", -1))
    expect(result.current.game.firstPlayerOffered).toBe(true)
  })

  it("reopens a played save without writing it", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const played = {
      ...game(),
      players: game().players.map((p, i) => ({ ...p, life: i ? 20 : 18 })),
    }
    repository.saveActiveGame(played)
    const save = jest.spyOn(repository, "saveActiveGame")
    const { result } = renderHook(() => useLocalGame(repository.loadActiveGame()!, repository))
    expect(result.current.game.firstPlayerOffered).toBeUndefined()
    expect(save).not.toHaveBeenCalled()
  })

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

it("replaces the first player before play and keeps it after play and undo", () => {
  const repository = new LocalGameRepository(new MemoryStorage())
  const initial = game()
  const [ada, grace] = initial.players
  const { result } = renderHook(() => useLocalGame(initial, repository))
  act(() => result.current.setFirstPlayer(ada.id))
  expect(repository.loadActiveGame()?.firstPlayerId).toBe(ada.id)
  act(() => result.current.setFirstPlayer(undefined))
  expect(repository.loadActiveGame()?.firstPlayerId).toBeUndefined()
  act(() => result.current.setFirstPlayer(grace.id))
  expect(result.current.game.firstPlayerId).toBe(grace.id)
  act(() => result.current.changeLife(ada.id, -1))
  act(() => result.current.setFirstPlayer(undefined))
  expect(result.current.game.firstPlayerId).toBe(grace.id)
  act(() => result.current.setFirstPlayer(ada.id))
  expect(repository.loadActiveGame()?.firstPlayerId).toBe(grace.id)
  act(() => result.current.undo())
  act(() => result.current.setFirstPlayer(ada.id))
  expect(result.current.game.firstPlayerId).toBe(grace.id)
  act(() => result.current.finish({ kind: "draw" }))
  expect(repository.loadHistory()[0].firstPlayerId).toBe(grace.id)
  act(() => result.current.setFirstPlayer(ada.id))
  expect(repository.loadActiveGame()).toBeNull()
  act(() => result.current.rematch())
  expect(result.current.game.firstPlayerId).toBeUndefined()
})

it("follows the haptics setting changed while the board is open", async () => {
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValueOnce(false)
  jest.mocked(Haptics.impactAsync).mockClear()
  const repository = new LocalGameRepository(new MemoryStorage())
  const initial = game()
  const [ada] = initial.players
  const { result } = renderHook(() => useLocalGame(initial, repository))
  await act(async () => undefined)

  act(() => result.current.changeLife(ada.id, -1))
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(1)

  repository.saveSettings({ ...repository.loadSettings(), hapticsEnabled: false })
  act(() => result.current.changeLife(ada.id, -1))
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(1)
  resetReducedMotionCacheForTests()
})

it("keeps the board playable and tells the player once when storage refuses the game", () => {
  jest.mocked(reportCrash).mockClear()
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
  const storage = new MemoryStorage()
  const repository = new LocalGameRepository(storage)
  const initial = game()
  const [ada] = initial.players
  const { result } = renderHook(() => useLocalGame(initial, repository))
  const quota = new Error("QuotaExceededError")
  storage.set = () => {
    throw quota
  }

  act(() => result.current.changeLife(ada.id, -1))
  act(() => result.current.changeLife(ada.id, -1))
  act(() => result.current.changeLayout("even-grid"))

  expect(result.current.game.players[0].life).toBe(18)
  expect(result.current.game.layout).toBe("even-grid")
  expect(alert).toHaveBeenCalledTimes(1)
  expect(reportCrash).toHaveBeenCalledTimes(1)
  expect(reportCrash).toHaveBeenCalledWith(quota, "Handled", expect.anything())
  alert.mockRestore()
})
