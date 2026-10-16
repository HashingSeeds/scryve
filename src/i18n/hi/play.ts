// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  playerNames: "खिलाड़ियों के नाम",
  startGame: "गेम शुरू करें",
  finish: "समाप्त करें",
  abandon: "छोड़ दें",
  ending: "समाप्त हो रहा है…",
  gameSummary: "गेम का सारांश",
  noGames: "अभी कोई गेम नहीं",
  noGamesContent: "पूरे हुए गेम यहाँ दिखेंगे।",
} satisfies LocaleNamespace
