import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import type { CloudAccess } from "@/features/auth/CloudScreen"
import { ThemeProvider } from "@/theme/context"

import { ManualMatchScreen, type ManualMatchState } from "./ManualMatchScreen"

const mockDeleteMatch = jest.fn(async () => null)

jest.mock("../../convex/_generated/api", () => ({
  api: { matches: { deleteManualMatch: "matches.deleteManualMatch" } },
}))
jest.mock("convex/react", () => ({ useMutation: () => mockDeleteMatch }))

const ready: CloudAccess = { ready: true, loading: false, signedIn: true, request: jest.fn() }

const match: ManualMatchState = {
  status: "ready",
  value: {
    matchId: "match-1" as never,
    publicId: "manual-1",
    bestOf: 3,
    system: undefined,
    format: undefined,
    eventName: "FNM",
    roundNumber: 2,
    finishedAt: Date.UTC(2026, 9, 8),
    seats: [
      {
        seat: 1,
        displayName: "Jane",
        deckName: undefined,
        gamesWon: 2,
        gamesDrawn: 0,
        outcome: "win",
        mine: true,
      },
      {
        seat: 2,
        displayName: "Bob",
        deckName: "Burn",
        gamesWon: 1,
        gamesDrawn: undefined,
        outcome: "loss",
        mine: false,
      },
    ],
  },
}

function renderScreen(access: CloudAccess, state: ManualMatchState = match) {
  const onDeleted = jest.fn()
  render(
    <ThemeProvider initialContext="light">
      <ManualMatchScreen access={access} match={state} onBack={jest.fn()} onDeleted={onDeleted} />
    </ThemeProvider>,
  )
  return { onDeleted }
}

describe("ManualMatchScreen", () => {
  beforeEach(() => mockDeleteMatch.mockClear())

  it("shows the result to a signed-in player without a username and deletes after confirming", async () => {
    const { onDeleted } = renderScreen(ready)

    expect(screen.getByTestId("match-score")).toHaveTextContent("2-1")
    expect(screen.getByLabelText("Loss · Bob")).toBeTruthy()

    fireEvent.press(screen.getByTestId("match-delete"))
    fireEvent.press(screen.getByTestId("match-delete-cancel"))
    expect(mockDeleteMatch).not.toHaveBeenCalled()

    fireEvent.press(screen.getByTestId("match-delete"))
    fireEvent.press(screen.getByTestId("match-delete-confirm-action"))
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(mockDeleteMatch).toHaveBeenCalledWith({ matchId: "match-1" })
  })

  it("asks a signed-out visitor to sign in instead of loading", () => {
    const request = jest.fn()
    renderScreen(
      {
        ready: false,
        loading: false,
        message: "Sign in to continue.",
        actionLabel: "Sign in",
        request,
      },
      { status: "loading" },
    )

    fireEvent.press(screen.getByRole("button", { name: "Sign in" }))
    expect(request).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId("match-delete")).toBeNull()
  })
})
