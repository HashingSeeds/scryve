import { useSyncExternalStore } from "react"
import { NativeModule, requireOptionalNativeModule } from "expo"

export type FlexibleUpdateStart = "started" | "declined" | "inProgress" | "unavailable"

declare class PlayAppUpdate extends NativeModule<{
  onDownloadedChange: (event: { versionCode: number | null }) => void
}> {
  startFlexibleUpdate(): Promise<FlexibleUpdateStart>
  completeUpdate(): Promise<void>
}

/** why: null on iOS, web, Jest, and Android binaries built before the module existed. */
const native = requireOptionalNativeModule<PlayAppUpdate>("PlayAppUpdate")

let downloadedVersion: number | null = null

function subscribe(listener: () => void) {
  const subscription = native?.addListener("onDownloadedChange", ({ versionCode }) => {
    downloadedVersion = versionCode
    listener()
  })
  return () => subscription?.remove()
}

const downloadedSnapshot = () => downloadedVersion

export function useDownloadedPlayVersion() {
  return useSyncExternalStore(subscribe, downloadedSnapshot, downloadedSnapshot)
}

export function startFlexibleUpdate(): Promise<FlexibleUpdateStart> {
  return native?.startFlexibleUpdate() ?? Promise.resolve("unavailable")
}

export function completeUpdate() {
  return native?.completeUpdate() ?? Promise.reject(new Error("PlayAppUpdate is unavailable"))
}
