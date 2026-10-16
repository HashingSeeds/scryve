// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  playerNames: "Noms des joueurs",
  startGame: "Lancer la partie",
  finish: "Terminer",
  abandon: "Abandonner",
  ending: "Fin en cours…",
  gameSummary: "Résumé de la partie",
  noGames: "Aucune partie",
  noGamesContent: "Les parties terminées apparaîtront ici.",
} satisfies LocaleNamespace
