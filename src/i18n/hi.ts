import en, { type Translations } from "./en"

const hi: Translations = {
  localGame: en.localGame,
  common: {
    ok: "ठीक है",
    cancel: "रद्द करें",
    back: "वापस",
  },
  landingScreen: {
    eyebrow: "लाइफ़ काउंटर",
    title: "हर अंक। हर खिलाड़ी। एक साफ़ बोर्ड।",
    subtitle: "एक डिवाइस पर साथ शुरू करें, या ऑनलाइन खेल आने पर पूरी मेज़ को जोड़ें।",
    quickLocalGame: "तुरंत लोकल गेम",
    quickLocalGameHint: "खाता या नेटवर्क आवश्यक नहीं है।",
    quickLocalGameAccessibilityHint: "इस डिवाइस पर गेम शुरू करें। अगले उत्पाद चरण में उपलब्ध होगा।",
    joinConnectedGame: "कनेक्टेड गेम में शामिल हों",
    joinConnectedGameAccessibilityHint: "कई डिवाइसों पर साझा गेम में शामिल हों। जल्द आ रहा है।",
    signIn: "साइन इन करें",
    signInAccessibilityHint: "कनेक्टेड खेल के लिए साइन इन करें। जल्द आ रहा है।",
    status: "उत्पाद की नींव तैयार है। गेम सेटअप और कनेक्टेड खेल आगे आएँगे।",
    comingSoonTitle: "जल्द आ रहा है",
    comingSoonMessage: "यह प्रवेश बिंदु Scryve के अगले कार्यान्वयन चरण के लिए तैयार है।",
    dismissComingSoon: "समझ गया",
  },
  errorScreen: {
    title: "कुछ गलत हो गया",
    friendlySubtitle:
      "Scryve में एक अनपेक्षित त्रुटि हुई। साफ़ स्थिति में लौटने के लिए ऐप रीसेट करें। समस्या जारी रहे तो डेवलपमेंट क्लाइंट पुनः शुरू करें।",
    reset: "ऐप रीसेट करें",
  },
  emptyStateComponent: {
    generic: {
      heading: "अभी यहाँ कुछ नहीं है",
      content: "कोई डेटा नहीं मिला। ऐप को रीफ़्रेश या पुनः लोड करें।",
      button: "फिर कोशिश करें",
    },
  },
}

export default hi
