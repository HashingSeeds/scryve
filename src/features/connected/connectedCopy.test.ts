import {
  lobbyDetail,
  lobbyExitCopy,
  relativeTime,
  resumeDetail,
  resumeTitle,
  seatDetail,
  seatSummary,
} from "./connectedCopy"
import { toConnectedProjection } from "./model"

const NOW = 1_800_000_000_000

describe("connected copy", () => {
  it("keeps recent activity readable without dumping a locale timestamp", () => {
    expect(relativeTime(NOW - 30_000, NOW)).toBe("just now")
    expect(relativeTime(NOW - 5 * 60_000, NOW)).toBe("5m ago")
    expect(relativeTime(NOW - 3 * 3_600_000, NOW)).toBe("3h ago")
    expect(relativeTime(NOW - 2 * 86_400_000, NOW)).toBe("2d ago")
    expect(relativeTime(NOW + 5_000, NOW)).toBe("just now")
  })

  it("falls back to a calendar date once a game is more than a week old", () => {
    expect(relativeTime(NOW - 30 * 86_400_000, NOW)).not.toMatch(/ago/)
  })

  it("describes a resumable game by role and status", () => {
    const lobby = {
      publicId: "abc",
      status: "lobby" as const,
      isHost: true,
      playerCount: 2,
      ruleset: "standard",
      startingLife: 20,
      updatedAt: NOW - 60_000,
    }

    expect(resumeTitle(lobby)).toBe("Hosting · waiting to start")
    expect(resumeTitle({ ...lobby, status: "active", isHost: false })).toBe("Playing · in progress")
    expect(resumeDetail(lobby, NOW)).toBe("2 seats · Standard · 20 life · 1m ago")
  })

  it("uses ruleset when an older connected projection has an empty format", () => {
    expect(
      toConnectedProjection({
        schemaVersion: 1,
        publicId: "legacy-game",
        status: "lobby",
        playerCount: 2,
        startingLife: 20,
        format: "",
        ruleset: "commander",
        isHost: true,
        eventSequence: 0,
        serverUpdatedAt: NOW,
        recentOperationIds: [],
        players: [],
      })?.format,
    ).toBe("commander")
    expect(
      resumeDetail(
        {
          publicId: "legacy-game",
          status: "lobby",
          isHost: true,
          playerCount: 2,
          format: "",
          ruleset: "standard",
          startingLife: 20,
          updatedAt: NOW - 60_000,
        },
        NOW,
      ),
    ).toBe("2 seats · Standard · 20 life · 1m ago")
    expect(lobbyDetail(20, "commander", "mtg", "")).toBe("20 life · Commander")
  })

  it("says how many players a lobby is still waiting on", () => {
    expect(seatSummary(1, 2)).toBe("Waiting for 1 more player")
    expect(seatSummary(1, 4)).toBe("Waiting for 3 more players")
    expect(seatSummary(2, 2)).toBe("All seats claimed")
  })

  it("marks a seat without a deck instead of leaving the line blank", () => {
    expect(seatDetail({ controlledByMe: true, seat: 1 })).toBe("Your seat · No deck selected")
    expect(
      seatDetail({ controlledByMe: false, seat: 2, deckName: "Atraxa", versionName: "Current" }),
    ).toBe("Seat 2 · Atraxa · Current")
  })

  it("warns that abandoning is final and leaving is not", () => {
    expect(lobbyExitCopy("abandon").message).toMatch(/cannot be undone/i)
    expect(lobbyExitCopy("leave").message).toMatch(/stay unchanged/i)
  })
})
