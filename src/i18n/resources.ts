// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.

// why: a locale's modules run only when i18next asks for that language, so launch skips the unused ones.
export const resources = {
  en: (): typeof import("./en").default => require("./en").default,
  es: (): typeof import("./es").default => require("./es").default,
  fr: (): typeof import("./fr").default => require("./fr").default,
  hi: (): typeof import("./hi").default => require("./hi").default,
  ja: (): typeof import("./ja").default => require("./ja").default,
  ko: (): typeof import("./ko").default => require("./ko").default,
}
