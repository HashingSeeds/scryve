import { Platform } from "react-native"
import Constants from "expo-constants"

import { betaUpdatesChosen } from "@/features/updates/appUpdate"
import { loadString, saveString } from "@/utils/storage"

const NAME_KEY = "lan.playerName"
export const LAN_NAME_MAX_LENGTH = 24

export const isPreviewBuild = () => Constants.expoConfig?.extra?.appVariant === "preview"

// why: nearby play ships to beta testers first through the Beta updates switch they already have; internal preview builds get it too so release mode can be tested.
export const lanPlayAvailable = () =>
  Platform.OS !== "web" && (__DEV__ || isPreviewBuild() || betaUpdatesChosen())

export const loadLanName = () => loadString(NAME_KEY) ?? ""

export const saveLanName = (name: string) =>
  saveString(NAME_KEY, name.slice(0, LAN_NAME_MAX_LENGTH))
