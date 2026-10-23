// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  notFound: "Aucun événement avec ce code",
  roundOf: "Ronde {{round}} sur {{planned}}",
  round: "Ronde {{round}}",
  final: "Finale",
  code: "Code",
  paused: "En pause",
  time: "Temps",
  bye: "Bye",
  pairings: "Appariements",
  standings: "Classement",
  players_one: "{{count}} joueur",
  players_many: "{{count}} de joueurs",
  players_other: "{{count}} joueurs",
  noPlayers: "Aucun joueur pour le moment",
  points: "Pts",
  record: "V-D-N",
  tableStatus: {
    open: "En jeu",
    reported: "Déclaré",
    confirmed: "Confirmé",
  },
} satisfies LocaleNamespace
