import {
  buildManualMatchArgs,
  defaultManualMatchDraft,
  emptyOpponent,
  parseIsoDate,
  withOpponentAdded,
  withSeatOutcome,
} from "./manualMatchForm"
import type { Id } from "../../../convex/_generated/dataModel"

const ids = {
  publicId: "match_0123456789abcdef",
  deckVersionId: "version-1" as Id<"deckVersions">,
}
const today = new Date(2026, 9, 8)

function draft() {
  return {
    ...defaultManualMatchDraft(today),
    opponents: [{ name: " Bob ", deckName: "Burn", outcome: "loss" as const }],
  }
}

describe("buildManualMatchArgs", () => {
  it("maps a two-player W-L-D score onto both seats", () => {
    const built = buildManualMatchArgs(
      { ...draft(), score: { wins: "2", losses: "1", draws: "" }, eventName: "FNM", round: "3" },
      ids,
      today.getTime(),
    )
    expect(built).toEqual({
      ok: true,
      args: {
        publicId: ids.publicId,
        bestOf: 3,
        finishedAt: today.getTime(),
        eventName: "FNM",
        roundNumber: 3,
        me: {
          seat: 1,
          deckVersionId: ids.deckVersionId,
          outcome: "win",
          gamesWon: 2,
          gamesDrawn: 0,
        },
        opponents: [
          {
            seat: 2,
            displayName: "Bob",
            deckName: "Burn",
            outcome: "loss",
            gamesWon: 1,
            gamesDrawn: 0,
          },
        ],
      },
    })
  })

  it("omits the score when every field is blank", () => {
    const built = buildManualMatchArgs({ ...draft(), outcome: "draw" }, ids, today.getTime())
    expect(built.ok && built.args.me).toEqual({
      seat: 1,
      deckVersionId: ids.deckVersionId,
      outcome: "draw",
    })
    expect(built.ok && built.args.opponents[0].outcome).toBe("draw")
  })

  it("leaves the deck off when none is attached", () => {
    const built = buildManualMatchArgs(draft(), { publicId: ids.publicId }, today.getTime())
    expect(built.ok && built.args.me).toEqual({ seat: 1, outcome: "win" })
  })

  it("keeps per-seat outcomes for pods with a single winner", () => {
    const pod = withSeatOutcome(
      { ...draft(), opponents: [draft().opponents[0], { ...emptyOpponent(), name: "Cat" }] },
      1,
      "win",
    )
    expect(pod.outcome).toBe("loss")
    const built = buildManualMatchArgs(
      { ...withSeatOutcome(pod, "me", "draw"), score: { wins: "2", losses: "0", draws: "0" } },
      ids,
      today.getTime(),
    )
    expect(built.ok && built.args.me).toEqual({
      seat: 1,
      deckVersionId: ids.deckVersionId,
      outcome: "draw",
    })
    expect(built.ok && built.args.opponents.map((seat) => seat.outcome)).toEqual(["loss", "win"])
  })

  it.each([
    {
      name: "a blank opponent name",
      patch: { opponents: [emptyOpponent()] },
      error: "needs a name",
    },
    { name: "a bad date", patch: { date: "2026-13-40" }, error: "YYYY-MM-DD" },
    { name: "a future date", patch: { date: "2026-10-20" }, error: "future" },
    {
      name: "too many wins",
      patch: { score: { wins: "3", losses: "0", draws: "" } },
      error: "0–2",
    },
    { name: "a round above the cap", patch: { round: "100" }, error: "Round must be" },
    {
      name: "a partial score",
      patch: { score: { wins: "", losses: "", draws: "1" } },
      error: "both wins and losses",
    },
    {
      name: "a score that contradicts the result",
      patch: { score: { wins: "0", losses: "2", draws: "" } },
      error: "0-2 score is a loss",
    },
    {
      name: "a pod with no winner and no draw",
      patch: {
        outcome: "loss" as const,
        opponents: [draft().opponents[0], { ...emptyOpponent(), name: "Cat" }],
      },
      error: "Pick a winner",
    },
  ])("rejects $name", ({ patch, error }) => {
    const built = buildManualMatchArgs({ ...draft(), ...patch }, ids, today.getTime())
    expect(built).toEqual({ ok: false, error: expect.stringContaining(error) })
  })
})

describe("withOpponentAdded", () => {
  it("seeds the first opponent from the derived two-player result", () => {
    const pod = withOpponentAdded({ ...draft(), outcome: "loss" })
    expect(pod.opponents.map((seat) => seat.outcome)).toEqual(["win", "loss"])
    expect(withOpponentAdded(pod).opponents.map((seat) => seat.outcome)).toEqual([
      "win",
      "loss",
      "loss",
    ])
  })
})

describe("parseIsoDate", () => {
  it("reads a local calendar date", () => {
    expect(parseIsoDate("2026-10-08")).toBe(today.getTime())
    expect(parseIsoDate("2026-02-30")).toBeUndefined()
  })
})
