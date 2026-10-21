import { Linking, Platform } from "react-native"
import * as Application from "expo-application"
import * as Updates from "expo-updates"
import { useQuery_experimental } from "convex/react"

import type { TxKeyPath } from "@/i18n"

import { isStoreBuild } from "./appUpdate"
import { api } from "../../../convex/_generated/api"
import { startFlexibleUpdate, useDownloadedPlayVersion } from "../../../modules/play-app-update"

export const STORE_PAGE = Platform.select<{ labelTx: TxKeyPath; url: string }>({
  ios: { labelTx: "play:launch.openAppStore", url: "https://apps.apple.com/app/id6798955244" },
  android: {
    labelTx: "play:launch.openGooglePlay",
    url: "https://play.google.com/store/apps/details?id=com.sowinghope.count",
  },
})

export function openStorePage() {
  if (STORE_PAGE) Linking.openURL(STORE_PAGE.url).catch(() => undefined)
}

export function updateFromStore() {
  startFlexibleUpdate()
    .catch(() => "unavailable" as const)
    .then((result) => {
      if (result === "unavailable") openStorePage()
    })
}

type Build = { version: string; runtimeVersion: string }

function newerVersion(candidate: string, installed: string) {
  const a = candidate.split(".").map(Number)
  const b = installed.split(".").map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff) return diff > 0
  }
  return false
}

export function needsStoreUpdate(installed: Build, live: Build | null | undefined) {
  return (
    !!live &&
    live.runtimeVersion !== installed.runtimeVersion &&
    newerVersion(live.version, installed.version)
  )
}

function useLiveStoreUpdate() {
  const platform = Platform.OS === "ios" ? "ios" : "android"
  const liveQuery = useQuery_experimental({ query: api.storeReleases.live, args: { platform } })
  const live = liveQuery.status === "success" ? liveQuery.data : undefined
  const downloaded = useDownloadedPlayVersion() !== null
  const installed = {
    version: Application.nativeApplicationVersion ?? "",
    runtimeVersion: Updates.runtimeVersion ?? "",
  }
  return STORE_PAGE && !downloaded && needsStoreUpdate(installed, live) ? STORE_PAGE : null
}

/** why: dev, preview, and web builds have no store runtime to fall behind, and tests render menus without Convex. */
export const useStoreUpdate = isStoreBuild() ? useLiveStoreUpdate : () => null
