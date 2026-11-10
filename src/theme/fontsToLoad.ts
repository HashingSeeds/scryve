import type { FontSource } from "expo-font"

import { CARD_SYMBOL_FONT } from "@/components/cardSymbolGlyphs"

/** why: native binaries embed Rubik via the expo-font plugin; CardSymbols loads at runtime so a JS update can change it. */
export const fontsToLoad: Record<string, FontSource> = {
  [CARD_SYMBOL_FONT]: require("../../assets/fonts/CardSymbols.ttf"),
}
