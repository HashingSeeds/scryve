// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  relativeTime: {
    justNow: "à l'instant",
    minutes: "il y a {{minutes}} min",
    hours: "il y a {{hours}} h",
    days: "il y a {{days}} j",
  },
  resumeTitle: {
    hostingLobby: "Hôte · en attente du début",
    hostingActive: "Hôte · en cours",
    playingLobby: "Joueur · en attente du début",
    playingActive: "Joueur · en cours",
  },
  seatCount_one: "{{count}} place",
  seatCount_many: "{{count}} places",
  seatCount_other: "{{count}} places",
  allSeatsClaimed: "Toutes les places sont prises",
  waitingForPlayers_one: "En attente de {{count}} joueur de plus",
  waitingForPlayers_many: "En attente de {{count}} joueurs de plus",
  waitingForPlayers_other: "En attente de {{count}} joueurs de plus",
  decksRequired: "Decks obligatoires",
  decksOptional: "Decks facultatifs",
  yourSeat: "Votre place",
  seatNumber: "Place {{seat}}",
  noDeckSelected: "Aucun deck sélectionné",
  lobbyExit: {
    abandon: {
      title: "Abandonner ce lobby ?",
      message:
        "Cela ferme le lobby pour tout le monde et enregistre un résumé final. Action irréversible.",
      confirmText: "Abandonner le lobby",
    },
    leave: {
      title: "Quitter ce lobby ?",
      message:
        "Le lobby disparaît de votre liste de reprise. Les autres joueurs et leur historique ne changent pas.",
      confirmText: "Quitter le lobby",
    },
  },
  onlineOnly: {
    start:
      "Reconnectez-vous pour lancer la partie. Le lancement exige d'être en ligne et n'est jamais mis en file d'attente.",
    exit: "Reconnectez-vous pour quitter ou abandonner ce lobby. Ces actions exigent d'être en ligne et ne sont jamais mises en file d'attente.",
    join: "Reconnectez-vous pour prendre une place. Cette action exige d'être en ligne et n'est jamais mise en file d'attente.",
    deck: "Reconnectez-vous pour changer de deck. Le choix du deck exige d'être en ligne et n'est jamais mis en file d'attente.",
  },
} satisfies LocaleNamespace
