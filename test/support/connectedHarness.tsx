import type { ReactNode } from "react"

import { ThemeProvider } from "@/theme/context"

type ActiveConnectedGame = {
  publicId: string
  status: "lobby" | "active"
  ruleset: string
  playerCount?: number
  isHost?: boolean
  updatedAt?: number
}

type LobbyPlayer = {
  playerId?: string
  seat: number
  displayName: string
  color: string
  shape?: string
  currentLife?: number
  controlledByMe?: boolean
  deckVersionId?: string
}

type LobbyProjection = {
  publicId: string
  status: "lobby" | "active" | "finished"
  playerCount: number
  startingLife: number
  ruleset: string
  isHost: boolean
  invitation?: { token: string; manualCode: string } | null
  players: LobbyPlayer[]
}

type SeatDeck = {
  _id: string
  name: string
  versions: { _id: string; versionNumber: number; name?: string }[]
}

type RuntimePlayer = Required<Pick<LobbyPlayer, "playerId" | "controlledByMe" | "currentLife">> &
  Omit<LobbyPlayer, "playerId" | "controlledByMe" | "currentLife"> & {
    pendingDelta: number
  }

export type MockConnectedRuntime = {
  status: "loading" | "ready"
  source: "cache" | "remote"
  projection: {
    schemaVersion: 1
    publicId: string
    status: "lobby" | "active" | "finished"
    playerCount: number
    startingLife: number
    ruleset: string
    isHost: boolean
    eventSequence: number
    serverUpdatedAt: number
    recentOperationIds: string[]
    players: RuntimePlayer[]
  }
  pending: Array<{ event: { operationId: string; playerId?: string; delta?: number } }>
  failed: Array<{
    action: { event: { operationId: string; playerId?: string; delta?: number } }
    reason: string
  }>
  connectionStatus: "connected" | "offline" | "syncing"
  changeLife: jest.Mock
  finish: jest.Mock
  abandon: jest.Mock
  dismissFailed: jest.Mock
  changeError?: string
  finishError?: string
  finishing: boolean
}

export const mockClaimSeat = jest.fn(async () => ({ publicId: "game-public", seat: 2 }))
export const mockSyncUser = jest.fn(async () => "user")
export const mockStart = jest.fn(async () => ({ publicId: "game-public" }))
export const mockLeave = jest.fn(async () => ({ publicId: "game-public", left: true }))
export const mockAbandon = jest.fn(async () => ({ publicId: "game-public" }))
export const mockSetAppearance = jest.fn(async () => ({ color: "#41476E", shape: "square" }))
export const mockSelectDeck = jest.fn(async () => undefined)
export const mockCreateLobby = jest.fn(async () => ({
  publicId: "new-game",
  inviteToken: "A".repeat(43),
  manualCode: "AB12CD",
}))
export const mockMigrate = jest.fn(async () => ({ isDone: true, continueCursor: "done" }))
export const mockReportPlayer = jest.fn(async () => ({ blocked: true, held: false }))
export const mockBlockPlayer = jest.fn(async () => ({ blocked: true }))
export const mockChangeLife = jest.fn()
export const mockDismissFailed = jest.fn()
export const mockFinish = jest.fn(async () => true)
export const mockRuntimeAbandon = jest.fn(async () => true)

function defaultProjection(): LobbyProjection {
  return {
    publicId: "game-public",
    status: "active",
    playerCount: 2,
    startingLife: 40,
    ruleset: "commander",
    isHost: false,
    players: [
      { seat: 1, displayName: "Ada", color: "#7C3AED", currentLife: 40 },
      { seat: 2, displayName: "Grace", color: "#2563EB", currentLife: 40 },
    ],
  }
}

function defaultRuntime(): MockConnectedRuntime {
  const projection = defaultProjection()
  return {
    status: "ready",
    source: "remote",
    projection: {
      schemaVersion: 1,
      ...projection,
      eventSequence: 0,
      serverUpdatedAt: 1,
      recentOperationIds: [],
      players: [
        {
          playerId: "player-1",
          seat: 1,
          displayName: "Ada",
          color: "#7C3AED",
          currentLife: 40,
          pendingDelta: 0,
          controlledByMe: true,
        },
        {
          playerId: "player-2",
          seat: 2,
          displayName: "Grace",
          color: "#2563EB",
          currentLife: 40,
          pendingDelta: 0,
          controlledByMe: false,
        },
      ],
    },
    pending: [],
    failed: [],
    connectionStatus: "connected",
    changeLife: mockChangeLife,
    finish: mockFinish,
    abandon: mockRuntimeAbandon,
    dismissFailed: mockDismissFailed,
    finishing: false,
  }
}

export const connectedHarness: {
  activeGames: ActiveConnectedGame[]
  activeGamesStatus: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted"
  paginatedError?: Error
  paginatedArgs: unknown[]
  queryErrors: Set<string>
  projection: LobbyProjection
  runtime: MockConnectedRuntime
  socketConnected: boolean
  convexAuthenticated: boolean
  convexLoading: boolean
  userId?: string
  userLoaded: boolean
  migrationOwners: Set<string>
  decks: SeatDeck[] | undefined
} = {
  activeGames: [],
  activeGamesStatus: "Exhausted",
  paginatedArgs: [],
  queryErrors: new Set<string>(),
  projection: defaultProjection(),
  runtime: defaultRuntime(),
  socketConnected: true,
  convexAuthenticated: true,
  convexLoading: false,
  userId: "user-a",
  userLoaded: true,
  migrationOwners: new Set<string>(),
  decks: [],
}

export const mockUseConnectedGame = jest.fn(
  (_publicId: string, _ownerId?: string) => connectedHarness.runtime,
)

export function resetConnectedHarness() {
  jest.clearAllMocks()
  mockClaimSeat.mockReset().mockResolvedValue({ publicId: "game-public", seat: 2 })
  mockSyncUser.mockReset().mockResolvedValue("user")
  mockStart.mockReset().mockResolvedValue({ publicId: "game-public" })
  mockLeave.mockReset().mockResolvedValue({ publicId: "game-public", left: true })
  mockAbandon.mockReset().mockResolvedValue({ publicId: "game-public" })
  mockSetAppearance.mockReset().mockResolvedValue({ color: "#41476E", shape: "square" })
  mockSelectDeck.mockReset().mockResolvedValue(undefined)
  mockCreateLobby.mockReset().mockResolvedValue({
    publicId: "new-game",
    inviteToken: "A".repeat(43),
    manualCode: "AB12CD",
  })
  mockMigrate.mockReset().mockResolvedValue({ isDone: true, continueCursor: "done" })
  mockReportPlayer.mockReset().mockResolvedValue({ blocked: true, held: false })
  mockBlockPlayer.mockReset().mockResolvedValue({ blocked: true })
  mockChangeLife.mockReset()
  mockDismissFailed.mockReset()
  mockFinish.mockReset().mockResolvedValue(true)
  mockRuntimeAbandon.mockReset().mockResolvedValue(true)
  mockUseConnectedGame.mockReset().mockImplementation(() => connectedHarness.runtime)
  connectedHarness.activeGames = []
  connectedHarness.activeGamesStatus = "Exhausted"
  connectedHarness.paginatedError = undefined
  connectedHarness.paginatedArgs = []
  connectedHarness.queryErrors.clear()
  connectedHarness.projection = defaultProjection()
  connectedHarness.runtime = defaultRuntime()
  connectedHarness.socketConnected = true
  connectedHarness.convexAuthenticated = true
  connectedHarness.convexLoading = false
  connectedHarness.userId = "user-a"
  connectedHarness.userLoaded = true
  connectedHarness.migrationOwners.clear()
  connectedHarness.decks = []
}

export function createClerkMock() {
  return {
    useUser: () => ({
      isLoaded: connectedHarness.userLoaded,
      user: connectedHarness.userId
        ? {
            id: connectedHarness.userId,
            fullName: "Ada",
            username: "ada_lovelace",
            imageUrl: "https://example.test/a.png",
          }
        : null,
    }),
  }
}

export function createConvexReactMock() {
  return {
    useConvexAuth: () => ({
      isAuthenticated: connectedHarness.convexAuthenticated,
      isLoading: connectedHarness.convexLoading,
    }),
    useConvexConnectionState: () => ({
      isWebSocketConnected: connectedHarness.socketConnected,
    }),
    useMutation: (reference: unknown) => {
      const name = String(reference)
      if (name.includes("claimSeat")) return mockClaimSeat
      if (name.includes("startGame")) return mockStart
      if (name.includes("leaveMyGame")) return mockLeave
      if (name.includes("abandonGame")) return mockAbandon
      if (name.includes("setMyAppearance")) return mockSetAppearance
      if (name.includes("selectForSeat")) return mockSelectDeck
      if (name.includes("createLobby")) return mockCreateLobby
      if (name.includes("migrateMyGameMemberships") || name.includes("migrateMyHistoryEntries"))
        return mockMigrate
      if (name.includes("reportPlayer")) return mockReportPlayer
      if (name.includes("blockPlayer")) return mockBlockPlayer
      return mockSyncUser
    },
    useQuery: (reference: unknown) => {
      const name = String(reference)
      if (connectedHarness.queryErrors.has(name)) throw new Error(`${name} failed`)
      if (name.includes("listMine"))
        return connectedHarness.decks === undefined ? undefined : { decks: connectedHarness.decks }
      if (name.includes("entitlements.current"))
        return { fullHistory: false, unlimitedDecks: false, deckAnalytics: false }
      return connectedHarness.projection
    },
    usePaginatedQuery: (_reference: unknown, args: unknown) => {
      connectedHarness.paginatedArgs.push(args)
      if (args !== "skip" && connectedHarness.paginatedError) throw connectedHarness.paginatedError
      return {
        results: args === "skip" ? [] : connectedHarness.activeGames,
        status: args === "skip" ? "LoadingFirstPage" : connectedHarness.activeGamesStatus,
        loadMore: jest.fn(),
      }
    },
  }
}

export function createConnectedGameMock() {
  return {
    useConnectedGame: (publicId: string, ownerId?: string) =>
      mockUseConnectedGame(publicId, ownerId),
  }
}

export function createConnectedPersistenceMock() {
  return {
    ConnectedGameRepository: jest.fn((_storage: unknown, ownerId: string) => ({
      isMembershipMigrationComplete: () => connectedHarness.migrationOwners.has(ownerId),
      markMembershipMigrationComplete: () => connectedHarness.migrationOwners.add(ownerId),
    })),
  }
}

export function createAuthConfigMock() {
  return {
    readPublicCloudConfig: () => ({
      configured: true,
      value: {
        clerkPublishableKey: "public-test-key",
        convexUrl: "https://example.convex.cloud",
        inviteOrigin: "https://play.count.example",
      },
    }),
  }
}

export const connectedApi = {
  users: { syncCurrent: "users.syncCurrent" },
  games: {
    claimSeat: "games.claimSeat",
    startGame: "games.startGame",
    leaveMyGame: "games.leaveMyGame",
    abandonGame: "games.abandonGame",
    setMyAppearance: "games.setMyAppearance",
    migrateMyGameMemberships: "games.migrateMyGameMemberships",
    activeConnectedGames: "games.activeConnectedGames",
    createLobby: "games.createLobby",
    lobbyProjection: "games.lobbyProjection",
    connectedHistory: "games.connectedHistory",
    migrateMyHistoryEntries: "games.migrateMyHistoryEntries",
  },
  decks: { listMine: "decks.listMine", selectForSeat: "decks.selectForSeat" },
  moderation: {
    reportPlayer: "moderation.reportPlayer",
    blockPlayer: "moderation.blockPlayer",
  },
  entitlements: { current: "entitlements.current" },
}

export function createGeneratedApiMock() {
  return { api: connectedApi }
}

export function createQrCodeMock() {
  return {
    __esModule: true,
    default: ({
      value,
      quietZone,
      size,
      ecl,
    }: {
      value: string
      quietZone: number
      size: number
      ecl: string
    }) => {
      const NativeText = jest.requireActual<typeof import("react-native")>("react-native").Text
      return (
        <NativeText
          testID="invite-qr"
          accessibilityHint={`size-${size}-quiet-zone-${quietZone}-ecl-${ecl}`}
        >
          {value}
        </NativeText>
      )
    },
  }
}

export function themed(children: ReactNode) {
  return <ThemeProvider initialContext="light">{children}</ThemeProvider>
}
