// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  support: {
    search: "मदद खोजें",
    yourFeedback: "आपका फ़ीडबैक",
    newCount_one: "{{count}} नया",
    newCount_other: "{{count}} नए",
    email: "सपोर्ट को ईमेल करें",
    emailDetail: "खाते या बिलिंग के सवाल",
    suggestFeature: "फ़ीचर सुझाएँ",
    reportBug: "बग रिपोर्ट करें",
    noMatch: "“{{query}}” का कोई जवाब नहीं मिला।",
    ask: "“{{query}}” के बारे में हमसे पूछें",
  },
  offline: "ऑफ़लाइन। आपका ड्राफ़्ट वापस कनेक्ट होने तक यहीं रहेगा।",
  suggest: {
    title: "फ़ीडबैक भेजें",
    kind: "यह क्या है?",
    feature: "फ़ीचर",
    bug: "बग",
    prompt: {
      feature: "आप क्या देखना चाहेंगे?",
      bug: "क्या गड़बड़ हुई?",
    },
    bodyPlaceholder: {
      feature: "इसे कब इस्तेमाल करेंगे?",
      bug: "आपको क्या उम्मीद थी?",
    },
    addScreenshot: "स्क्रीनशॉट जोड़ें",
    removeScreenshot: "स्क्रीनशॉट हटाएँ",
    selectedScreenshot: "चुना हुआ स्क्रीनशॉट",
    screenshotFailed: "वह स्क्रीनशॉट नहीं जुड़ पाया। कोई दूसरी इमेज आज़माएँ।",
    notice:
      "किसी भी भाषा में लिखें। AI हमें इसे समझने में मदद कर सकता है। <privacy>गोपनीयता</privacy>",
    includeAccount: "मेरा खाता साथ भेजें",
    includeAccountHelper: "जवाब आपके डिवाइस पर सिंक होंगे, और हमें आपका यूज़रनेम दिखेगा।",
    sendFailed: "भेज नहीं पाए। दोबारा कोशिश करें।",
    rateLimited_one: "बहुत ज़्यादा बार भेज दिया। {{count}} मिनट बाद दोबारा कोशिश करें।",
    rateLimited_other: "बहुत ज़्यादा बार भेज दिया। {{count}} मिनट बाद दोबारा कोशिश करें।",
  },
  mine: {
    title: "आपका फ़ीडबैक",
    empty: "इस डिवाइस से अभी तक कुछ नहीं भेजा गया।",
    unread: "नया",
    deleteAll: "मेरा फ़ीडबैक हटाएँ",
    deleteHint:
      "इस डिवाइस से भेजा गया और आपके खाते के साथ भेजा गया सब हट जाएगा। Sentry को भेजी जा चुकी बग की डिटेल वहीं रहेगी।",
    deleteConfirmTitle: "आपका फ़ीडबैक हटाएँ?",
    deleteConfirmBody:
      "इससे इस डिवाइस से भेजा गया और आपके खाते के साथ भेजा गया सब, जवाबों समेत, हट जाएगा। Sentry को भेजी जा चुकी बग की डिटेल वहीं रहेगी।",
    delete: "हटाएँ",
    deleteFailed: "आपका फ़ीडबैक नहीं हट पाया। ऑनलाइन होने पर दोबारा कोशिश करें।",
  },
  thread: {
    missing: "यह फ़ीडबैक अब नहीं है।",
    you: "आप",
    team: "Scryve",
    replyPlaceholder: "कोई डिटेल जोड़ें या सवाल का जवाब दें",
    send: "भेजें",
    sending: "भेज रहे हैं…",
    sent: "भेज दिया",
    sendFailed: "भेज नहीं पाए। दोबारा कोशिश करें।",
    linked: "आपके खाते के साथ भेजा गया",
    linkedElsewhere: "किसी दूसरे खाते के साथ भेजा गया",
    notLinked: "आपके खाते के बिना भेजा गया।",
    includeAccount: "खाता जोड़ें",
    signInToSync: "सिंक करने के लिए साइन इन करें",
  },
  notifyPrompt: {
    title: "जवाबों का नोटिफ़िकेशन चाहिए?",
    body: "जवाब हर हाल में यहीं Scryve में दिखेंगे।",
    notNow: "अभी नहीं",
    notify: "नोटिफ़ाई करें",
  },
  unavailable: "फ़ीडबैक के लिए Scryve का क्लाउड चाहिए, जो इस बिल्ड में सेट नहीं है।",
} satisfies LocaleNamespace
