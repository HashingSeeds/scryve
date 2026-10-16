// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  playerNames: "Nombres de los jugadores",
  startGame: "Empezar partida",
  finish: "Terminar",
  abandon: "Abandonar",
  ending: "Terminando…",
  gameSummary: "Resumen de la partida",
  noGames: "Aún no hay partidas",
  noGamesContent: "Las partidas terminadas aparecerán aquí.",
} satisfies LocaleNamespace
