import { act, fireEvent, render, screen } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import {
  applyGameCommand,
  asDeviceId,
  createLocalGame,
  createNextMatchGame,
  defaultCommandContext,
} from "./domain"
import { LocalGameClaimPrompt } from "./LocalGameClaimPrompt"
import { LocalGameRepository, type StringStorage } from "./localPersistence"

let mockAuth: { configured: boolean; isLoaded: boolean; isSignedIn: boolean; userId?: string }
let mockAuthVisible = false
let mockConsentSettled = true
let mockPathname = "/"
jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({ ...mockAuth, authVisible: mockAuthVisible }),
}))
jest.mock("@/features/legal/LegalConsentGate", () => ({
  useLegalConsentSettled: () => mockConsentSettled,
}))
jest.mock("expo-router", () => ({ usePathname: () => mockPathname }))

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
    mockConsentSettled = true
    mockPathname = "/"
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
    mockConsentSettled = false
    expect(setup(repository).queryByTestId("claim-games-dialog")).toBeNull()
    mockConsentSettled = true
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
    fireEvent.press(screen.getByTestId(`claim-me-seat-${newer.id}-option-1`))
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

  it("waits for a game in progress to end or the route to change", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    repository.archiveGame(finishedGame(1))
    const fresh = createLocalGame({
      now: 20,
      startingLife: 20,
      players: [
        { name: "Ada", color: "#000000" },
        { name: "Grace", color: "#111111" },
      ],
    })
    const running = applyGameCommand(
      fresh,
      { type: "life.change", playerId: fresh.players[0].id, delta: -1 },
      defaultCommandContext(asDeviceId("device_test")),
    )
    repository.saveActiveGame(running)
    const view = setup(repository)
    expect(view.queryByTestId("claim-games-dialog")).toBeNull()

    act(() => {
      repository.archiveGame(
        applyGameCommand(
          running,
          { type: "game.abandon" },
          { ...defaultCommandContext(asDeviceId("device_test")), now: () => 30 },
        ),
      )
      mockPathname = "/history"
    })
    view.rerender(
      <ThemeProvider initialContext="dark">
        <LocalGameClaimPrompt repository={repository} />
      </ThemeProvider>,
    )
    expect(view.getByTestId("claim-games-dialog")).toBeTruthy()
  })

  it("stays open with an error when saving fails, and the retry finishes the claim", () => {
    const storage = new MemoryStorage()
    const repository = new LocalGameRepository(storage)
    const game = finishedGame(1)
    repository.archiveGame(game)
    const set = storage.set.bind(storage)
    let failDetailWrites = true
    storage.set = (key, value) => {
      if (failDetailWrites && key.includes("history.detail")) throw new Error("disk full")
      set(key, value)
    }
    setup(repository)
    fireEvent.press(screen.getByTestId("claim-games-confirm"))
    expect(screen.getByText("Could not save your choice. Try again.")).toBeTruthy()
    expect(repository.loadHistory()[0]).toMatchObject({ account: { ownerId: "owner-a" } })
    expect(repository.loadHistoryDetail(game.id)?.game.account).toBeUndefined()

    failDetailWrites = false
    fireEvent.press(screen.getByTestId("claim-games-confirm"))
    expect(screen.queryByTestId("claim-games-dialog")).toBeNull()
    expect(repository.loadHistoryDetail(game.id)?.game.account).toEqual({ ownerId: "owner-a" })
  })

  it("offers a signed-out match as one row and claims all of its games with one seat", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const first = createLocalGame({
      now: 1,
      startingLife: 20,
      players: [
        { name: "Ada", color: "#000000" },
        { name: "Grace", color: "#111111" },
      ],
      match: { bestOf: 3 },
    })
    const context = defaultCommandContext(asDeviceId("device_test"))
    const firstDone = applyGameCommand(
      first,
      { type: "game.finish", result: { kind: "win", winnerPlayerIds: [first.players[1].id] } },
      { ...context, now: () => 2 },
    )
    const second = createNextMatchGame(firstDone, 3)
    const secondDone = applyGameCommand(
      second,
      { type: "game.finish", result: { kind: "win", winnerPlayerIds: [second.players[1].id] } },
      { ...context, now: () => 4 },
    )
    repository.archiveGame(firstDone)
    repository.archiveGame(secondDone)
    repository.archiveGame(finishedGame(10, ["Katherine", "Dorothy"]))
    setup(repository)

    const matchId = first.match!.id
    expect(screen.getByText("Add 3 games")).toBeTruthy()
    expect(screen.getAllByRole("checkbox")).toHaveLength(2)
    expect(screen.getByTestId(`claim-game-${matchId}`)).toHaveAccessibleName(
      /Best of 3 · 0-2 · Won by Grace/,
    )
    fireEvent.press(screen.getByTestId(`claim-me-seat-${matchId}`))
    fireEvent.press(screen.getByTestId(`claim-me-seat-${matchId}-option-1`))
    fireEvent.press(screen.getByTestId("claim-games-confirm"))

    const history = repository.loadHistory()
    expect(history.find((game) => game.id === secondDone.id)).toMatchObject({
      account: { ownerId: "owner-a", mePlayerId: second.players[1].id },
      publish: "pending",
      matchPublish: "pending",
    })
    expect(history.find((game) => game.id === firstDone.id)).toMatchObject({
      account: { ownerId: "owner-a", mePlayerId: first.players[1].id },
      publish: "pending",
    })
    expect(repository.pendingPublishes("owner-a")).toHaveLength(3)
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
