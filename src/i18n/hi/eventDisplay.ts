// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  notFound: "इस कोड का कोई इवेंट नहीं है",
  roundOf: "राउंड {{round}} / {{planned}}",
  round: "राउंड {{round}}",
  final: "फ़ाइनल",
  code: "कोड",
  paused: "रुका है",
  time: "समय खत्म",
  bye: "बाय",
  pairings: "पेयरिंग",
  standings: "स्टैंडिंग",
  players_one: "{{count}} खिलाड़ी",
  players_other: "{{count}} खिलाड़ी",
  noPlayers: "अभी कोई खिलाड़ी नहीं",
  points: "पॉइंट",
  record: "W-L-D",
  tableStatus: {
    open: "खेल रहे हैं",
    reported: "दर्ज हुआ",
    confirmed: "पुष्टि हुई",
  },
} satisfies LocaleNamespace
