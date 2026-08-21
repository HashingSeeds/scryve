import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import { Screen } from "@/components/Screen"

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
  beforeEach(resetConnectedHarness)

  it("starts connected setup at the top without duplicating the header safe area", async () => {
    const view = render(themed(<ConnectedHomeScreen onHostNew={jest.fn()} onJoin={jest.fn()} />))

    await waitFor(() => expect(screen.getByTestId("host-connected-button")).toBeEnabled())
    expect(view.UNSAFE_getByType(Screen).props.safeAreaEdges).toEqual(["bottom"])
  })

  it("surfaces a cold-start active connected game for resume", async () => {
    connectedHarness.activeGames = [
      { publicId: "resumable-game", status: "active", ruleset: "commander" },
    ]
    const onResume = jest.fn()
    render(
      themed(<ConnectedHomeScreen onHostNew={jest.fn()} onJoin={jest.fn()} onResume={onResume} />),
    )
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
    render(themed(<ConnectedHomeScreen onHostNew={jest.fn()} onJoin={jest.fn()} />))

    await waitFor(() => expect(screen.getByTestId("resume-connected-hosted-lobby")).toBeTruthy())
    expect(screen.getByText(/Hosted lobby · standard · 2 seats/)).toBeTruthy()
    expect(screen.getByTestId("host-connected-button").props.accessibilityState.disabled).toBe(true)
    expect(screen.getByText(/Resume or finish\/abandon your hosted game/i)).toBeTruthy()
  })

  it("does not restart a completed membership migration on the next home mount", async () => {
    const first = render(themed(<ConnectedHomeScreen onHostNew={jest.fn()} onJoin={jest.fn()} />))
    await waitFor(() => expect(mockMigrate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(connectedHarness.migrationOwners).toContain("user-a"))
    first.unmount()
    mockSyncUser.mockClear()
    render(themed(<ConnectedHomeScreen onHostNew={jest.fn()} onJoin={jest.fn()} />))
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
    const view = render(
      themed(
        <ConnectedHomeScreen onHostNew={jest.fn()} onJoin={jest.fn()} onHistory={jest.fn()} />,
      ),
    )
    await waitFor(() => expect(screen.getByTestId("resume-connected-account-a-game")).toBeTruthy())
    mockSyncUser.mockImplementationOnce(() => accountBPending)
    connectedHarness.userId = "user-b"
    view.rerender(
      themed(
        <ConnectedHomeScreen onHostNew={jest.fn()} onJoin={jest.fn()} onHistory={jest.fn()} />,
      ),
    )
    expect(screen.queryByTestId("resume-connected-account-a-game")).toBeNull()
    expect(
      screen.getByRole("button", { name: "Connected history" }).props.accessibilityState.disabled,
    ).toBe(true)
    expect(connectedHarness.paginatedArgs.at(-1)).toBe("skip")
    await act(async () => resolveAccountB("user-b"))
  })
})
