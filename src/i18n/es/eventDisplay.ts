// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  notFound: "No hay ningún evento con ese código",
  roundOf: "Ronda {{round}} de {{planned}}",
  round: "Ronda {{round}}",
  final: "Final",
  code: "Código",
  paused: "En pausa",
  time: "Tiempo",
  bye: "Bye",
  pairings: "Emparejamientos",
  standings: "Clasificación",
  players_one: "{{count}} jugador",
  players_many: "{{count}} de jugadores",
  players_other: "{{count}} jugadores",
  noPlayers: "Aún no hay jugadores",
  points: "Pts",
  record: "V-D-E",
  tableStatus: {
    open: "Jugando",
    reported: "Reportado",
    confirmed: "Confirmado",
  },
} satisfies LocaleNamespace
