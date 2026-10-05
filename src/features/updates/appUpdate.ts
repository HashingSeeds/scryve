import { useEffect } from "react"
import { AppState, Platform } from "react-native"
import * as Updates from "expo-updates"

import { loadString, saveString } from "@/utils/storage"

const FOREGROUND_CHECK_INTERVAL_MS = 60 * 60 * 1000
const NOTICED_UPDATE_KEY = "count.local.update.noticed.v1"

export type AppUpdate =
  | { status: "idle" }
  | { status: "downloading"; progress?: number }
  | { status: "ready"; updateId: string; notes: string[] }

function releaseNotesFromUpdateManifest(manifest: Partial<Updates.Manifest> | undefined): string[] {
  const extra = manifest && "extra" in manifest ? manifest.extra : undefined
  const notes: unknown =
    extra && "expoClient" in extra ? extra.expoClient?.extra?.releaseNotes : undefined
  return Array.isArray(notes) ? notes.filter((note) => typeof note === "string") : []
}

export function useAppUpdate(): AppUpdate {
  const { isDownloading, downloadProgress, isUpdatePending, downloadedUpdate } =
    Updates.useUpdates()
  if (isUpdatePending && downloadedUpdate?.updateId) {
    return {
      status: "ready",
      updateId: downloadedUpdate.updateId,
      notes: releaseNotesFromUpdateManifest(downloadedUpdate.manifest),
    }
  }
  if (isDownloading) return { status: "downloading", progress: downloadProgress }
  return { status: "idle" }
}

export function useForegroundUpdateChecks() {
  useEffect(() => {
    if (Platform.OS === "web" || !Updates.isEnabled || __DEV__) return
    let lastCheck = Date.now()
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || Date.now() - lastCheck < FOREGROUND_CHECK_INTERVAL_MS) return
      lastCheck = Date.now()
      Updates.checkForUpdateAsync()
        .then((result) => (result.isAvailable ? Updates.fetchUpdateAsync() : undefined))
        .catch(() => undefined)
    })
    return () => subscription.remove()
  }, [])
}

const BETA_CHANNEL = "beta"
const SWITCHABLE_CHANNELS = ["production", BETA_CHANNEL]

// why: the native override persists, but `Updates.channel` only reflects it after a relaunch.
let switchedChannel: string | undefined

export function canSwitchToBeta() {
  return (
    Platform.OS !== "web" &&
    Updates.isEnabled &&
    !__DEV__ &&
    SWITCHABLE_CHANNELS.includes(Updates.channel ?? "")
  )
}

export function betaUpdatesChosen() {
  return (switchedChannel ?? Updates.channel) === BETA_CHANNEL
}

export function updateChannelLabel() {
  const running = Updates.channel
  if (!running) return null
  return switchedChannel ? `${running} (${switchedChannel} after restart)` : running
}

// why: overriding works on existing store builds because EAS Build embeds this header key.
export function setBetaUpdates(enabled: boolean) {
  try {
    Updates.setUpdateRequestHeadersOverride(enabled ? { "expo-channel-name": BETA_CHANNEL } : null)
  } catch {
    return false
  }
  const next = enabled ? BETA_CHANNEL : "production"
  switchedChannel = next === Updates.channel ? undefined : next
  Updates.checkForUpdateAsync()
    .then((result) => (result.isAvailable ? Updates.fetchUpdateAsync() : undefined))
    .catch(() => undefined)
  return true
}

export function restartToUpdate() {
  Updates.reloadAsync().catch(() => undefined)
}

export function wasUpdateNoticed(updateId: string) {
  return loadString(NOTICED_UPDATE_KEY) === updateId
}

export function markUpdateNoticed(updateId: string) {
  saveString(NOTICED_UPDATE_KEY, updateId)
}
