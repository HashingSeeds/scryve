// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  notFound: "لا توجد فعالية بهذا الرمز",
  roundOf: "الجولة {{round}} من {{planned}}",
  round: "الجولة {{round}}",
  final: "النهائي",
  code: "الرمز",
  paused: "متوقف مؤقتًا",
  time: "انتهى الوقت",
  bye: "إعفاء",
  pairings: "توزيع الطاولات",
  standings: "الترتيب",
  players_zero: "عدد اللاعبين: {{count}}",
  players_one: "لاعب واحد",
  players_two: "لاعبان",
  players_few: "{{count}} لاعبين",
  players_many: "{{count}} لاعبًا",
  players_other: "{{count}} لاعب",
  noPlayers: "لا يوجد لاعبون بعد",
  points: "النقاط",
  record: "ف-خ-ت",
  tableStatus: {
    open: "قيد اللعب",
    reported: "تم تسجيل النتيجة",
    confirmed: "تم التأكيد",
  },
} satisfies LocaleNamespace
