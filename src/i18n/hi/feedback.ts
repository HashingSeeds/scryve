// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  support: {
    search: "मदद खोजें",
    yourFeedback: "आपका फ़ीडबैक",
    newCount_one: "{{count}} नया",
    newCount_other: "{{count}} नए",
    email: "सपोर्ट को ईमेल करें",
    emailDetail: "खाते या बिलिंग से जुड़े सवाल",
    suggestFeature: "फ़ीचर सुझाएँ",
    reportBug: "बग रिपोर्ट करें",
    noMatch: "“{{query}}” का कोई जवाब नहीं मिला।",
    ask: "हमसे “{{query}}” के बारे में पूछें",
  },
  offline: "ऑफ़लाइन। ऑनलाइन होने तक आपका ड्राफ़्ट यहीं रहेगा।",
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
      bug: "आपने क्या सोचा था?",
    },
    addScreenshot: "स्क्रीनशॉट जोड़ें",
    removeScreenshot: "स्क्रीनशॉट हटाएँ",
    selectedScreenshot: "चुना हुआ स्क्रीनशॉट",
    screenshotFailed: "यह स्क्रीनशॉट नहीं जुड़ पाया। कोई और इमेज आज़माएँ।",
    notice:
      "किसी भी भाषा में लिखें। AI इसे पढ़ने में हमारी मदद कर सकता है। <privacy>गोपनीयता</privacy>",
    includeAccount: "मेरा खाता शामिल करें",
    includeAccountHelper: "जवाब आपके डिवाइस पर सिंक होंगे, और हमें आपका यूज़रनेम दिखेगा।",
    sendFailed: "भेज नहीं पाए। फिर कोशिश करें।",
    rateLimited_one: "बहुत ज़्यादा बार भेजा गया। {{count}} मिनट बाद फिर कोशिश करें।",
    rateLimited_other: "बहुत ज़्यादा बार भेजा गया। {{count}} मिनट बाद फिर कोशिश करें।",
  },
  mine: {
    title: "आपका फ़ीडबैक",
    empty: "इस डिवाइस से अभी तक कुछ नहीं भेजा गया।",
    unread: "नया",
    deleteAll: "मेरा फ़ीडबैक हटाएँ",
    deleteHint:
      "इस डिवाइस से भेजा गया और आपके खाते से भेजा गया सब कुछ हट जाएगा। Sentry को पहले ही भेजे गए बग विवरण वहीं रहेंगे।",
    deleteConfirmTitle: "आपका फ़ीडबैक हटाएँ?",
    deleteConfirmBody:
      "इससे इस डिवाइस से भेजा गया और आपके खाते से भेजा गया सब कुछ, जवाबों समेत, हट जाएगा। Sentry को पहले ही भेजे गए बग विवरण वहीं रहेंगे।",
    delete: "हटाएँ",
    deleteFailed: "आपका फ़ीडबैक नहीं हट पाया। ऑनलाइन होने पर फिर कोशिश करें।",
  },
  thread: {
    missing: "यह फ़ीडबैक अब नहीं है।",
    you: "आप",
    team: "Scryve",
    replyPlaceholder: "कोई विवरण जोड़ें या सवाल का जवाब दें",
    send: "भेजें",
    sending: "भेजा जा रहा है…",
    sent: "भेज दिया",
    sendFailed: "भेज नहीं पाए। फिर कोशिश करें।",
    linked: "आपके खाते के साथ भेजा गया",
    linkedElsewhere: "किसी दूसरे खाते के साथ भेजा गया",
    notLinked: "आपके खाते के बिना भेजा गया।",
    includeAccount: "खाता जोड़ें",
    signInToSync: "सिंक करने के लिए साइन इन करें",
  },
  notifyPrompt: {
    title: "जवाब आने पर नोटिफ़िकेशन चाहिए?",
    body: "जवाब दोनों हालत में Scryve में यहीं दिखेंगे।",
    notNow: "अभी नहीं",
    notify: "मुझे बताएँ",
  },
  unavailable: "फ़ीडबैक के लिए Scryve का क्लाउड चाहिए, जो इस बिल्ड में सेट अप नहीं है।",
} satisfies LocaleNamespace
