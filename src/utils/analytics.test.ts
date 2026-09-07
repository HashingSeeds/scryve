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
  expect(require("posthog-react-native").default).toBeDefined()
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
