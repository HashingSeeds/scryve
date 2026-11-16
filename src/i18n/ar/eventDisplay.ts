// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  notFound: "لا يوجد حدث بهذا الرمز",
  roundOf: "الجولة {{round}} من {{planned}}",
  round: "الجولة {{round}}",
  final: "النهائي",
  code: "الرمز",
  paused: "متوقف مؤقتًا",
  time: "انتهى الوقت",
  bye: "إعفاء",
  pairings: "المواجهات",
  standings: "الترتيب",
  players_zero: "{{count}} لاعب",
  players_one: "{{count}} لاعب",
  players_two: "{{count}} لاعبين",
  players_few: "{{count}} لاعبين",
  players_many: "{{count}} لاعبًا",
  players_other: "{{count}} لاعب",
  noPlayers: "لا يوجد لاعبون بعد",
  points: "نقاط",
  record: "ف-خ-ت",
  tableStatus: {
    open: "قيد اللعب",
    reported: "تم الإبلاغ",
    confirmed: "مؤكدة",
  },
} satisfies LocaleNamespace
