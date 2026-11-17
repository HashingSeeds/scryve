import { I18nManager, Platform } from "react-native"

import { loadString, remove, saveString } from "@/utils/storage"

import { appDirection, appLocale } from "."

const RELOADED_FOR_KEY = "count.local.directionReload.v1"

/** why: native reads its direction at launch from flags the last run saved, so a language whose direction differs needs the flags saved and one reload. */
export function applyAppDirection(reload: () => unknown) {
  if (Platform.OS === "web") {
    document.documentElement.dir = appDirection
    document.documentElement.lang = appLocale
    return
  }
  const rtl = appDirection === "rtl"
  if (I18nManager.isRTL === rtl) {
    if (loadString(RELOADED_FOR_KEY) !== null) remove(RELOADED_FOR_KEY)
    return
  }
  // why: forcing both ways makes the flags alone decide, whatever the device language or the bundle's localizations.
  I18nManager.allowRTL(rtl)
  I18nManager.forceRTL(rtl)
  // why: if the flags did not take after one reload, reloading again would loop forever.
  if (loadString(RELOADED_FOR_KEY) === appDirection) return
  saveString(RELOADED_FOR_KEY, appDirection)
  reload()
}
