import { AppState, Platform } from "react-native"
import Constants from "expo-constants"
import type PostHog from "posthog-react-native"

import { createClientId } from "@/features/game/domain"
import { isPlaySystemId, playSystemFormats } from "@/features/game/playSystems"
import { loadString, saveString, storage } from "@/utils/storage"

const CONSENT_KEY = "scryve.analytics.consent.v1"
const SOURCE_KEY = "scryve.analytics.source.v1"
const ID_KEY = "scryve.analytics.id.v1"
const SDK_PREFIX = "scryve.posthog."
const GAMES_KEY = "scryve.analytics.games.v1"

const values = {
  mode: ["local", "connected"],
  action: ["create", "join"],
  stage: ["started", "succeeded", "failed"],
  reason: ["offline", "access", "profile", "input", "request", "unknown"],
  feature: ["library", "saved", "assigned"],
  surface: ["history", "deck"],
  end_source: ["game_menu", "new_game_prompt", "stale_game_prompt", "unknown"],
} as const

export type GameEndSource = (typeof values.end_source)[number]

type GameProperties = {
  system?: string
  format?: string
  player_count: number
  mode: "local" | "connected"
}
type Events = {
  app_opened: Record<string, never>
  game_started: GameProperties
  game_completed: GameProperties & { end_source?: GameEndSource }
  connection_attempt: {
    action: "create" | "join"
    stage: "started" | "succeeded" | "failed"
    reason?: (typeof values.reason)[number]
  }
  deck_used: { feature: "library" | "saved" | "assigned" }
  stats_viewed: { surface: "history" | "deck" }
}

const eventKeys: Record<keyof Events, readonly string[]> = {
  app_opened: [],
  game_started: ["system", "format", "player_count", "mode"],
  game_completed: ["system", "format", "player_count", "mode", "end_source"],
  connection_attempt: ["action", "stage", "reason"],
  deck_used: ["feature"],
  stats_viewed: ["surface"],
}

let enabled = loadString(CONSENT_KEY) === "yes"
let revision = 0
let transportEnabled = enabled
let cleanup = Promise.resolve()
let clearQueue: (() => void) | undefined
let loading: Promise<PostHog> | undefined
let listening = false
const requests = new Set<AbortController>()

export function analyticsEnabled() {
  return enabled
}

export function analyticsId() {
  return loadString(ID_KEY)
}

export function analyticsConfigured() {
  return Boolean(process.env.EXPO_PUBLIC_POSTHOG_KEY && process.env.EXPO_PUBLIC_POSTHOG_HOST)
}

export function analyticsProperties(event: string, properties: Record<string, unknown>) {
  if (!Object.hasOwn(eventKeys, event)) return null
  const result: Record<string, string | number | boolean> = {
    $geoip_disable: true,
    $process_person_profile: false,
  }
  for (const key of eventKeys[event as keyof Events]) {
    const value = properties[key]
    if (key === "system") result.system = isPlaySystemId(value) ? value : "none"
    else if (key === "format") {
      result.format =
        isPlaySystemId(properties.system) &&
        playSystemFormats(properties.system).some(({ id }) => id === value)
          ? String(value)
          : "none"
    } else if (key === "player_count") {
      if (typeof value === "number" && Number.isInteger(value) && value >= 2 && value <= 6)
        result[key] = value
    } else if (
      Object.hasOwn(values, key) &&
      typeof value === "string" &&
      (values[key as keyof typeof values] as readonly string[]).includes(value)
    )
      result[key] = value
  }
  for (const key of ["token", "distinct_id", "$lib", "$lib_version"])
    if (typeof properties[key] === "string") result[key] = properties[key]
  result.consent_source = loadString(SOURCE_KEY) === "first_use" ? "first_use" : "settings"
  result.platform = Platform.OS
  result.app_version = Constants.expoConfig?.version ?? "unknown"
  return result
}

async function getClient() {
  if (!loading) {
    loading = (async () => {
      const {
        default: SDK,
        PostHogPersistedProperty,
      }: typeof import("posthog-react-native") = require("posthog-react-native")
      // eslint-disable-next-line self-explanatory-code/prefer-self-explanatory-code
      // The SDK's optOut/reset retain queued events. Gate the transport too, including retries.
      class ConsentedPostHog extends SDK {
        async fetch(url: string, options: Parameters<PostHog["fetch"]>[1]) {
          if (!enabled || !transportEnabled) throw new Error("Analytics disabled")
          // eslint-disable-next-line self-explanatory-code/prefer-self-explanatory-code
          // Remote config cannot be disabled in this SDK version. Only event batches may leave.
          if (new URL(url).pathname !== "/batch/")
            return { status: 200, text: async () => "{}", json: async () => ({}) }
          const request = new AbortController()
          const abort = () => request.abort()
          if (options.signal?.aborted) request.abort()
          options.signal?.addEventListener("abort", abort)
          requests.add(request)
          try {
            return await super.fetch(url, {
              ...options,
              signal: request.signal,
              credentials: "omit",
            })
          } finally {
            requests.delete(request)
            options.signal?.removeEventListener("abort", abort)
          }
        }
      }
      let id = analyticsId()
      if (!id) {
        id = createClientId("analytics")
        if (!saveString(ID_KEY, id)) throw new Error("Could not save analytics identifier")
      }
      const sdk = new ConsentedPostHog(process.env.EXPO_PUBLIC_POSTHOG_KEY!, {
        host: process.env.EXPO_PUBLIC_POSTHOG_HOST!,
        bootstrap: { distinctId: id, isIdentifiedId: false },
        customStorage: {
          getItem: (key) => (enabled ? loadString(SDK_PREFIX + key) : null),
          setItem: (key, value) => {
            if (enabled && transportEnabled) saveString(SDK_PREFIX + key, value)
          },
        },
        defaultOptIn: false,
        captureAppLifecycleEvents: false,
        enableSessionReplay: false,
        capturePushNotificationOpened: false,
        capturePushNotificationSubscriptions: false,
        errorTracking: { autocapture: false },
        disableRemoteFeatureFlags: true,
        preloadFeatureFlags: false,
        disableSurveys: true,
        setDefaultPersonProperties: false,
        personProfiles: "never",
        disableGeoip: true,
        disableCompression: true,
        customAppProperties: {},
        flushAt: 20,
        flushInterval: 30_000,
        maxBatchSize: 50,
        maxQueueSize: 200,
        fetchRetryCount: 0,
        requestTimeout: 5000,
        before_send: (event) => {
          if (!enabled || !event) return null
          const properties = analyticsProperties(event.event, event.properties ?? {})
          return properties
            ? { event: event.event, uuid: event.uuid, timestamp: event.timestamp, properties }
            : null
        },
      })
      await sdk.ready()
      clearQueue = () => sdk.setPersistedProperty(PostHogPersistedProperty.Queue, [])
      return sdk
    })()
  }
  return loading
}

export function setAnalyticsEnabled(next: boolean, source: "first_use" | "settings" = "settings") {
  if (next && !analyticsId()) {
    try {
      if (!saveString(SOURCE_KEY, source) || !saveString(ID_KEY, createClientId("analytics")))
        return false
    } catch {
      return false
    }
  }
  if (!next) enabled = false
  const saved = saveString(CONSENT_KEY, next ? "yes" : "no")
  if (next && !saved) return false
  enabled = next
  revision += 1
  if (!next) {
    transportEnabled = false
    requests.forEach((request) => request.abort())
    clearQueue?.()
    try {
      storage
        .getAllKeys()
        .filter((key) => key.startsWith(SDK_PREFIX) || key === GAMES_KEY)
        .forEach((key) => storage.delete(key))
    } catch {}
    if (loading)
      cleanup = loading
        .then(async (sdk) => {
          await sdk.optOut()
          await sdk.flush().catch(() => undefined)
          clearQueue?.()
        })
        .catch(() => undefined)
  } else captureAnalytics("app_opened", {})
  return saved
}

export function captureAnalytics<E extends keyof Events>(event: E, properties: Events[E]) {
  if (!enabled || !analyticsConfigured()) return
  const capturedRevision = revision
  const timestamp = new Date()
  setTimeout(() => {
    if (!enabled || revision !== capturedRevision) return
    void getClient()
      .then(async (sdk) => {
        if (!enabled || revision !== capturedRevision) return
        await cleanup
        if (!enabled || revision !== capturedRevision) return
        transportEnabled = true
        await sdk.optIn()
        if (enabled && revision === capturedRevision) sdk.capture(event, properties, { timestamp })
      })
      .catch(() => undefined)
  }, 0)
}

export function initAnalytics() {
  if (listening) return
  listening = true
  captureAnalytics("app_opened", {})
  let previous = AppState.currentState
  AppState.addEventListener("change", (state) => {
    if (state === "active" && previous !== "active") captureAnalytics("app_opened", {})
    previous = state
  })
}

export function captureGame(
  event: "game_started" | "game_completed",
  game: { id: string; system?: string; format?: string; playerCount: number },
  mode: GameProperties["mode"],
  endSource: GameEndSource = "unknown",
) {
  if (!enabled || !analyticsConfigured()) return
  const capturedRevision = revision
  setTimeout(() => {
    if (!enabled || capturedRevision !== revision) return
    try {
      const raw: unknown = JSON.parse(loadString(GAMES_KEY) ?? "[]")
      const seen = Array.isArray(raw)
        ? raw.filter((entry): entry is string => typeof entry === "string")
        : []
      const key = `${mode}:${game.id}:${event}`
      if (seen.includes(key)) return
      // eslint-disable-next-line self-explanatory-code/prefer-self-explanatory-code
      // ponytail: retain 100 observations; very old connected games reopened after eviction may count again.
      if (!saveString(GAMES_KEY, JSON.stringify([...seen, key].slice(-100)))) return
      captureAnalytics(event, {
        system: game.system,
        format: game.format,
        player_count: game.playerCount,
        mode,
        ...(event === "game_completed" ? { end_source: endSource } : {}),
      })
    } catch {}
  }, 0)
}
