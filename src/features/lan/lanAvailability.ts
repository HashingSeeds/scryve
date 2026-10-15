import { Platform } from "react-native"

import { betaUpdatesChosen } from "@/features/updates/appUpdate"
import { loadString, saveString } from "@/utils/storage"

const NAME_KEY = "lan.playerName"
export const LAN_NAME_MAX_LENGTH = 24

// why: nearby play ships to beta testers first; the hidden Beta updates switch is the opt-in they already have.
export const lanPlayAvailable = () => Platform.OS !== "web" && (__DEV__ || betaUpdatesChosen())

export const loadLanName = () => loadString(NAME_KEY) ?? ""

export const saveLanName = (name: string) =>
  saveString(NAME_KEY, name.slice(0, LAN_NAME_MAX_LENGTH))
