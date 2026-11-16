// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.

export const namespaces = [
  "account",
  "board",
  "common",
  "connected",
  "decks",
  "errors",
  "eventDisplay",
  "events",
  "feedback",
  "permissions",
  "play",
  "systems",
]

export const resources = {
  en: (): typeof import("./en").default => require("./en").default,
  es: (): typeof import("./es/language").default => require("./es/language").default,
  fr: (): typeof import("./fr/language").default => require("./fr/language").default,
  hi: (): typeof import("./hi/language").default => require("./hi/language").default,
  ja: (): typeof import("./ja/language").default => require("./ja/language").default,
  ko: (): typeof import("./ko/language").default => require("./ko/language").default,
  ar: (): typeof import("./ar/language").default => require("./ar/language").default,
}
