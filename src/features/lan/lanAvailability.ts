import { Platform } from "react-native"
import Constants from "expo-constants"

import { betaUpdatesChosen } from "@/features/updates/appUpdate"
import { load, loadString, saveString } from "@/utils/storage"

const NAME_KEY = "lan.playerName"
export const HOSTED_GAME_KEY = "lan.hostedGame"
const HOSTED_GAME_LIFETIME_MS = 60 * 60_000
export const LAN_NAME_MAX_LENGTH = 24

export const isPreviewBuild = () => Constants.expoConfig?.extra?.appVariant === "preview"

export const lanPlayAvailable = () => Platform.OS !== "web"

export const nearbyBetaAvailable = () =>
  lanPlayAvailable() && (__DEV__ || isPreviewBuild() || betaUpdatesChosen())

export const loadLanName = () => loadString(NAME_KEY) ?? ""

export const saveLanName = (name: string) =>
  saveString(NAME_KEY, name.slice(0, LAN_NAME_MAX_LENGTH))

// why: iOS can end a host it suspended, and the game it saved on the way out is the only way back to that table.
export function savedHostedGame(now = Date.now()) {
  const saved = load(HOSTED_GAME_KEY)
  return typeof saved === "object" &&
    saved !== null &&
    "savedAt" in saved &&
    typeof saved.savedAt === "number" &&
    now - saved.savedAt < HOSTED_GAME_LIFETIME_MS
    ? saved
    : undefined
}
