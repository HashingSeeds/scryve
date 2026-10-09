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
    const analytics: typeof import("./analytics") = require("./analytics")
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
    const analytics: typeof import("./analytics") = require("./analytics")
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

    emitTelemetry("mutation.ack", { durationMs: 120.4, attemptCount: 2, outcome: "success" })
    emitTelemetry("outbox.drain", { acknowledgedCount: 1, outcome: "success" })
    emitTelemetry("join.completed", { outcome: "success" })
    await tick(31_000)
    expect(body().match(/"event":"sync_timing"/g)).toHaveLength(1)
    expect(body()).toContain('"timing":"mutation.ack","duration_ms":120,"attempt_count":2')

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
