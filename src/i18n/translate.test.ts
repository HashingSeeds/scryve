import { translate } from "./translate"

import { i18n } from "."

describe("translate", () => {
  it("returns what i18next returns, before and after caching", () => {
    const calls = [
      ["decks:cardSearch.title", undefined],
      ["decks:draft.entryLimit", { limit: 250 }],
      ["play:summary.playerCount", { count: 1 }],
      ["play:summary.playerCount", { count: 4 }],
    ] as const

    for (const [key, options] of calls) {
      const expected = i18n.t(key, options)
      expect(translate(key, options)).toBe(expected)
      expect(translate(key, options)).toBe(expected)
    }
    expect(translate("play:summary.playerCount", { count: 1 })).toBe("1 player")
    expect(translate("play:summary.playerCount", { count: 4 })).toBe("4 players")
  })

  it("follows language changes and added resources", async () => {
    const language = i18n.language
    expect(translate("play:summary.playerCount", { count: 4 })).toBe("4 players")
    try {
      await i18n.changeLanguage("es")
      expect(translate("play:summary.playerCount", { count: 4 })).toBe("4 jugadores")

      i18n.addResource("es", "play", "summary.playerCount_other", "{{count}} personas")
      expect(translate("play:summary.playerCount", { count: 4 })).toBe("4 personas")
    } finally {
      i18n.addResource("es", "play", "summary.playerCount_other", "{{count}} jugadores")
      await i18n.changeLanguage(language)
    }
    expect(translate("play:summary.playerCount", { count: 4 })).toBe("4 players")
  })
})
