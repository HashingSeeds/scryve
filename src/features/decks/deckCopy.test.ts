import { i18n } from "@/i18n"
import { PSEUDO_LOCALE } from "@/i18n/format"
import { translateForStorage } from "@/i18n/translate"

import { deckVersionLabel, recordSummary, storedVersionName } from "./deckCopy"

it("rates a deck only on games with a recorded outcome, like the Stats screen", () => {
  expect(recordSummary({ games: 12, wins: 6, losses: 3, draws: 0, unknown: 3 })).toBe("6-3")
  expect(recordSummary({ games: 12, wins: 7, losses: 3, draws: 0, unknown: 2 })).toBe("70% of 10")
  expect(recordSummary({ games: 3, wins: 0, losses: 0, draws: 0, unknown: 3 })).toBe("0-0")
  expect(recordSummary({ games: 0, wins: 0, losses: 0, draws: 0, unknown: 0 })).toBe("No games yet")
})

it("translates only the server's default version name, and saves unnamed versions as plain text", async () => {
  await i18n.changeLanguage("fr-FR")
  try {
    expect(deckVersionLabel({ name: "Current", versionNumber: 1 }, 1)).toBe("Actuelle")
    expect(deckVersionLabel({ name: "Current", versionNumber: 2 }, 2)).toBe("Current")
  } finally {
    await i18n.changeLanguage("en-US")
  }
  await i18n.changeLanguage(PSEUDO_LOCALE)
  try {
    expect(deckVersionLabel({ versionNumber: 3 }, 4)).toBe("\u27e6Version \u0663\u27e7")
    expect(storedVersionName({ versionNumber: 3 }, 4)).toBe("Version 3")
    expect(deckVersionLabel({ versionNumber: 3 }, 4, translateForStorage)).toBe("Version 3")
  } finally {
    await i18n.changeLanguage("en-US")
  }
})
