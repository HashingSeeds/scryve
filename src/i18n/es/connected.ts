// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  relativeTime: {
    justNow: "ahora mismo",
    minutes: "hace {{minutes}} min",
    hours: "hace {{hours}} h",
    days: "hace {{days}} d",
  },
  resumeTitle: {
    hostingLobby: "Anfitrión · esperando para empezar",
    hostingActive: "Anfitrión · en curso",
    playingLobby: "Jugando · esperando para empezar",
    playingActive: "Jugando · en curso",
  },
  seatCount_one: "{{count}} asiento",
  seatCount_many: "{{count}} de asientos",
  seatCount_other: "{{count}} asientos",
  allSeatsClaimed: "Todos los asientos ocupados",
  waitingForPlayers_one: "Esperando a {{count}} jugador más",
  waitingForPlayers_many: "Esperando a {{count}} de jugadores más",
  waitingForPlayers_other: "Esperando a {{count}} jugadores más",
  decksRequired: "Mazos obligatorios",
  decksOptional: "Mazos opcionales",
  yourSeat: "Tu asiento",
  seatNumber: "Asiento {{seat}}",
  noDeckSelected: "Ningún mazo seleccionado",
  lobbyExit: {
    abandon: {
      title: "¿Abandonar esta sala?",
      message: "Esto cierra la sala para todos y guarda un resumen final. No se puede deshacer.",
      confirmText: "Abandonar sala",
    },
    leave: {
      title: "¿Salir de esta sala?",
      message:
        "La sala desaparece de tu lista de partidas por reanudar. Los demás jugadores y su historial no cambian.",
      confirmText: "Salir de la sala",
    },
  },
  onlineOnly: {
    start:
      "Reconéctate para empezar la partida. Empezar solo funciona con conexión y nunca se pone en cola.",
    exit: "Reconéctate para salir de esta sala o abandonarla. Estas acciones solo funcionan con conexión y nunca se ponen en cola.",
    join: "Reconéctate para ocupar un asiento. Ocupar un asiento solo funciona con conexión y nunca se pone en cola.",
    deck: "Reconéctate para cambiar de mazo. La elección de mazo solo funciona con conexión y nunca se pone en cola.",
  },
} satisfies LocaleNamespace
