// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.

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
  "play",
  "systems",
]

export const resources = {
  en: (): typeof import("./en").default => require("./en").default,
  es: (): typeof import("./es").default => require("./es").default,
  fr: (): typeof import("./fr").default => require("./fr").default,
  hi: (): typeof import("./hi").default => require("./hi").default,
  ja: (): typeof import("./ja").default => require("./ja").default,
  ko: (): typeof import("./ko").default => require("./ko").default,
}
