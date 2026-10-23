// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  notFound: "इस कोड वाला कोई इवेंट नहीं मिला",
  roundOf: "राउंड {{round}} / {{planned}}",
  round: "राउंड {{round}}",
  final: "फ़ाइनल",
  code: "कोड",
  paused: "रुका हुआ",
  time: "समय",
  bye: "बाय",
  pairings: "पेयरिंग",
  standings: "स्टैंडिंग",
  players_one: "{{count}} खिलाड़ी",
  players_other: "{{count}} खिलाड़ी",
  noPlayers: "अभी कोई खिलाड़ी नहीं",
  points: "पॉइंट",
  record: "W-L-D",
  tableStatus: {
    open: "खेल जारी",
    reported: "रिपोर्ट किया",
    confirmed: "पुष्टि हुई",
  },
} satisfies LocaleNamespace
