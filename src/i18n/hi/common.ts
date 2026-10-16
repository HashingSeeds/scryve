// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  back: "वापस",
  cancel: "रद्द करें",
  close: "बंद करें",
  delete: "हटाएँ",
  done: "हो गया",
  edit: "संपादित करें",
  remove: "निकालें",
  retry: "फिर कोशिश करें",
  save: "सहेजें",
  tryAgain: "फिर कोशिश करें",
  undo: "पूर्ववत करें",
  emptyState: {
    heading: "यहाँ अभी कुछ नहीं है",
    content: "कोई डेटा नहीं मिला। रीफ़्रेश करें या ऐप फिर से लोड करें।",
  },
} satisfies LocaleNamespace
