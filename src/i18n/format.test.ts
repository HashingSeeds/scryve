import {
  formatDate,
  formatList,
  formatNumber,
  formatPercent,
  formatRecord,
  formatSigned,
  formatTime,
  joinParts,
  PSEUDO_LOCALE,
} from "./format"
import { translateForStorage } from "./translate"

import { i18n } from "."

const FSI = "\u2068"
const LRI = "\u2066"
const PDI = "\u2069"

// why: main bundles no Arabic copy yet, and i18next's en-US fallback never loads the "en" bundle.
i18n.addResourceBundle("ar-SA", "common", { separator: " · ", listSeparator: "، " })
i18n.addResourceBundle("ar-SA", "play", { summary: { playerCount_few: "{{count}} لاعبين" } })

async function inLanguage(language: string, run: () => void) {
  await i18n.changeLanguage(language)
  try {
    run()
  } finally {
    await i18n.changeLanguage("en-US")
  }
}

describe("format", () => {
  it("writes English numbers the way players do", () => {
    expect(formatNumber(8000)).toBe("8000")
    expect(formatNumber(12000)).toBe("12,000")
    expect(formatSigned(3)).toBe("+3")
    expect(formatSigned(-2)).toBe("\u22122")
    expect(formatSigned(0)).toBe("0")
    expect(formatPercent(0.53)).toBe("53%")
    expect(joinParts(["Magic", 40, undefined, "Commander"])).toBe("Magic · 40 · Commander")
  })

  it("uses each language's own separators", () =>
    inLanguage("fr-FR", () => {
      expect(formatNumber(12000)).toBe("12\u202f000")
      expect(formatPercent(0.53)).toMatch(/^53\s%$/)
    }))

  it("uses Arabic digits and keeps mixed text in order in Arabic", () =>
    inLanguage("ar-SA", () => {
      expect(formatNumber(40)).toBe("٤٠")
      expect(formatSigned(3)).toContain("+٣")
      expect(joinParts(["Magic", 40])).toBe(`${FSI}Magic${PDI} · ${FSI}٤٠${PDI}`)
      expect(formatRecord(3, 0, 1)).toBe(`${LRI}٣-٠-١${PDI}`)
      expect(formatList(["Ada", "Ben"])).toBe(`${FSI}Ada${PDI}، ${FSI}Ben${PDI}`)
      expect(formatDate(Date.UTC(1970, 5, 1), { year: "numeric", timeZone: "UTC" })).toBe("١٩٧٠")
    }))

  it("formats every number a translation interpolates", () =>
    inLanguage("ar-SA", () => {
      expect(i18n.t("play:summary.playerCount", { count: 4 })).toBe(`${FSI}٤${PDI} لاعبين`)
      expect(translateForStorage("play:summary.playerCount", { count: 4 })).toBe("4 لاعبين")
      expect(i18n.t("play:summary.playerCount", { count: 5 })).toBe(`${FSI}٥${PDI} لاعبين`)
    }))

  it("marks translated text and formatted numbers in the pseudo-locale", () =>
    inLanguage(PSEUDO_LOCALE, () => {
      expect(i18n.t("common:cancel")).toBe("\u27e6Cancel\u27e7")
      expect(i18n.t("play:summary.playerCount", { count: 4 })).toBe("\u27e6٤ players\u27e7")
      expect(formatSigned(-12)).toBe("\u2212١٢")
      expect(translateForStorage("play:summary.playerCount", { count: 4 })).toBe("4 players")
      expect(formatTime(Date.UTC(1970, 0, 1, 9, 5))).toMatch(/^\u27e6[^0-9]+\u27e7$/)
    }))
})
