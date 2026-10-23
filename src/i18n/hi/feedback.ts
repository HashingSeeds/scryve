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
    suggest: "कोई फ़ीचर सुझाएँ या बग बताएँ",
    noMatch: "“{{query}}” के लिए कोई जवाब नहीं मिला।",
    ask: "हमसे “{{query}}” के बारे में पूछें",
  },
  offline: "ऑफ़लाइन। आपके लौटने तक आपका ड्राफ़्ट यहीं रहेगा।",
  suggest: {
    title: "फ़ीडबैक भेजें",
    kind: "यह क्या है?",
    feature: "फ़ीचर",
    bug: "बग",
    bodyLabel: "संदेश",
    bodyPlaceholder: {
      feature: "आप क्या चाहते हैं, और इसका उपयोग कब करेंगे?",
      bug: "क्या हुआ? आपने क्या उम्मीद की थी?",
    },
    addScreenshot: "स्क्रीनशॉट जोड़ें",
    removeScreenshot: "स्क्रीनशॉट हटाएँ",
    selectedScreenshot: "चुना गया स्क्रीनशॉट",
    screenshotFailed: "वह स्क्रीनशॉट नहीं जोड़ा जा सका। कोई दूसरी इमेज आज़माएँ।",
    bugDisclosure:
      "बग रिपोर्ट के साथ आपके डिवाइस का विवरण और कोई भी स्क्रीनशॉट Sentry को भी भेजा जाता है।",
    translationNotice:
      "किसी भी भाषा में लिखें। हम इसका अनुवाद करने के लिए AI टूल का उपयोग कर सकते हैं। हमारी <privacy>निजता नीति</privacy> देखें।",
    includeAccount: "मेरा खाता शामिल करें",
    includeAccountHelper:
      "जवाब आपके हर उस डिवाइस पर दिखेंगे जिस पर आप साइन इन करते हैं, और हमें आपका यूज़रनेम दिखेगा।",
    anonymous:
      "आपके खाते के बिना भेजा गया। जवाब इसी डिवाइस पर दिखेंगे, और ऐप दोबारा इंस्टॉल करने पर वे खो सकते हैं।",
    signInToKeep: "सेव रखने के लिए साइन इन करें",
    send: "भेजें",
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
      "इस डिवाइस से भेजा गया फ़ीडबैक हट जाएगा। Sentry को पहले ही भेजे जा चुके बग के विवरण वहीं रहेंगे।",
    deleteConfirmTitle: "आपका फ़ीडबैक मिटाएँ?",
    deleteConfirmBody:
      "इससे इस डिवाइस से भेजा गया फ़ीडबैक और उसके जवाब हट जाएँगे। Sentry को पहले ही भेजे जा चुके बग विवरण वहीं रहेंगे।",
    delete: "मिटाएँ",
    deleteFailed: "आपका फ़ीडबैक नहीं हटाया जा सका। ऑनलाइन होने पर फिर से कोशिश करें।",
  },
  thread: {
    missing: "यह फ़ीडबैक अब मौजूद नहीं है।",
    you: "आप",
    team: "Scryve",
    replyLabel: "जवाब",
    replyPlaceholder: "कोई विवरण जोड़ें या सवाल का जवाब दें",
    send: "भेजें",
    sendFailed: "भेजा नहीं जा सका। फिर कोशिश करें।",
    includeAccount: "मेरा खाता शामिल करें",
    includeAccountHelper: "इससे हमें आपका यूज़रनेम दिखता है और यह थ्रेड आपके हर डिवाइस पर रहता है।",
    linked: "आपके खाते के साथ भेजा गया",
    linkedElsewhere: "किसी दूसरे खाते के साथ भेजा गया",
    signInToKeep: "ऐप दोबारा इंस्टॉल करने पर भी यह थ्रेड रखने के लिए साइन इन करें",
  },
  unavailable: "फ़ीडबैक के लिए Scryve का क्लाउड चाहिए, जो इस बिल्ड में सेट अप नहीं है।",
} satisfies LocaleNamespace
