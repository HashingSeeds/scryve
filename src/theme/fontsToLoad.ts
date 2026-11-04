import type { FontSource } from "expo-font"

import { CARD_SYMBOL_FONT } from "@/components/cardSymbolGlyphs"

/**
 * why: native binaries embed Rubik through the expo-font config plugin. CardSymbols loads at runtime
 * so a JS update can ship or change it without a new binary.
 */
export const fontsToLoad: Record<string, FontSource> = {
  [CARD_SYMBOL_FONT]: require("../../assets/fonts/CardSymbols.ttf"),
}
