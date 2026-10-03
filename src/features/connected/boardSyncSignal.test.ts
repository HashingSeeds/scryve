import { act, renderHook } from "@testing-library/react-native"

import { formatElapsed } from "@/utils/useElapsedSince"

import {
  type BoardSyncInput,
  type BoardSyncMemory,
  boardSyncMenuSignal,
  CAUGHT_UP_FLASH_MS,
  INITIAL_BOARD_SYNC_MEMORY,
  nextBoardSyncSignal,
  OFFLINE_AFTER_MS,
  SLOW_AFTER_MS,
  useBoardSyncSignal,
} from "./boardSyncSignal"

const ONLINE: BoardSyncInput = {
  connectionStatus: "connected",
  unsent: 0,
  rejected: 0,
  needsAttention: false,
}

function play(steps: readonly [number, Partial<BoardSyncInput>][]) {
  let memory: BoardSyncMemory = INITIAL_BOARD_SYNC_MEMORY
  return steps.map(([now, input]) => {
    const result = nextBoardSyncSignal({ ...ONLINE, ...input }, memory, now)
    memory = result.memory
    return result
  })
}

describe("board sync signal", () => {
  it("stays live through a short blip and a quick confirmation", () => {
    const results = play([
      [0, { connectionStatus: "syncing", unsent: 1, oldestUnsentAt: 0 }],
      [500, { connectionStatus: "offline", unsent: 1, oldestUnsentAt: 0 }],
      [1_900, { connectionStatus: "offline", unsent: 1, oldestUnsentAt: 0 }],
      [2_100, { connectionStatus: "syncing", unsent: 1, oldestUnsentAt: 0 }],
      [2_400, {}],
    ])
    expect(results.map((result) => result.signal.kind)).toEqual([
      "live",
      "live",
      "live",
      "live",
      "live",
    ])
  })

  it("shows offline after the grace period and wakes exactly when it ends", () => {
    const [first, second] = play([
      [1_000, { connectionStatus: "offline", unsent: 2, oldestUnsentAt: 900 }],
      [1_000 + OFFLINE_AFTER_MS, { connectionStatus: "offline", unsent: 2, oldestUnsentAt: 900 }],
    ])
    expect(first.wakeAt).toBe(1_000 + OFFLINE_AFTER_MS)
    expect(second.signal).toEqual({ kind: "offline", unsent: 2, since: 1_000 })
  })

  it("calls an unconfirmed change slow once it is older than the threshold while online", () => {
    const [before, after] = play([
      [SLOW_AFTER_MS - 1, { connectionStatus: "syncing", unsent: 3, oldestUnsentAt: 0 }],
      [SLOW_AFTER_MS, { connectionStatus: "syncing", unsent: 3, oldestUnsentAt: 0 }],
    ])
    expect(before.signal.kind).toBe("live")
    expect(before.wakeAt).toBe(SLOW_AFTER_MS)
    expect(after.signal).toEqual({ kind: "slow", unsent: 3 })
  })

  it("catches up after a visible offline period, flashes briefly, then goes live", () => {
    const offline = { connectionStatus: "offline", unsent: 2, oldestUnsentAt: 0 } as const
    const results = play([
      [0, offline],
      [OFFLINE_AFTER_MS, offline],
      [10_000, { connectionStatus: "syncing", unsent: 2, oldestUnsentAt: 0 }],
      [10_500, { connectionStatus: "syncing", unsent: 1, oldestUnsentAt: 0 }],
      [11_000, {}],
      [11_000 + CAUGHT_UP_FLASH_MS, {}],
    ])
    expect(results.map((result) => result.signal.kind)).toEqual([
      "live",
      "offline",
      "catchingUp",
      "catchingUp",
      "caughtUp",
      "live",
    ])
  })

  it("puts rejected changes ahead of offline, slow, and catching up", () => {
    const offline = { connectionStatus: "offline", unsent: 1, oldestUnsentAt: 0 } as const
    const results = play([
      [0, offline],
      [OFFLINE_AFTER_MS, { ...offline, rejected: 1 }],
      [10_000, { connectionStatus: "syncing", unsent: 1, oldestUnsentAt: 0, rejected: 1 }],
      [10_500, { connectionStatus: "syncing", unsent: 1, oldestUnsentAt: 0, needsAttention: true }],
    ])
    expect(results.slice(1).map((result) => result.signal.kind)).toEqual([
      "attention",
      "attention",
      "attention",
    ])
  })

  it("puts attention ahead of a slow connection", () => {
    const [result] = play([
      [SLOW_AFTER_MS, { connectionStatus: "syncing", unsent: 2, oldestUnsentAt: 0, rejected: 1 }],
    ])
    expect(result.signal).toEqual({ kind: "attention", rejected: 1 })
  })

  it("keeps offline time while attention outranks it", () => {
    const offline = { connectionStatus: "offline", unsent: 1, rejected: 1 } as const
    const [, visible] = play([
      [1_000, offline],
      [1_000 + OFFLINE_AFTER_MS, offline],
    ])
    expect(visible.signal.kind).toBe("attention")
    expect(visible.offlineSince).toBe(1_000)
  })

  it("never calls a disconnected board slow or back online during the grace period", () => {
    const results = play([
      [0, { connectionStatus: "syncing", unsent: 1, oldestUnsentAt: -10_000 }],
      [100, { connectionStatus: "offline", unsent: 1, oldestUnsentAt: -10_000 }],
    ])
    expect(results.map((result) => result.signal.kind)).toEqual(["slow", "live"])
  })

  it("badges the menu with the unsent count, or ! when something needs attention", () => {
    expect(boardSyncMenuSignal({ kind: "offline", unsent: 3, since: 0 })?.badge).toBe("3")
    expect(boardSyncMenuSignal({ kind: "offline", unsent: 0, since: 0 })?.badge).toBeUndefined()
    expect(boardSyncMenuSignal({ kind: "attention", rejected: 1 })?.badge).toBe("!")
    expect(boardSyncMenuSignal({ kind: "live" })).toBeUndefined()
  })

  it("formats elapsed time as minutes and seconds", () => {
    expect(formatElapsed(42_900)).toBe("0:42")
    expect(formatElapsed(605_000)).toBe("10:05")
  })
})

describe("useBoardSyncSignal", () => {
  it("re-arms its wake timer when a timer fires early", () => {
    jest.useFakeTimers()
    try {
      const start = Date.now()
      const { result } = renderHook(() =>
        useBoardSyncSignal({ ...ONLINE, connectionStatus: "offline", unsent: 1 }),
      )
      jest.setSystemTime(start - 5)
      act(() => jest.advanceTimersByTime(OFFLINE_AFTER_MS))
      expect(result.current.signal.kind).toBe("live")
      act(() => jest.advanceTimersByTime(10))
      expect(result.current.signal.kind).toBe("offline")
    } finally {
      jest.useRealTimers()
    }
  })
})
