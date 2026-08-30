import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import { Screen } from "@/components/Screen"
import {
  ConnectedProfileProvider,
  resetConnectedProfileBootstrapForTests,
} from "@/features/connected/useConnectedProfile"

import { ConnectedHomeScreen } from "./ConnectedHomeScreen"
import {
  connectedHarness,
  mockMigrate,
  mockSyncUser,
  resetConnectedHarness,
  themed,
} from "../../test/support/connectedHarness"

jest.mock("@clerk/expo", () =>
  jest
    .requireActual<typeof import("../../test/support/connectedHarness")>(
      "../../test/support/connectedHarness",
    )
    .createClerkMock(),
)
jest.mock("convex/react", () =>
  jest
    .requireActual<typeof import("../../test/support/connectedHarness")>(
      "../../test/support/connectedHarness",
    )
    .createConvexReactMock(),
)
jest.mock("@/features/connected/persistence", () =>
  jest
    .requireActual<typeof import("../../test/support/connectedHarness")>(
      "../../test/support/connectedHarness",
    )
    .createConnectedPersistenceMock(),
)
jest.mock("../../convex/_generated/api", () =>
  jest
    .requireActual<typeof import("../../test/support/connectedHarness")>(
      "../../test/support/connectedHarness",
    )
    .createGeneratedApiMock(),
)

describe("ConnectedHomeScreen", () => {
  beforeEach(() => {
    resetConnectedHarness()
    resetConnectedProfileBootstrapForTests()
  })

  function home(props: React.ComponentProps<typeof ConnectedHomeScreen>) {
    return themed(
      <ConnectedProfileProvider>
        <ConnectedHomeScreen {...props} />
      </ConnectedProfileProvider>,
    )
  }

  it("starts connected setup at the top without duplicating the header safe area", async () => {
    const view = render(home({ onHostNew: jest.fn(), onJoin: jest.fn() }))

    await waitFor(() => expect(screen.getByTestId("host-connected-button")).toBeEnabled())
    expect(mockSyncUser).toHaveBeenCalledTimes(1)
    expect(view.UNSAFE_getByType(Screen).props.safeAreaEdges).toEqual(["bottom"])
  })

  it("surfaces a cold-start active connected game for resume", async () => {
    connectedHarness.activeGames = [
      { publicId: "resumable-game", status: "active", ruleset: "commander" },
    ]
    const onResume = jest.fn()
    render(home({ onHostNew: jest.fn(), onJoin: jest.fn(), onResume }))
    await waitFor(() => expect(screen.getByTestId("resume-connected-resumable-game")).toBeTruthy())
    fireEvent.press(screen.getByTestId("resume-connected-resumable-game"))
    expect(onResume).toHaveBeenCalledWith(connectedHarness.activeGames[0])
    await waitFor(() => expect(mockMigrate).toHaveBeenCalledWith({ cursor: null }))
    expect(connectedHarness.paginatedArgs[0]).toBe("skip")
    expect(connectedHarness.paginatedArgs).toContainEqual({})
  })

  it("identifies an existing hosted lobby and prevents stacking another one", async () => {
    connectedHarness.activeGames = [
      {
        publicId: "hosted-lobby",
        status: "lobby",
        ruleset: "standard",
        playerCount: 2,
        isHost: true,
        updatedAt: 1_800_000_000_000,
      },
    ]
    render(home({ onHostNew: jest.fn(), onJoin: jest.fn() }))

    await waitFor(() => expect(screen.getByTestId("resume-connected-hosted-lobby")).toBeTruthy())
    expect(screen.getByText("Hosting · waiting to start")).toBeTruthy()
    expect(screen.getByText(/2 seats · Standard/)).toBeTruthy()
    expect(screen.getByTestId("host-connected-button").props.accessibilityState.disabled).toBe(true)
    expect(screen.getByText(/Resume or finish\/abandon your hosted game/i)).toBeTruthy()
  })

  it("fills the home screen with an empty state instead of a blank band", async () => {
    render(home({ onHostNew: jest.fn(), onJoin: jest.fn() }))

    await waitFor(() => expect(screen.getByTestId("no-active-connected-games")).toBeTruthy())
    expect(screen.getByText(/Host a lobby and share the code/i)).toBeTruthy()
  })

  it("reserves game rows while the connected profile is prepared", async () => {
    let resolveSync: (value: string) => void = () => undefined
    mockSyncUser.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolveSync = resolve
      }),
    )
    render(home({ onHostNew: jest.fn(), onJoin: jest.fn() }))

    expect(screen.getByText("Preparing your connected profile…")).toBeTruthy()
    expect(screen.getAllByTestId("connected-game-row-placeholder")).toHaveLength(2)
    expect(screen.getByTestId("host-connected-button")).toBeDisabled()

    await act(async () => resolveSync("user-a"))
  })

  it("keeps the same rows while the first games page loads", async () => {
    connectedHarness.activeGamesStatus = "LoadingFirstPage"
    render(home({ onHostNew: jest.fn(), onJoin: jest.fn() }))

    await waitFor(() => expect(screen.getByText("Loading your games…")).toBeTruthy())
    expect(screen.getAllByTestId("connected-game-row-placeholder")).toHaveLength(2)
    expect(screen.queryByTestId("no-active-connected-games")).toBeNull()
  })

  it("offers a local retry when the active-games query fails", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined)
    connectedHarness.paginatedError = new Error("Active games failed")
    render(home({ onHostNew: jest.fn(), onJoin: jest.fn() }))

    await waitFor(() =>
      expect(screen.getByText("Could not load your connected games.")).toBeTruthy(),
    )
    connectedHarness.paginatedError = undefined
    fireEvent.press(screen.getByTestId("retry-connected-games-button"))
    await waitFor(() => expect(screen.getByTestId("no-active-connected-games")).toBeTruthy())
    consoleError.mockRestore()
  })

  it("does not restart a completed membership migration on the next home mount", async () => {
    const first = render(home({ onHostNew: jest.fn(), onJoin: jest.fn() }))
    await waitFor(() => expect(mockMigrate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(connectedHarness.migrationOwners).toContain("user-a"))
    first.unmount()
    mockSyncUser.mockClear()
    render(home({ onHostNew: jest.fn(), onJoin: jest.fn() }))
    await waitFor(() => expect(mockSyncUser).toHaveBeenCalled())
    expect(mockMigrate).toHaveBeenCalledTimes(1)
  })

  it("skips resume/history synchronously when switching from ready A to unsynced B", async () => {
    connectedHarness.activeGames = [
      { publicId: "account-a-game", status: "active", ruleset: "standard" },
    ]
    let resolveAccountB!: (value: string) => void
    const accountBPending = new Promise<string>((resolve) => {
      resolveAccountB = resolve
    })
    const props = { onHostNew: jest.fn(), onJoin: jest.fn(), onHistory: jest.fn() }
    const view = render(home(props))
    await waitFor(() => expect(screen.getByTestId("resume-connected-account-a-game")).toBeTruthy())
    mockSyncUser.mockImplementationOnce(() => accountBPending)
    connectedHarness.userId = "user-b"
    view.rerender(home(props))
    expect(screen.queryByTestId("resume-connected-account-a-game")).toBeNull()
    expect(
      screen.getByRole("button", { name: "Connected history" }).props.accessibilityState.disabled,
    ).toBe(true)
    expect(connectedHarness.paginatedArgs.at(-1)).toBe("skip")
    await act(async () => resolveAccountB("user-b"))
  })
})
