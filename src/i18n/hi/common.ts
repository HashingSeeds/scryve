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
  appMenu: {
    more: "और",
    moreUpdateReady: "और, अपडेट तैयार है",
    settings: "सेटिंग",
    settingsUpdateReady: "सेटिंग, अपडेट तैयार है",
    account: "खाता",
    signIn: "साइन इन करें",
    closeMenu: "यूटिलिटी मेन्यू बंद करें",
  },
  appNavigation: {
    decks: "डेक",
    returnToGame: "गेम पर लौटें",
    play: "खेलें",
    backToLobby: "लॉबी पर वापस जाएँ",
  },
  confirmDialog: {
    cancelAction: "{{action}} रद्द करें",
  },
  retryableError: {
    retryingIn: "{{seconds}} सेकंड में फिर कोशिश होगी",
  },
  selectField: {
    none: "कोई नहीं",
    triggerLabel: "{{label}}, {{value}}",
    openHint: "{{label}} के विकल्प खोलता है",
    closeLabel: "{{label}} के विकल्प बंद करें",
  },
  valueField: {
    readoutLabel: "{{label}}, {{value}}",
    decrease: "{{label}} को {{step}} घटाएँ",
    increase: "{{label}} को {{step}} बढ़ाएँ",
    longPressHint: "इसे {{step}} बदलने के लिए देर तक दबाएँ।",
  },
} satisfies LocaleNamespace
