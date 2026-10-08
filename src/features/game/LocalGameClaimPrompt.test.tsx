import { fireEvent, render, screen } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { applyGameCommand, asDeviceId, createLocalGame, defaultCommandContext } from "./domain"
import { LocalGameClaimPrompt } from "./LocalGameClaimPrompt"
import { LocalGameRepository, type StringStorage } from "./localPersistence"

let mockAuth: { configured: boolean; isLoaded: boolean; isSignedIn: boolean; userId?: string }
let mockAuthVisible = false
jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({ ...mockAuth, authVisible: mockAuthVisible }),
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

function finishedGame(now: number, names = ["Ada", "Grace"]) {
  const game = createLocalGame({
    now,
    startingLife: 20,
    players: names.map((name, index) => ({ name, color: index ? "#111111" : "#000000" })),
  })
  return applyGameCommand(
    game,
    { type: "game.finish", result: { kind: "win", winnerPlayerIds: [game.players[0].id] } },
    { ...defaultCommandContext(asDeviceId("device_test")), now: () => now + 1 },
  )
}

function setup(repository: LocalGameRepository) {
  return render(
    <ThemeProvider initialContext="dark">
      <LocalGameClaimPrompt repository={repository} />
    </ThemeProvider>,
  )
}

describe("LocalGameClaimPrompt", () => {
  beforeEach(() => {
    mockAuth = { configured: true, isLoaded: true, isSignedIn: true, userId: "owner-a" }
    mockAuthVisible = false
  })

  it("shows only while signed in with undecided signed-out games and the sign-in sheet closed", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    repository.archiveGame(finishedGame(1), "game_menu", "owner-a")
    expect(setup(repository).queryByTestId("claim-games-dialog")).toBeNull()

    repository.archiveGame(finishedGame(10))
    expect(setup(repository).getByTestId("claim-games-dialog")).toBeTruthy()

    mockAuthVisible = true
    expect(setup(repository).queryByTestId("claim-games-dialog")).toBeNull()
    mockAuthVisible = false
    mockAuth = { configured: true, isLoaded: true, isSignedIn: false }
    expect(setup(repository).queryByTestId("claim-games-dialog")).toBeNull()

    mockAuth = { configured: true, isLoaded: true, isSignedIn: true, userId: "owner-a" }
    repository.resolveClaims("owner-a", [{ id: repository.loadHistory()[0].id, claim: false }])
    expect(setup(repository).queryByTestId("claim-games-dialog")).toBeNull()
    mockAuth = { ...mockAuth, userId: "owner-b" }
    expect(setup(repository).getByTestId("claim-games-dialog")).toBeTruthy()
  })

  it("claims the selected games with their me seat and skips the deselected one", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const older = finishedGame(1)
    const newer = finishedGame(10, ["Katherine", "Grace"])
    repository.archiveGame(older)
    repository.archiveGame(newer)
    setup(repository)

    expect(screen.getByText("Add 2 games")).toBeTruthy()
    fireEvent.press(screen.getByTestId(`claim-game-${older.id}`))
    expect(screen.getByText("Add 1 game")).toBeTruthy()
    expect(screen.queryByTestId(`claim-me-seat-${older.id}`)).toBeNull()
    fireEvent.press(screen.getByTestId(`claim-me-seat-${newer.id}`))
    fireEvent.press(screen.getByTestId(`claim-me-seat-${newer.id}-option-${newer.players[1].id}`))
    fireEvent.press(screen.getByTestId("claim-games-confirm"))

    expect(screen.queryByTestId("claim-games-dialog")).toBeNull()
    expect(repository.loadHistory()).toEqual([
      expect.objectContaining({
        id: newer.id,
        account: { ownerId: "owner-a", mePlayerId: newer.players[1].id },
        publish: "pending",
      }),
      expect.objectContaining({ id: older.id, skippedBy: ["owner-a"] }),
    ])
  })

  it("changes nothing when dismissed", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    repository.archiveGame(finishedGame(1))
    const before = repository.loadHistory()
    setup(repository)
    fireEvent.press(screen.getByTestId("claim-games-dismiss"))
    expect(screen.queryByTestId("claim-games-dialog")).toBeNull()
    expect(repository.loadHistory()).toEqual(before)
  })
})
