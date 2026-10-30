// why: analytics imports the SDK lazily, so a cold Jest cache would transform it inside the first test's 5s timeout.
import "posthog-react-native"

import { storage } from "@/utils/storage"

const fetchMock = jest.fn()
const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
  jest.useRealTimers()
  jest.restoreAllMocks()
  delete process.env.EXPO_PUBLIC_POSTHOG_KEY
  delete process.env.EXPO_PUBLIC_POSTHOG_HOST
})

async function tick(ms = 100) {
  await jest.advanceTimersByTimeAsync(ms)
}

function requireIsolatedAnalytics() {
  const analytics: typeof import("./analytics") = require("./analytics")
  global.fetch = fetchMock
  return analytics
}

it("only uploads allowlisted, opted-in events and discards the offline queue on withdrawal", async () => {
  jest.useFakeTimers()
  global.fetch = fetchMock
  jest.spyOn(console, "error").mockImplementation(() => undefined)
  storage.clearAll()
  process.env.EXPO_PUBLIC_POSTHOG_KEY = "test-key"
  process.env.EXPO_PUBLIC_POSTHOG_HOST = "https://analytics.invalid"
  fetchMock.mockRejectedValue(new Error("offline"))
  const analytics: typeof import("./analytics") = require("./analytics")
  analytics.initAnalytics()
  analytics.captureAnalytics("game_started", { mode: "local", player_count: 2 })
  await tick(31_000)
  expect(fetchMock).not.toHaveBeenCalled()
  expect(analytics.analyticsId()).toBeNull()

  expect(analytics.setAnalyticsEnabled(true, "first_use")).toBe(true)
  await tick()
  analytics.captureGame(
    "game_started",
    { id: "private-game-id", system: "mtg", format: "commander", playerCount: 4 },
    "local",
  )
  analytics.captureGame(
    "game_started",
    { id: "private-game-id", system: "mtg", format: "commander", playerCount: 4 },
    "local",
  )
  await tick(31_000)
  expect(fetchMock).toHaveBeenCalled()
  expect(fetchMock.mock.calls.every(([url]) => url === "https://analytics.invalid/batch/")).toBe(
    true,
  )
  const queued = storage
    .getAllKeys()
    .filter((key) => key.startsWith("scryve.posthog."))
    .map((key) => storage.getString(key))
    .join("")
  expect(queued).toContain("game_started")
  expect(queued).not.toContain("private-game-id")
  expect(queued.match(/game_started/g)).toHaveLength(1)

  fetchMock.mockResolvedValue({ status: 200, text: async () => "{}", json: async () => ({}) })
  analytics.captureAnalytics("app_opened", {})
  await tick(31_000)
  const reconnectBody = String(fetchMock.mock.calls.at(-1)?.[1].body)
  expect(reconnectBody).toContain("game_started")
  expect(reconnectBody).toContain('"consent_source":"first_use"')
  expect(reconnectBody).not.toContain("private-game-id")

  fetchMock.mockRejectedValue(new Error("offline again"))
  analytics.captureGame("game_completed", { id: "private-game-id", playerCount: 4 }, "local")
  await tick(31_000)
  analytics.setAnalyticsEnabled(false)
  await tick()
  expect(storage.getAllKeys().filter((key) => key.startsWith("scryve.posthog."))).toEqual([])
  fetchMock.mockClear()
  fetchMock.mockResolvedValue({ status: 200, text: async () => "{}", json: async () => ({}) })
  await tick(60_000)
  expect(fetchMock).not.toHaveBeenCalled()
  expect(analytics.analyticsId()).toBeTruthy()

  analytics.setAnalyticsEnabled(true)
  await tick(31_000)
  const afterOptIn = storage
    .getAllKeys()
    .filter((key) => key.startsWith("scryve.posthog."))
    .map((key) => storage.getString(key))
    .join("")
  expect(afterOptIn).not.toContain("game_started")
  expect(String(fetchMock.mock.calls.at(-1)?.[1].body)).not.toContain("game_completed")
  fetchMock.mockImplementation(
    (_url, options: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("aborted")))
      }),
  )
  analytics.captureAnalytics("deck_used", { feature: "saved" })
  await tick(30_100)
  const pendingSignal: AbortSignal = fetchMock.mock.calls.at(-1)?.[1].signal
  expect(pendingSignal.aborted).toBe(false)
  analytics.setAnalyticsEnabled(false)
  expect(pendingSignal.aborted).toBe(true)
  fetchMock.mockResolvedValue({ status: 200, text: async () => "{}", json: async () => ({}) })
  analytics.setAnalyticsEnabled(true)
  await tick(31_000)
  expect(String(fetchMock.mock.calls.at(-1)?.[1].body)).not.toContain("deck_used")
  analytics.setAnalyticsEnabled(false)
  await tick()
  jest.useRealTimers()
})

it("retries loading the SDK after a failed download instead of disabling analytics", async () => {
  jest.useFakeTimers()
  global.fetch = fetchMock
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ status: 200, text: async () => "{}", json: async () => ({}) })
  jest.spyOn(console, "error").mockImplementation(() => undefined)
  process.env.EXPO_PUBLIC_POSTHOG_KEY = "test-key"
  process.env.EXPO_PUBLIC_POSTHOG_HOST = "https://analytics.invalid"
  let sdkLoads = 0
  await jest.isolateModulesAsync(async () => {
    jest.doMock("posthog-react-native", () => {
      sdkLoads += 1
      if (sdkLoads === 1) throw new Error("chunk download failed")
      return jest.requireActual("posthog-react-native")
    })
    const analytics = requireIsolatedAnalytics()
    require("@/utils/storage").storage.clearAll()
    expect(analytics.setAnalyticsEnabled(true, "first_use")).toBe(true)
    await tick()
    expect(sdkLoads).toBe(1)

    analytics.captureAnalytics("stats_viewed", { surface: "history" })
    await tick(31_000)
    expect(sdkLoads).toBe(2)
    expect(String(fetchMock.mock.calls.at(-1)?.[1].body)).toContain("stats_viewed")
  })
})

it("drops unexpected events, free text, SDK metadata, and unknown catalog values", async () => {
  const { analyticsProperties }: typeof import("./analytics") = require("./analytics")
  expect(analyticsProperties("$autocapture", { text: "private" })).toBeNull()
  expect(
    analyticsProperties("game_started", {
      system: "mtg",
      format: "my private format",
      player_count: 4,
      mode: "local",
      name: "private",
      $device_name: "private",
      $current_url: "private",
      $set: { email: "private" },
    }),
  ).toEqual(
    expect.objectContaining({ system: "mtg", format: "none", player_count: 4, mode: "local" }),
  )
  expect(
    JSON.stringify(
      analyticsProperties("game_started", {
        name: "private",
        system: "private",
        format: "private",
        player_count: 4,
        mode: "local",
      }),
    ),
  ).not.toContain("private")
})

it("records which die was armed, from where, and how soon after the last roll", () => {
  const { analyticsProperties }: typeof import("./analytics") = require("./analytics")
  expect(
    analyticsProperties("dice_armed", {
      tool: "d20",
      source: "bag",
      system: "mtg",
      since_roll_ms: 4200.4,
    }),
  ).toEqual(
    expect.objectContaining({ tool: "d20", source: "bag", system: "mtg", since_roll_ms: 4200 }),
  )
  const unknown = analyticsProperties("dice_rolled", { tool: "d7", system: "private" })
  expect(unknown).not.toHaveProperty("tool")
  expect(unknown).toEqual(expect.objectContaining({ system: "none" }))
})

it("keeps scan counts and heat but nothing else from a finished scan", () => {
  const { analyticsProperties }: typeof import("./analytics") = require("./analytics")
  const properties = analyticsProperties("card_scan_completed", {
    duration_ms: 61_000.4,
    added_count: 88,
    read_count: 900,
    peak_heat: "serious",
    name: "Sol Ring",
  })
  expect(properties).toEqual(
    expect.objectContaining({
      duration_ms: 61_000,
      added_count: 88,
      read_count: 900,
      peak_heat: "serious",
    }),
  )
  expect(properties).not.toHaveProperty("name")
  expect(analyticsProperties("card_scan_completed", { peak_heat: "melting" })).not.toHaveProperty(
    "peak_heat",
  )
})

it("tags events with the running update's commit and still drops SDK device metadata", () => {
  jest.doMock("expo-constants", () => ({
    __esModule: true,
    default: {
      expoConfig: { extra: { releaseCommit: "0123456789abcdef0123456789abcdef01234567" } },
    },
  }))
  let properties: ReturnType<typeof import("./analytics").analyticsProperties> = null
  jest.isolateModules(() => {
    const { analyticsProperties }: typeof import("./analytics") = require("./analytics")
    properties = analyticsProperties("app_opened", { $device_id: "private" })
  })
  jest.dontMock("expo-constants")
  expect(properties).toEqual(expect.objectContaining({ commit: "0123456789ab" }))
  expect(properties).not.toHaveProperty("$device_id")
})

it("allowlists completion entry points without adding them to game starts", () => {
  const { analyticsProperties }: typeof import("./analytics") = require("./analytics")
  for (const end_source of ["game_menu", "new_game_prompt", "stale_game_prompt", "unknown"])
    expect(analyticsProperties("game_completed", { end_source })).toEqual(
      expect.objectContaining({ end_source }),
    )
  expect(analyticsProperties("game_completed", { end_source: "private text" })).not.toHaveProperty(
    "end_source",
  )
  expect(analyticsProperties("game_started", { end_source: "new_game_prompt" })).not.toHaveProperty(
    "end_source",
  )
})

it("sends timed sync events as sync_timing only if sharing was on when they happened", async () => {
  jest.useFakeTimers()
  global.fetch = fetchMock
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ status: 200, text: async () => "{}", json: async () => ({}) })
  jest.spyOn(Math, "random").mockReturnValue(0)
  jest.spyOn(console, "error").mockImplementation(() => undefined)
  process.env.EXPO_PUBLIC_POSTHOG_KEY = "test-key"
  process.env.EXPO_PUBLIC_POSTHOG_HOST = "https://analytics.invalid"
  await jest.isolateModulesAsync(async () => {
    const analytics = requireIsolatedAnalytics()
    const {
      emitTelemetry,
      setTelemetryAdapter,
    }: typeof import("./telemetry") = require("./telemetry")
    require("@/utils/storage").storage.clearAll()
    setTelemetryAdapter(analytics.syncTimingAdapter)
    const body = () => fetchMock.mock.calls.map(([, options]) => String(options.body)).join("")

    emitTelemetry("join.completed", { durationMs: 900, outcome: "success" })
    analytics.setAnalyticsEnabled(true, "settings")
    await tick(31_000)
    expect(body()).not.toContain("sync_timing")

    emitTelemetry("mutation.ack", {
      durationMs: 120.4,
      attemptCount: 2,
      outcome: "success",
      writeKind: "commander.claim",
    })
    emitTelemetry("outbox.drain", { acknowledgedCount: 1, outcome: "success" })
    emitTelemetry("join.completed", { outcome: "success" })
    await tick(31_000)
    expect(body().match(/"event":"sync_timing"/g)).toHaveLength(1)
    expect(body()).toContain(
      '"timing":"mutation.ack","duration_ms":120,"attempt_count":2,"write":"commander.claim"',
    )

    fetchMock.mockClear()
    fetchMock.mockRejectedValue(new Error("offline"))
    emitTelemetry("join.failed", { durationMs: 700, outcome: "rejected" })
    await tick(31_000)
    analytics.setAnalyticsEnabled(false)
    await tick()
    fetchMock.mockClear()
    fetchMock.mockResolvedValue({ status: 200, text: async () => "{}", json: async () => ({}) })
    analytics.setAnalyticsEnabled(true)
    await tick(31_000)
    expect(body()).not.toContain("join.failed")
    analytics.setAnalyticsEnabled(false)
    setTelemetryAdapter()
    await tick()
  })
})

it("allowlists deck sync actions and outcomes without accepting content or connection actions", () => {
  const { analyticsProperties }: typeof import("./analytics") = require("./analytics")
  for (const action of ["sync", "move_to_device", "add_as_new"]) {
    for (const outcome of [
      "ok",
      "conflict",
      "limit",
      "other_account",
      "kept_newer_edits",
      "failed",
    ]) {
      const properties = analyticsProperties("deck_sync", {
        action,
        outcome,
        name: "private",
        deckId: "private",
        note: "private",
      })
      expect(properties).toEqual(expect.objectContaining({ action, outcome }))
      expect(JSON.stringify(properties)).not.toContain("private")
    }
  }
  expect(
    analyticsProperties("deck_sync", { action: "create", outcome: "private" }),
  ).not.toHaveProperty("action")
  expect(
    analyticsProperties("deck_sync", { action: "private", outcome: "private" }),
  ).not.toHaveProperty("outcome")
  expect(analyticsProperties("connection_attempt", { action: "sync" })).not.toHaveProperty("action")
})

it.each(["deck_stats", "compare"])(
  "allowlists the %s stats surface without deck content",
  (surface) => {
    const { analyticsProperties }: typeof import("./analytics") = require("./analytics")
    const properties = analyticsProperties("stats_viewed", {
      surface,
      deckName: "private",
      deckKey: "private",
      cardName: "private",
    })
    expect(properties).toEqual(expect.objectContaining({ surface }))
    expect(JSON.stringify(properties)).not.toContain("private")
    expect(analyticsProperties("stats_viewed", { surface: "private" })).not.toHaveProperty(
      "surface",
    )
  },
)

it("accepts only boolean turn order coverage on game completion", () => {
  const { analyticsProperties }: typeof import("./analytics") = require("./analytics")
  for (const first_player_known of [true, false])
    expect(analyticsProperties("game_completed", { first_player_known })).toEqual(
      expect.objectContaining({ first_player_known }),
    )
  expect(
    analyticsProperties("game_completed", { first_player_known: "private" }),
  ).not.toHaveProperty("first_player_known")
  expect(analyticsProperties("game_started", { first_player_known: true })).not.toHaveProperty(
    "first_player_known",
  )
})

it("sends local turn order coverage once per completed game without player or game ids", async () => {
  jest.useFakeTimers()
  global.fetch = fetchMock
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ status: 200, text: async () => "{}", json: async () => ({}) })
  process.env.EXPO_PUBLIC_POSTHOG_KEY = "test-key"
  process.env.EXPO_PUBLIC_POSTHOG_HOST = "https://analytics.invalid"
  await jest.isolateModulesAsync(async () => {
    const localStorage: typeof import("@/utils/storage") = require("@/utils/storage")
    localStorage.storage.clearAll()
    const analytics = requireIsolatedAnalytics()
    analytics.setAnalyticsEnabled(true)
    for (const firstPlayerId of ["private-player", undefined]) {
      const game = { id: `private-game-${firstPlayerId}`, firstPlayerId, playerCount: 2 }
      analytics.captureGame("game_completed", game, "local")
      analytics.captureGame("game_completed", game, "local")
    }
    analytics.captureGame(
      "game_completed",
      { id: "private-connected", playerCount: 2 },
      "connected",
    )
    await tick(31_000)
    const body = fetchMock.mock.calls.map(([, options]) => String(options.body)).join("")
    expect(body.match(/"event":"game_completed"/g)).toHaveLength(3)
    expect(body.match(/"first_player_known":true/g)).toHaveLength(1)
    expect(body.match(/"first_player_known":false/g)).toHaveLength(1)
    expect(body).not.toContain("private")
    analytics.setAnalyticsEnabled(false)
    await tick()
  })
})

it("keeps sync latency to whole milliseconds and the known transports", () => {
  const { analyticsProperties }: typeof import("./analytics") = require("./analytics")
  const properties = analyticsProperties("sync_latency", {
    transport: "nearby",
    role: "guest",
    delivery_p50: 104.4,
    delivery_count: "private",
    ping_ms: -3,
    name: "private",
  })
  expect(properties).toEqual(
    expect.objectContaining({ transport: "nearby", role: "guest", delivery_p50: 104 }),
  )
  for (const key of ["delivery_count", "ping_ms", "name"])
    expect(properties).not.toHaveProperty(key)
  expect(analyticsProperties("sync_latency", { transport: "cloud", scope: "event" })).toEqual(
    expect.objectContaining({ scope: "event" }),
  )
  expect(
    analyticsProperties("sync_latency", { transport: "cloud", scope: "lobby" }),
  ).not.toHaveProperty("scope")
})
