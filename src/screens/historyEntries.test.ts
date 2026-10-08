import { asPlayerId } from "@/features/game/domain"
import type { LocalGameSummary } from "@/features/game/types"

import { connectedHistoryEntry, localHistoryEntry } from "./historyEntries"

const ada = asPlayerId("p1")
const grace = asPlayerId("p2")

function game(overrides: Partial<LocalGameSummary> = {}): LocalGameSummary {
  return {
    schemaVersion: 1,
    id: "game_1",
    status: "finished",
    system: "mtg",
    format: "commander",
    startingLife: 40,
    eventCount: 4,
    createdAt: 1,
    finishedAt: 2,
    players: [
      { id: ada, name: "Ada", color: "#7C3AED", life: 3, seat: 0 },
      { id: grace, name: "Grace", color: "#2563EB", life: 0, seat: 1 },
    ],
    result: { kind: "win", winnerPlayerIds: [ada] },
    ...overrides,
  } as LocalGameSummary
}

describe("localHistoryEntry", () => {
  it("reads the outcome from the account's seat and labels its deck", () => {
    const loss = localHistoryEntry(
      game({
        account: { ownerId: "owner", mePlayerId: grace, deckVersionId: "v1", deckName: "Atraxa" },
      }),
    )
    expect(loss.outcome).toBe("loss")
    expect(loss.players.map((player) => player.deckName)).toEqual([undefined, "Atraxa"])
    expect(
      localHistoryEntry(game({ account: { ownerId: "owner", mePlayerId: ada } })).outcome,
    ).toBe("win")
  })

  it("keeps the table-level outcome for signed-out games only", () => {
    expect(localHistoryEntry(game()).outcome).toBe("win")
    expect(localHistoryEntry(game({ result: undefined })).outcome).toBe("unrecorded")
    const owned = localHistoryEntry(game({ account: { ownerId: "owner" } }))
    expect(owned.outcome).toBe("unrecorded")
    expect(owned.winnerNames).toEqual(["Ada"])
    expect(
      localHistoryEntry(game({ account: { ownerId: "owner" }, result: { kind: "draw" } })).outcome,
    ).toBe("unrecorded")
  })
})

describe("connectedHistoryEntry", () => {
  it("keys a published local game like the device's copy so History shows it once", () => {
    const entry = connectedHistoryEntry({
      publicId: "game_1",
      source: "local",
      eventCount: 4,
      finishedAt: 2,
      players: [],
    })
    expect(entry.key).toBe(localHistoryEntry(game()).key)
    expect(entry.source).toBe("local")
    expect(
      connectedHistoryEntry({ publicId: "c1", eventCount: 1, finishedAt: 2, players: [] }).key,
    ).toBe("connected:c1")
  })
})
