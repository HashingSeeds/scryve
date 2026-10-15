import { applyGameCommand, asDeviceId, createLocalGame, defaultCommandContext } from "./domain"
import {
  LOCAL_KEYS,
  LocalGameRepository,
  MAX_ACTIVE_EVENTS,
  type StringStorage,
} from "./localPersistence"
import type { GameEvent, LocalGame } from "./types"

const CHUNK_SIZE = 100
const MIN_KEPT_EVENTS = MAX_ACTIVE_EVENTS - CHUNK_SIZE + 1
const CHUNK_KEY_PREFIX = LOCAL_KEYS.activeEvents(0).slice(0, -1)
const context = defaultCommandContext(asDeviceId("device"))

class ProcessKilled extends Error {}

class MemoryStorage implements StringStorage {
  values = new Map<string, string>()
  mutations: { op: "set" | "delete"; key: string }[] = []
  killAfter = Number.POSITIVE_INFINITY
  getString(key: string) {
    return this.values.get(key)
  }
  set(key: string, value: string) {
    this.mutate("set", key)
    this.values.set(key, value)
  }
  delete(key: string) {
    this.mutate("delete", key)
    this.values.delete(key)
  }
  clone() {
    const copy = new MemoryStorage()
    copy.values = new Map(this.values)
    return copy
  }
  private mutate(op: "set" | "delete", key: string) {
    if (this.mutations.length >= this.killAfter) throw new ProcessKilled()
    this.mutations.push({ op, key })
  }
}

/** why: storage keeps at most the last 500 events, so a board carries its whole history to check what loads back. */
interface Board {
  game: LocalGame
  history: readonly GameEvent[]
}

function newBoard(now: number): Board {
  const game = createLocalGame({
    now,
    startingLife: 20,
    players: [
      { name: "Ada", color: "#000", shape: "hexagon" },
      { name: "Grace", color: "#111", shape: "circle" },
    ],
  })
  return { game, history: [] }
}

function tap(board: Board, seat = 0): Board {
  const delta = board.history.length % 2 === 0 ? -1 : 1
  const game = applyGameCommand(
    board.game,
    { type: "life.change", playerId: board.game.players[seat].id, delta },
    context,
  )
  const event = game.events.at(-1)
  return event ? { game, history: [...board.history, event] } : board
}

function tapTimes(board: Board, count: number): Board {
  let next = board
  for (let index = 0; index < count; index += 1) next = tap(next, index % 2)
  return next
}

/** why: a failure names its seed and step, and the same seed replays the same walk. */
function seededRandom(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function storedChunkCount(storage: MemoryStorage) {
  const raw: unknown = JSON.parse(storage.getString(LOCAL_KEYS.active) ?? "null")
  return typeof raw === "object" && raw !== null && "eventChunkCount" in raw
    ? Number(raw.eventChunkCount)
    : 0
}

function chunkKeyIndexes(storage: MemoryStorage) {
  return [...storage.values.keys()]
    .filter((key) => key.startsWith(CHUNK_KEY_PREFIX))
    .map((key) => Number(key.slice(CHUNK_KEY_PREFIX.length)))
}

function expectStored(storage: MemoryStorage, saved: Board) {
  const loaded = new LocalGameRepository(storage).loadActiveGame()
  if (!loaded) throw new Error("the saved game did not load")
  const { events, ...rest } = loaded
  const { events: _savedEvents, ...savedRest } = saved.game
  expect(rest).toEqual(savedRest)
  // why: toEqual on hundreds of events every step makes the walk too slow to run with the suite.
  expect(JSON.stringify(events)).toBe(
    JSON.stringify(saved.history.slice(saved.history.length - events.length)),
  )
  expect(events.length).toBeLessThanOrEqual(MAX_ACTIVE_EVENTS)
  expect(events.length).toBeGreaterThanOrEqual(Math.min(saved.game.events.length, MIN_KEPT_EVENTS))
  const chunkCount = storedChunkCount(storage)
  expect(chunkKeyIndexes(storage).sort((a, b) => a - b)).toEqual([...Array(chunkCount).keys()])
}

type Step = "tap" | "burst" | "touch" | "reload" | "stale" | "newGame" | "clear"

const STEP_WEIGHTS: [Step, number][] = [
  ["tap", 440],
  ["burst", 80],
  ["touch", 64],
  ["reload", 80],
  ["stale", 8],
  ["newGame", 1],
  ["clear", 1],
]

function pickStep(random: () => number): Step {
  let roll = random() * STEP_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0)
  for (const [step, weight] of STEP_WEIGHTS) {
    roll -= weight
    if (roll < 0) return step
  }
  return "tap"
}

describe("active game persistence under random play", () => {
  it.each([1, 2, 3, 4])(
    "keeps the last save loadable through 2,000 random steps (seed %i)",
    (seed) => {
      const random = seededRandom(seed)
      const storage = new MemoryStorage()
      const repository = new LocalGameRepository(storage)
      let board = newBoard(seed)
      let snapshots: Board[] = []
      const reached = { pastCap: 0, capRewrite: 0, reopenedAppend: 0, staleRewrite: 0 }
      const save = (next: Board) => {
        storage.mutations = []
        repository.saveActiveGame(next.game)
        board = next
      }
      save(tap(board))

      for (let step = 0; step < 2000; step += 1) {
        const kind = pickStep(random)
        try {
          if (kind === "tap") {
            if (board.game.events.length < board.history.length) reached.reopenedAppend += 1
            save(tap(board, step % 2))
            // why: a tap from the board that wrote last rewrites one chunk, except the one tap in 100 past the cap that drops the oldest chunk.
            const sets = storage.mutations.filter(({ op }) => op === "set").length
            expect(storage.mutations.some(({ op }) => op === "delete")).toBe(false)
            if (sets > 2) {
              expect(board.game.events.length).toBeGreaterThan(MAX_ACTIVE_EVENTS)
              expect(new LocalGameRepository(storage).loadActiveGame()?.events.length).toBe(
                MIN_KEPT_EVENTS,
              )
              reached.capRewrite += 1
            }
          } else if (kind === "burst") {
            save(tapTimes(board, 2 + Math.floor(random() * 40)))
          } else if (kind === "touch") {
            save({ ...board, game: { ...board.game, updatedAt: board.game.updatedAt + 1 } })
          } else if (kind === "reload") {
            const game = repository.loadActiveGame()
            if (!game) throw new Error("reload found no game")
            board = { game, history: board.history }
            continue
          } else if (kind === "stale") {
            const stale = snapshots[Math.floor(random() * snapshots.length)]
            if (!stale) continue
            save(tap(stale))
            if (storage.mutations.length > 2) reached.staleRewrite += 1
          } else if (kind === "newGame") {
            snapshots = []
            save(tap(newBoard(seed * 10_000 + step)))
          } else {
            repository.clearActiveGame()
            expect(repository.loadActiveGame()).toBeNull()
            expect(chunkKeyIndexes(storage)).toEqual([])
            snapshots = []
            save(tap(newBoard(seed * 10_000 + step)))
          }
          expectStored(storage, board)
          if (board.history.length > MAX_ACTIVE_EVENTS) reached.pastCap += 1
          if (step % 25 === 0) snapshots = [...snapshots.slice(-4), board]
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          throw new Error(`seed ${seed} step ${step} (${kind}): ${reason}`, { cause: error })
        }
      }
      // why: a walk that never reaches these paths would pass while testing nothing.
      expect(Object.values(reached).every((count) => count > 0)).toBe(true)
    },
  )
})

describe("active game persistence when the app is killed mid-save", () => {
  function storedAfter(setup: (storage: MemoryStorage) => Board) {
    const storage = new MemoryStorage()
    const board = setup(storage)
    storage.mutations = []
    return { storage, board }
  }

  function savedGame(events: number) {
    return (storage: MemoryStorage) => {
      const board = tapTimes(newBoard(1), events)
      new LocalGameRepository(storage).saveActiveGame(board.game)
      return board
    }
  }

  function reopenedGame(events: number) {
    return (storage: MemoryStorage) => {
      const repository = new LocalGameRepository(storage)
      let board = newBoard(1)
      for (let index = 0; index < events; index += 1) {
        board = tap(board, index % 2)
        repository.saveActiveGame(board.game)
      }
      const game = repository.loadActiveGame()
      if (!game) throw new Error("setup game did not load")
      return { game, history: board.history }
    }
  }

  function schemaOneGame(events: number) {
    return (storage: MemoryStorage) => {
      const board = tapTimes(newBoard(1), events)
      const kept = board.game.events.slice(-MAX_ACTIVE_EVENTS)
      const { events: _events, ...rest } = board.game
      const chunkCount = Math.ceil(kept.length / CHUNK_SIZE)
      storage.set(
        LOCAL_KEYS.active,
        JSON.stringify({ schemaVersion: 1, game: rest, eventChunkCount: chunkCount }),
      )
      for (let index = 0; index < chunkCount; index += 1) {
        storage.set(
          LOCAL_KEYS.activeEvents(index),
          JSON.stringify(kept.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)),
        )
      }
      return { game: { ...board.game, events: kept }, history: board.history }
    }
  }

  it.each([
    ["a new game's first tap", savedGame(0)],
    ["a tap filling chunk 0", savedGame(99)],
    ["a tap opening chunk 1", savedGame(100)],
    ["the tap that reaches the cap", savedGame(499)],
    ["the first tap past the cap", savedGame(500)],
    ["a tap long past the cap", savedGame(1234)],
    ["a tap on a game reopened past the cap", reopenedGame(777)],
  ])("loads the game from before or after %s, wherever the kill lands", (_name, setup) => {
    const { storage, board } = storedAfter(setup)
    const before = new LocalGameRepository(storage).loadActiveGame()
    const next = tap(board)

    const completed = storage.clone()
    new LocalGameRepository(completed).saveActiveGame(next.game)
    const after = new LocalGameRepository(completed).loadActiveGame()
    const commit = completed.mutations.findIndex(({ key }) => key === LOCAL_KEYS.active)

    for (let kill = 0; kill < completed.mutations.length; kill += 1) {
      const killed = storage.clone()
      killed.killAfter = kill
      expect(() => new LocalGameRepository(killed).saveActiveGame(next.game)).toThrow(ProcessKilled)
      const reopened = new LocalGameRepository(killed).loadActiveGame()
      if (kill > commit) expect({ kill, reopened }).toEqual({ kill, reopened: after })
      else
        expect({ kill, reopened: withoutOldestChunk(reopened, before) }).toEqual({
          kill,
          reopened: before,
        })
    }
  })

  it("keeps an older build's game at the cap consistent apart from history, wherever the kill lands", () => {
    const { storage, board } = storedAfter(schemaOneGame(500))
    const before = new LocalGameRepository(storage).loadActiveGame()
    const next = tap(board)
    const tapped = next.game.events.at(-1)

    const completed = storage.clone()
    new LocalGameRepository(completed).saveActiveGame(next.game)
    for (let kill = 0; kill < completed.mutations.length; kill += 1) {
      const killed = storage.clone()
      killed.killAfter = kill
      expect(() => new LocalGameRepository(killed).saveActiveGame(next.game)).toThrow(ProcessKilled)
      const reopened = new LocalGameRepository(killed).loadActiveGame()
      // why: an older build's save marks no committed event, so the first rewrite after the update can keep the new tap's event without its life change.
      const history = reopened?.events.filter(
        (event) => event !== tapped && event.operationId !== tapped?.operationId,
      )
      expect({ kill, reopened: reopened && { ...reopened, events: history } }).toEqual({
        kill,
        reopened: before && {
          ...before,
          events: before.events.slice(before.events.length - (history?.length ?? 0)),
        },
      })
      expect(history?.length).toBeGreaterThanOrEqual(MAX_ACTIVE_EVENTS - CHUNK_SIZE)
    }
  })
})

/** why: a save killed partway through dropping the oldest chunk may reload without that chunk's history; the life totals and every newer event must still match. */
function withoutOldestChunk(reopened: LocalGame | null, before: LocalGame | null) {
  if (!reopened || !before || reopened.events.length >= before.events.length) return reopened
  expect(reopened.events.length).toBeGreaterThanOrEqual(before.events.length - CHUNK_SIZE)
  expect(reopened.events).toEqual(
    before.events.slice(before.events.length - reopened.events.length),
  )
  return { ...reopened, events: before.events }
}

/** why: crash recovery can fall back to JS built into the binary, which only knows schema 1. This is that build's load and save. */
const olderBuild = {
  loadEvents(storage: StringStorage): unknown[] | null {
    const raw: unknown = JSON.parse(storage.getString(LOCAL_KEYS.active) ?? "null")
    if (typeof raw !== "object" || raw === null) return null
    if (!("schemaVersion" in raw) || raw.schemaVersion !== 1) return null
    const count = "eventChunkCount" in raw ? Number(raw.eventChunkCount) : Number.NaN
    if (!Number.isInteger(count) || count < 0 || count > MAX_ACTIVE_EVENTS / CHUNK_SIZE) return null
    const events: unknown[] = []
    for (let index = 0; index < count; index += 1) {
      const chunk: unknown = JSON.parse(storage.getString(LOCAL_KEYS.activeEvents(index)) ?? "null")
      if (!Array.isArray(chunk)) return null
      events.push(...chunk)
    }
    return events
  },
  save(storage: StringStorage, game: LocalGame) {
    const previous: unknown = JSON.parse(storage.getString(LOCAL_KEYS.active) ?? "null")
    const previousChunkCount =
      typeof previous === "object" && previous !== null && "eventChunkCount" in previous
        ? Number(previous.eventChunkCount)
        : 0
    const events = game.events.slice(-MAX_ACTIVE_EVENTS)
    const chunkCount = Math.ceil(events.length / CHUNK_SIZE)
    const { events: _events, ...rest } = game
    storage.set(
      LOCAL_KEYS.active,
      JSON.stringify({ schemaVersion: 1, game: rest, eventChunkCount: chunkCount }),
    )
    for (let index = 0; index < chunkCount; index += 1) {
      storage.set(
        LOCAL_KEYS.activeEvents(index),
        JSON.stringify(events.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)),
      )
    }
    for (let index = chunkCount; index < previousChunkCount; index += 1) {
      storage.delete(LOCAL_KEYS.activeEvents(index))
    }
  },
}

describe("an older build opening this layout", () => {
  function playedGame(storage: StringStorage, taps: number) {
    const repository = new LocalGameRepository(storage)
    let board = newBoard(1)
    for (let index = 0; index < taps; index += 1) {
      board = tap(board, index % 2)
      repository.saveActiveGame(board.game)
    }
    return board
  }

  it.each([1, 150, 500, 501, 1234])("reads a %i-event game the way this build does", (taps) => {
    const storage = new MemoryStorage()
    playedGame(storage, taps)
    const loaded = new LocalGameRepository(storage).loadActiveGame()
    expect(olderBuild.loadEvents(storage)).toEqual(JSON.parse(JSON.stringify(loaded?.events)))
  })

  it("leaves no chunks behind when it starts a new game over a long one", () => {
    const storage = new MemoryStorage()
    playedGame(storage, 1234)
    const replacement = tap(newBoard(2))
    olderBuild.save(storage, replacement.game)

    expect(olderBuild.loadEvents(storage)).toEqual(replacement.game.events)
    expect(new LocalGameRepository(storage).loadActiveGame()).toEqual(replacement.game)
    expect(chunkKeyIndexes(storage)).toEqual([0])
  })
})
