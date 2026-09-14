import { useEffect } from "react"
import { act, render, waitFor } from "@testing-library/react-native"

import type { ConnectedHostFeed } from "@/screens/NewGameScreen"

import type { ResumableGame } from "./connectedCopy"
import { ConnectedHostSource, type CreatedLobby } from "./ConnectedHostSource"
import { connectedDeploymentScope, ConnectedGameRepository } from "./persistence"

process.env.EXPO_PUBLIC_CONVEX_URL = "https://test-deployment-123.convex.cloud"
const DEPLOYMENT = connectedDeploymentScope()

const mockStorageValues = new Map<string, string>()
jest.mock("@/utils/storage", () => ({
  storage: {
    getString: (key: string) => mockStorageValues.get(key),
    set: (key: string, value: string) => {
      mockStorageValues.set(key, value)
    },
    delete: (key: string) => {
      mockStorageValues.delete(key)
    },
    getAllKeys: () => [...mockStorageValues.keys()],
  },
}))

const mockCreateLobby = jest.fn(async () => ({
  publicId: "game-new",
  inviteToken: "t",
  manualCode: "c",
}))
const mockLeave = jest.fn(async () => undefined)
const mockAbandon = jest.fn(async () => undefined)
const mockMigrate = jest.fn(async () => ({ isDone: true, continueCursor: "done" }))
jest.mock("@/utils/analytics", () => ({ captureAnalytics: jest.fn() }))
jest.mock("@/features/async/ConvexQueryBoundary", () => ({
  ConvexQueryBoundary: ({ children }: { children: React.ReactNode }) => children,
}))
jest.mock("../../../convex/_generated/api", () => ({
  api: {
    games: {
      createLobby: "games.createLobby",
      leaveMyGame: "games.leaveMyGame",
      abandonGame: "games.abandonGame",
      migrateMyGameMemberships: "games.migrateMyGameMemberships",
      activeConnectedGames: "games.activeConnectedGames",
    },
  },
}))
jest.mock("@/features/game/localPersistence", () => ({
  LocalGameRepository: jest.fn(() => ({
    getDeviceId: () => "device-test-0001",
    saveLayoutPreference: jest.fn(),
  })),
}))
jest.mock("convex/react", () => ({
  useMutation: (reference: unknown) => {
    const name = String(reference)
    if (name.includes("createLobby")) return mockCreateLobby
    if (name.includes("leaveMyGame")) return mockLeave
    if (name.includes("abandonGame")) return mockAbandon
    return mockMigrate
  },
  usePaginatedQuery: () => mockPaginated,
}))
jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({
    configured: true,
    isLoaded: true,
    isSignedIn: true,
    openAuth: jest.fn(),
  }),
}))
jest.mock("./useConnectedProfile", () => ({
  useConnectedProfile: () => mockProfileState,
}))

const OWNER = "user-a"
const USER_ID = "user-a"

let mockProfileState: {
  status: "ready" | "offline"
  profile?: { userId: string; displayName: string }
  retry: () => void
}
let mockPaginated: { results: ResumableGame[]; status: string; loadMore: () => void }

const feedFeeds: ConnectedHostFeed[] = []

function game(publicId: string, updatedAt: number, isHost = true): ResumableGame {
  return {
    publicId,
    status: "active",
    isHost,
    playerCount: 2,
    ruleset: "standard",
    updatedAt,
    startingLife: 20,
  }
}

function renderSource() {
  feedFeeds.length = 0
  committedFeeds.length = 0
  return render(
    <ConnectedHostSource onLobbyCreated={(_: CreatedLobby) => undefined}>
      {(feed) => <FeedCommitProbe feed={feed} />}
    </ConnectedHostSource>,
  )
}

const committedFeeds: ConnectedHostFeed[] = []

function FeedCommitProbe({ feed }: { feed: ConnectedHostFeed }) {
  useEffect(() => {
    committedFeeds.push(feed)
  }, [feed])
  return null
}

describe("ConnectedHostSource durable resume discovery", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockStorageValues.clear()
    mockProfileState = {
      status: "ready",
      profile: { userId: USER_ID, displayName: "Ada" },
      retry: jest.fn(),
    }
    mockPaginated = { results: [], status: "Exhausted", loadMore: () => undefined }
  })

  it("hydrates durable rows from a ready server feed and serves them after the same mount goes offline", async () => {
    mockPaginated = {
      results: [game("game-online", 5), game("game-joined", 6, false)],
      status: "Exhausted",
      loadMore: () => undefined,
    }
    mockProfileState = {
      status: "ready",
      profile: { userId: USER_ID, displayName: "Ada" },
      retry: jest.fn(),
    }
    const view = renderSource()
    await waitFor(() =>
      expect(committedFeeds[committedFeeds.length - 1].activeGames?.length).toBe(2),
    )

    mockProfileState = {
      status: "offline",
      profile: { userId: USER_ID, displayName: "Ada" },
      retry: jest.fn(),
    }
    mockPaginated = { results: [], status: "LoadingFirstPage", loadMore: () => undefined }
    view.rerender(
      <ConnectedHostSource onLobbyCreated={() => undefined}>
        {(feed) => <FeedCommitProbe feed={feed} />}
      </ConnectedHostSource>,
    )
    await waitFor(() =>
      expect(committedFeeds[committedFeeds.length - 1]?.activeGames?.length).toBe(2),
    )
    await waitFor(() =>
      expect(
        committedFeeds[committedFeeds.length - 1]?.activeGames?.map(({ publicId }) => publicId),
      ).toEqual(["game-online", "game-joined"]),
    )
  })

  it("serves cached rows on a cold offline mount only for the signed-in account", async () => {
    const repository = new ConnectedGameRepository(undefined, OWNER, {}, DEPLOYMENT)
    repository.syncResumeIndex([game("game-cached", 10)], true)
    new ConnectedGameRepository(undefined, "user-b", {}, DEPLOYMENT).syncResumeIndex(
      [game("game-other-account", 9)],
      true,
    )
    mockProfileState = {
      status: "offline",
      profile: { userId: USER_ID, displayName: "Ada" },
      retry: jest.fn(),
    }
    mockPaginated = { results: [], status: "LoadingFirstPage", loadMore: () => undefined }
    renderSource()
    await waitFor(() =>
      expect(
        committedFeeds[committedFeeds.length - 1].activeGames?.map(({ publicId }) => publicId),
      ).toEqual(["game-cached"]),
    )
  })

  it("does not render the previous account's rows after an owner switch while offline", async () => {
    const repository = new ConnectedGameRepository(undefined, OWNER, {}, DEPLOYMENT)
    repository.syncResumeIndex([game("game-user-a", 10)], true)
    mockProfileState = {
      status: "offline",
      profile: { userId: OWNER, displayName: "Ada" },
      retry: jest.fn(),
    }
    mockPaginated = { results: [], status: "LoadingFirstPage", loadMore: () => undefined }
    const view = renderSource()
    await waitFor(() =>
      expect(
        committedFeeds[committedFeeds.length - 1].activeGames?.map(({ publicId }) => publicId),
      ).toEqual(["game-user-a"]),
    )
    mockProfileState = {
      status: "offline",
      profile: { userId: "user-b", displayName: "Bo" },
      retry: jest.fn(),
    }
    const commitsBeforeSwitch = committedFeeds.length
    view.rerender(
      <ConnectedHostSource onLobbyCreated={() => undefined}>
        {(feed) => <FeedCommitProbe feed={feed} />}
      </ConnectedHostSource>,
    )
    await waitFor(() => expect(committedFeeds.length).toBeGreaterThan(commitsBeforeSwitch))
    for (const feed of committedFeeds.slice(commitsBeforeSwitch)) {
      expect(feed.activeGames?.map(({ publicId }) => publicId) ?? []).not.toContain("game-user-a")
    }
    expect(committedFeeds[committedFeeds.length - 1].activeGames).toBeUndefined()
  })

  it("drops the durable row after a successful explicit exit even during a partial page set", async () => {
    mockPaginated = {
      results: [game("game-keep", 5), game("game-left", 6, false)],
      status: "CanLoadMore",
      loadMore: () => undefined,
    }
    mockProfileState = {
      status: "ready",
      profile: { userId: USER_ID, displayName: "Ada" },
      retry: jest.fn(),
    }
    renderSource()
    await waitFor(() => expect(committedFeeds.length).toBeGreaterThan(0))
    let exited = false
    const latest = () => committedFeeds[committedFeeds.length - 1]
    await act(async () => {
      exited = await latest().exitGame(game("game-left", 6, false))
    })
    expect(exited).toBe(true)
    expect(new ConnectedGameRepository(undefined, OWNER, {}, DEPLOYMENT).loadResumeIndex()).toEqual(
      [expect.objectContaining({ publicId: "game-keep" })],
    )
  })
})
