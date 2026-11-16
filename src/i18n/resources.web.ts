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
  "play",
  "systems",
]

export const resources = {
  en: (): typeof import("./en").default => require("./en").default,
  es: (): Promise<typeof import("./es/language").default> =>
    import("./es/language").then((bundle) => bundle.default),
  fr: (): Promise<typeof import("./fr/language").default> =>
    import("./fr/language").then((bundle) => bundle.default),
  hi: (): Promise<typeof import("./hi/language").default> =>
    import("./hi/language").then((bundle) => bundle.default),
  ja: (): Promise<typeof import("./ja/language").default> =>
    import("./ja/language").then((bundle) => bundle.default),
  ko: (): Promise<typeof import("./ko/language").default> =>
    import("./ko/language").then((bundle) => bundle.default),
  ar: (): Promise<typeof import("./ar/language").default> =>
    import("./ar/language").then((bundle) => bundle.default),
}
