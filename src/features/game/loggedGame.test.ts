import { buildFinishedLocalGameSnapshot } from "@/features/connected/localGameSnapshot"
import { localSummaryModel, metaLine } from "@/screens/gameSummary"
import { localHistoryEntry } from "@/screens/historyEntries"

import { LocalGameRepository } from "./localPersistence"
import { buildLoggedGame, defaultLoggedGameDraft, type LoggedGameDraft } from "./loggedGame"
import { playSystemShortLabel } from "./playSystems"
import { MemoryStorage } from "../../../test/support/memoryStorage"

const NOW = new Date(2026, 10, 26, 19, 30).getTime()

function draft(overrides: Partial<LoggedGameDraft> = {}): LoggedGameDraft {
  return {
    ...defaultLoggedGameDraft({ system: "mtg", format: "commander" }, new Date(NOW)),
    names: ["Ada", "Grace"],
    winnerSeat: 0,
    ...overrides,
  }
}

function built(overrides: Partial<LoggedGameDraft> = {}, account?: { meSeat?: number }) {
  const result = buildLoggedGame(
    draft(overrides),
    account && { ownerId: "owner", ...account, deckKey: "deck_atraxa", deckName: "Atraxa" },
    NOW,
  )
  if (!result.ok) throw new Error(result.error)
  return result.game
}

describe("buildLoggedGame", () => {
  it("finishes now when logged for today, at noon on an earlier day, started the given minutes earlier", () => {
    expect(built().finishedAt).toBe(NOW)
    const game = built({ date: "2026-11-20", minutes: "45" })
    expect(new Date(game.finishedAt!)).toEqual(new Date(2026, 10, 20, 12))
    expect(game.finishedAt! - game.createdAt).toBe(45 * 60_000)
    expect(game).toMatchObject({ status: "finished", logged: true, events: [], startingLife: 40 })
    expect(game.result).toEqual({ kind: "win", winnerPlayerIds: [game.players[0].id] })
  })

  it("starts the draft on the system's default format when none is saved", () => {
    expect(defaultLoggedGameDraft({ system: "mtg" }).format).toBe("standard")
  })

  it("rejects a future day, a missing winner, and a winner seat that was removed", () => {
    const error = (overrides: Partial<LoggedGameDraft>) => {
      const result = buildLoggedGame(draft(overrides), undefined, NOW)
      return result.ok ? undefined : result.error
    }
    expect(error({ date: "2026-11-27" })).toBeDefined()
    expect(error({ winnerSeat: undefined })).toBeDefined()
    expect(error({ winnerSeat: 2 })).toBeDefined()
    expect(error({ minutes: "0" })).toBeDefined()
    expect(error({ winnerSeat: "draw" })).toBeUndefined()
  })

  it("is archived as a pending publish carrying the logged flag and the account's deck", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    repository.archiveGame(built({}, { meSeat: 0 }), "logged", "owner")

    const [summary] = repository.pendingPublishes("owner")
    expect(summary).toMatchObject({ logged: true, eventCount: 0, publish: "pending" })
    expect(localHistoryEntry(summary)).toMatchObject({ logged: true, outcome: "win" })
    const snapshot = buildFinishedLocalGameSnapshot(summary)
    expect(snapshot).toMatchObject({ logged: true, startedAt: summary.finishedAt })
    expect(snapshot.players[0]).toMatchObject({ me: true, deckKey: "deck_atraxa" })
  })

  it("shows no duration or life changes when none were logged", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const game = built()
    repository.archiveGame(game, "logged")
    const detail = repository.loadHistoryDetail(game.id)!.game
    expect(detail.logged).toBe(true)
    expect(localSummaryModel(detail).startedAt).toBeUndefined()
    expect(metaLine(localSummaryModel(detail))).toBe(
      metaLine({ ...localSummaryModel(detail), changeCount: 99 }),
    )
    expect(localSummaryModel(built({ minutes: "30" })).startedAt).toBeDefined()
    expect(localSummaryModel(built({ system: undefined, format: undefined })).format).toBe(
      playSystemShortLabel(undefined),
    )
  })
})
