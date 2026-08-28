import { useMMKVString } from "react-native-mmkv"

import {
  DEFAULT_MENU_BUTTON_STYLE,
  isMenuButtonStyle,
  type MenuButtonStyle,
} from "@/components/GameMenuButtonShape"
import { storage } from "@/utils/storage"

import { LOCAL_KEYS } from "./localPersistence"

export function useMenuButtonStyle(): MenuButtonStyle {
  const [raw] = useMMKVString(LOCAL_KEYS.settings, storage)
  if (!raw) return DEFAULT_MENU_BUTTON_STYLE
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === "object" && "menuButtonStyle" in parsed) {
      const value = (parsed as { menuButtonStyle: unknown }).menuButtonStyle
      if (isMenuButtonStyle(value)) return value
    }
  } catch {}
  return DEFAULT_MENU_BUTTON_STYLE
}
