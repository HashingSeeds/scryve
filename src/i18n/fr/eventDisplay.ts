// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  notFound: "Aucun événement avec ce code",
  roundOf: "Ronde {{round}} sur {{planned}}",
  round: "Ronde {{round}}",
  final: "Terminé",
  code: "Code",
  paused: "En pause",
  time: "Temps écoulé",
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
    open: "En cours",
    reported: "Résultat déclaré",
    confirmed: "Résultat confirmé",
  },
} satisfies LocaleNamespace
