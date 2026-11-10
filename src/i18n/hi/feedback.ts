// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  support: {
    search: "मदद खोजें",
    yourFeedback: "आपका फ़ीडबैक",
    newCount_one: "{{count}} नया",
    newCount_other: "{{count}} नए",
    email: "सपोर्ट को ईमेल करें",
    emailDetail: "खाते या बिलिंग से जुड़े सवाल",
    suggestFeature: "कोई फ़ीचर सुझाएँ",
    reportBug: "बग की रिपोर्ट करें",
    noMatch: "“{{query}}” के लिए कोई जवाब नहीं मिला।",
    ask: "हमसे “{{query}}” के बारे में पूछें",
  },
  offline: "ऑफ़लाइन। कनेक्शन वापस आने तक आपका ड्राफ़्ट यहीं रहेगा।",
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
      feature: "आप इसका उपयोग कब करेंगे?",
      bug: "आपको क्या उम्मीद थी?",
    },
    addScreenshot: "स्क्रीनशॉट जोड़ें",
    removeScreenshot: "स्क्रीनशॉट हटाएँ",
    selectedScreenshot: "चुना गया स्क्रीनशॉट",
    screenshotFailed: "वह स्क्रीनशॉट नहीं जोड़ा जा सका। कोई दूसरी इमेज आज़माएँ।",
    notice:
      "किसी भी भाषा में लिखें। AI हमें इसे पढ़ने में मदद कर सकता है। <privacy>गोपनीयता</privacy>",
    includeAccount: "मेरा खाता शामिल करें",
    includeAccountHelper: "जवाब आपके डिवाइस पर सिंक होते हैं, और हमें आपका यूज़रनेम दिखता है।",
    sendFailed: "भेजा नहीं जा सका। फिर कोशिश करें।",
    rateLimited_one: "बहुत ज़्यादा बार भेजा गया। {{count}} मिनट बाद फिर कोशिश करें।",
    rateLimited_other: "बहुत ज़्यादा बार भेजा गया। {{count}} मिनट बाद फिर कोशिश करें।",
  },
  mine: {
    title: "आपका फ़ीडबैक",
    empty: "इस डिवाइस से अभी तक कुछ नहीं भेजा गया।",
    unread: "नया",
    deleteAll: "मेरा फ़ीडबैक मिटाएँ",
    deleteHint:
      "इस डिवाइस से भेजा गया फ़ीडबैक और आपके खाते के साथ भेजा गया सब कुछ हट जाएगा। Sentry को पहले ही भेजे जा चुके बग के विवरण वहीं रहेंगे।",
    deleteConfirmTitle: "आपका फ़ीडबैक मिटाएँ?",
    deleteConfirmBody:
      "इससे इस डिवाइस से भेजा गया फ़ीडबैक, आपके खाते के साथ भेजा गया सब कुछ और उनके जवाब हट जाएँगे। Sentry को पहले ही भेजे जा चुके बग विवरण वहीं रहेंगे।",
    delete: "मिटाएँ",
    deleteFailed: "आपका फ़ीडबैक नहीं हटाया जा सका। ऑनलाइन होने पर फिर से कोशिश करें।",
  },
  thread: {
    missing: "यह फ़ीडबैक अब मौजूद नहीं है।",
    you: "आप",
    team: "Scryve",
    replyPlaceholder: "कोई विवरण जोड़ें या सवाल का जवाब दें",
    send: "भेजें",
    sending: "भेजा जा रहा है…",
    sent: "भेज दिया गया",
    sendFailed: "भेजा नहीं जा सका। फिर कोशिश करें।",
    linked: "आपके खाते के साथ भेजा गया",
    linkedElsewhere: "किसी दूसरे खाते के साथ भेजा गया",
    notLinked: "आपके खाते के बिना भेजा गया।",
    includeAccount: "खाता जोड़ें",
    signInToSync: "सिंक करने के लिए साइन इन करें",
  },
  notifyPrompt: {
    title: "जवाबों के लिए नोटिफ़िकेशन पाएँ?",
    body: "जवाब किसी भी स्थिति में आपको यहीं Scryve में दिखेंगे।",
    notNow: "अभी नहीं",
    notify: "मुझे सूचित करें",
  },
  unavailable: "फ़ीडबैक के लिए Scryve का क्लाउड चाहिए, जो इस बिल्ड में सेट अप नहीं है।",
} satisfies LocaleNamespace
