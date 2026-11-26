import type { GoldieConfig } from "goldie"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

import { MAX_PLAYERS } from "../convex/lib/policy.ts"
import ar from "../src/i18n/ar/storefront.ts"
import en from "../src/i18n/en/storefront.ts"
import es from "../src/i18n/es/storefront.ts"
import fr from "../src/i18n/fr/storefront.ts"
import hi from "../src/i18n/hi/storefront.ts"
import ja from "../src/i18n/ja/storefront.ts"
import ko from "../src/i18n/ko/storefront.ts"

const APP_ROOT = fileURLToPath(new URL("..", import.meta.url))

export const APP_LANGUAGES = {
  "en-US": { appleLocale: "en_US", copy: en },
  "es-MX": { appleLocale: "es_MX", copy: es },
  "fr-FR": { appleLocale: "fr_FR", copy: fr },
  "ja": { appleLocale: "ja_JP", copy: ja },
  "ko": { appleLocale: "ko_KR", copy: ko },
  "hi": { appleLocale: "hi_IN", copy: hi },
  "ar-SA": { appleLocale: "ar_SA", copy: ar },
}
type Locale = keyof typeof APP_LANGUAGES
type Storefront = (typeof APP_LANGUAGES)[Locale]["copy"]

const { fillStoreText } = createRequire(import.meta.url)("../scripts/i18n.cjs")
const locales = Object.keys(APP_LANGUAGES) as Locale[]
const byLocale = (text: (copy: Storefront) => string) =>
  Object.fromEntries(
    locales.map((locale) => [
      locale,
      fillStoreText(text(APP_LANGUAGES[locale].copy), { maxPlayers: MAX_PLAYERS }, locale),
    ]),
  )

const screenshot = (
  id: string,
  caption: keyof Storefront["screenshots"],
  layout?: GoldieConfig["theme"]["layout"],
) => ({
  kind: "screenshot" as const,
  id,
  flow: id,
  headline: byLocale((copy) => copy.screenshots[caption].headline),
  subhead: byLocale((copy) => copy.screenshots[caption].subhead),
  ...(layout ? { layout } : {}),
})

// why: copyBand and copyScale need the mchisolm0/goldie fork; published goldie ignores them.
const config: GoldieConfig = {
  appRoot: APP_ROOT,
  appPath: "../build/goldie-ios/Scryve.app",
  bundleId: "com.sowinghope.count",
  flowsDir: "../.maestro/store-assets/scenes",

  devices: ["iphone-6.9", "ipad-13"],
  locales,
  localizedCaptures: true,
  appearance: "dark",

  frame: { variant: { "iphone-6.9": "17-pro-silver", "ipad-13": "ipad-pro-13-silver" } },

  theme: {
    background: "radial-gradient(120% 80% at 50% 0%, #3C2A24 0%, #191015 45%, #000000 100%)",
    headlineColor: "#F4F2F1",
    subheadColor: "#B6ACA6",
    // why: goldie's canvas falls back only to fonts it is named, and Rubik and its bundled CJK and Arabic faces have no Devanagari.
    fontFamily: 'Rubik, "Kohinoor Devanagari"',
    fontFiles: [
      {
        family: "Rubik",
        files: {
          400: "../assets/fonts/Rubik-Regular.ttf",
          600: "../assets/fonts/Rubik-SemiBold.ttf",
          700: "../assets/fonts/Rubik-Bold.ttf",
        },
      },
    ],
    copyHeightRatio: 0.24,
    deviceWidthRatio: 0.84,
    copyBand: 0.16,
    copyScale: 0.95,
    // why: two player boards put an upside-down seat on top, so their tiles show the whole device or its bottom half; ten seats show the whole device.
    template: [
      "hero",
      "classic",
      "tilt",
      "hero",
      "tilt-right",
      "classic",
      "copy-below",
      "copy-below",
      "offset",
      "hero",
    ],
  },

  store: {
    name: "Scryve",
    subtitle: byLocale((copy) => copy.listing.subtitle),
    developer: "Sowing Hope",
    category: "Games",
    rating: 4.8,
    ratingCount: "120 Ratings",
    ageRating: "4+",
    price: "Free",
    description: byLocale((copy) =>
      [
        copy.listing.description.players,
        copy.listing.description.play,
        copy.listing.description.decks,
      ].join("\n\n"),
    ),
  },

  scenes: [
    screenshot("connected", "connected"),
    screenshot("ten-players", "tenPlayers"),
    screenshot("commander-damage", "commanderDamage"),
    screenshot("two-headed-giant", "twoHeadedGiant"),
    screenshot("chess-clock", "chessClock"),
    screenshot("best-of", "bestOf"),
    screenshot("pokemon", "pokemon"),
    screenshot("rules", "rules"),
    screenshot("decks", "decks"),
    screenshot("history", "history"),
    {
      kind: "preview",
      id: "preview",
      // why: preview.yaml films only after it reaches a live board, so the video never opens on the splash.
      segments: [{ id: "play", flow: "preview" }],
    },
  ],
}

export default config
