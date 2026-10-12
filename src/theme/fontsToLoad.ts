import type { FontSource } from "expo-font"

/** why: native binaries embed Rubik through the expo-font config plugin, so nothing loads at runtime. */
export const fontsToLoad: Record<string, FontSource> = {}
