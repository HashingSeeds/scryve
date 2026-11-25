// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  openPlay: "“खेलें” पर जाएँ",
  signIn: "साइन इन करें",
  localGamesStay: "लोकल गेम इसी डिवाइस पर रहते हैं।",
  legal: {
    heading: "कानूनी जानकारी",
    privacyPolicy: "गोपनीयता नीति",
    termsOfUse: "इस्तेमाल की शर्तें",
    licenseAgreement: "लाइसेंस एग्रीमेंट",
    licenseAgreementHint: "Apple का स्टैंडर्ड लाइसेंस एग्रीमेंट आपके ब्राउज़र में खुलता है",
    cookiePolicy: "कुकी पॉलिसी",
    gameContent: "थर्ड-पार्टी गेम कंटेंट",
    licenseOpenFailed: "लाइसेंस एग्रीमेंट नहीं खुल पाया",
  },
  accountData: {
    label: "खाता और डेटा",
    accessibilityLabel: "खाता और डेटा",
    accessibilityHint: "खाता हटाने और डेटा का विवरण खोलता है",
  },
  shareUsage: "Scryve के साथ इस्तेमाल का डेटा शेयर करें",
  settings: {
    title: "सेटिंग",
    localDefaults: "लोकल गेम के डिफ़ॉल्ट",
    general: "सामान्य",
    appearance: "दिखावट",
    about: "जानकारी",
    version: "वर्शन",
    players: "खिलाड़ी",
    openScryveTo: "Scryve खुलने पर दिखाएँ",
    launchDestination: {
      play: "खेलें",
      decks: "डेक",
    },
    game: "गेम",
    chooseGame: "नए गेम इससे शुरू करें",
    closeGameChoices: "गेम के विकल्प बंद करें",
    haptics: {
      label: "हैप्टिक फ़ीडबैक",
    },
    theme: {
      heading: "थीम",
      system: "सिस्टम",
      light: "लाइट",
      dark: "डार्क",
    },
    appIcon: {
      heading: "ऐप आइकन",
      changeFailed: "ऐप आइकन नहीं बदल पाया। दोबारा कोशिश करें।",
      lockedPro: "{{name}}, Scryve Pro",
      foilHeading: "Scryve Foil",
      opensPro: "Scryve Pro खोलता है",
      proFailed: "Scryve Pro की जाँच नहीं हो पाई, इसलिए Pro आइकन लॉक हैं।",
      names: {
        Default: "डिफ़ॉल्ट",
        Two: "टू",
        Three: "थ्री",
        Midnight: "मिडनाइट",
        Graphite: "ग्रेफ़ाइट",
        Ink: "इंक",
        Outline: "आउटलाइन",
        Bone: "बोन",
        Paper: "पेपर",
        Ash: "ऐश",
        Pencil: "पेंसिल",
        Foil: "Foil",
        Contour: "कंटूर",
        Stripes: "स्ट्राइप्स",
        Neon: "नियॉन",
        Blueprint: "ब्लूप्रिंट",
        Gilded: "गिल्डेड",
        Prism: "प्रिज़्म",
        Holo: "होलो",
      },
    },
    notifications: {
      heading: "नोटिफ़िकेशन",
      feedbackReplies: "फ़ीडबैक के जवाब",
      feedbackRepliesHelper: "जवाब हमेशा “आपका फ़ीडबैक” में दिखते हैं",
      renewalReminders: "रिन्यूअल रिमाइंडर",
      renewalRemindersHelper_one: "आपका सब्सक्रिप्शन रिन्यू होने से {{count}} दिन पहले",
      renewalRemindersHelper_other: "आपका सब्सक्रिप्शन रिन्यू होने से {{count}} दिन पहले",
      channel: "जवाब और रिमाइंडर",
      feedbackReplyPreview: "आपके फ़ीडबैक पर नया जवाब",
      blockedTitle: "नोटिफ़िकेशन बंद हैं",
      blockedBody: "सेटिंग में जाकर Scryve के नोटिफ़िकेशन चालू करें।",
      openSettings: "सेटिंग खोलें",
    },
    privacy: {
      heading: "गोपनीयता",
      shareUsageHelper:
        "शुरू में बंद रहता है। इस्तेमाल का डेटा एक रैंडम ID के साथ शेयर होता है, जो आपके खाते से जुड़ी नहीं होती। विवरण गोपनीयता नीति में है।",
      saveFailed: "आपकी पसंद सेव नहीं हो पाई। दोबारा कोशिश करें।",
      unavailable:
        "इस बिल्ड में इस्तेमाल शेयर करना उपलब्ध नहीं है। PostHog को कोई इवेंट नहीं भेजा जाएगा।",
      storeLinks: "स्टोर लिंक से Scryve को सपोर्ट करें",
      storeLinksHelper:
        "टीसीजीप्लेयर और कार्ड किंगडम के बाहरी लिंक में रेफ़रल टैग हो सकता है, इसके लिए आपको कोई अतिरिक्त पैसा नहीं देना पड़ता।",
    },
    appInfo: {
      heading: "ऐप की जानकारी",
      analyticsId: "एनालिटिक्स ID: {{id}}",
      analyticsIdHint:
        "यह ID हमें आपका इस्तेमाल डेटा ढूँढने में मदद करती है। इसे हटवाने के लिए यह ID privacy@sowinghope.how पर ईमेल करें।",
      version: "वर्शन: {{value}}",
      build: "बिल्ड: {{value}}",
      runtime: "रनटाइम: {{value}}",
      update: "अपडेट: {{value}}",
      channel: "चैनल: {{value}}",
      platform: "प्लेटफ़ॉर्म: {{value}}",
      notApplicable: "लागू नहीं",
      unavailable: "उपलब्ध नहीं",
      bundled: "बंडल्ड",
      development: "डेवलपमेंट",
    },
    beta: {
      label: "बीटा अपडेट",
      helper: "नए अपडेट बाकी लोगों से पहले पाएँ। इनमें गड़बड़ हो सकती है।",
    },
    backToPreview: "प्रीव्यू पर वापस जाएँ",
    backToPreviewFailed: "प्रीव्यू पर वापस नहीं जा पाया। दोबारा कोशिश करें।",
    copyDebugInfo: "डीबग जानकारी कॉपी करें",
    copied: "कॉपी हो गया",
    copyFailed: "कॉपी नहीं हो पाया। दोबारा कोशिश करें।",
    turns: {
      label: "टर्न",
      helper: "किसका टर्न है, यह दिखाता है। पास करने के लिए टर्न चिप पर टैप करें।",
    },
    syncStats: {
      label: "नर्ड्स के लिए स्टैट्स",
      helper:
        "ऑनलाइन और आस-पास के गेम में बदलाव हर डिवाइस तक पहुँचने में कितना समय लेते हैं, और कार्ड स्कैनर कार्ड कैसे ढूँढता है, यह दिखाता है।",
    },
  },
  support: {
    pageTitle: "Scryve सपोर्ट",
    pageDescription: "आम सवालों के जवाब पाएँ, कोई फ़ीचर सुझाएँ, बग बताएँ या सपोर्ट से संपर्क करें।",
    title: "सपोर्ट",
    faq: {
      heading: "अक्सर पूछे जाने वाले सवाल",
      restorePro: {
        question: "Scryve Pro रिस्टोर करें",
        answer:
          "Scryve खोलें, अपने खाते में जाएँ, Scryve Pro चुनें और “रिस्टोर परचेज़ेज़” पर टैप करें। वही Apple या Google खाता इस्तेमाल करें जिससे पहली बार खरीदा था।",
      },
      manageSubscription: {
        question: "सब्सक्रिप्शन मैनेज करें या रद्द करें",
        answer:
          "सब्सक्रिप्शन उसी स्टोर से मैनेज होते हैं जहाँ से आपने उन्हें खरीदा था। iPhone या iPad पर सेटिंग खोलें, अपने नाम पर टैप करें, फिर “सब्सक्रिप्शन” पर। Android पर Google Play खोलें, अपनी प्रोफ़ाइल पर टैप करें, फिर “पेमेंट्स और सब्सक्रिप्शन” पर।",
      },
      gameTrouble: {
        question: "गेम में दिक्कत आ रही है?",
        answer:
          "Scryve दोबारा खोलकर देखें। दिक्कत बनी रहे तो क्या हुआ, यह छोटे में लिखकर यहाँ बताएँ।",
      },
      accountPrivacy: {
        question: "खाते या गोपनीयता से जुड़े सवाल",
        answer:
          "आप Scryve की खाता स्क्रीन से अपना खाता मैनेज कर सकते हैं। खाते तक पहुँचने या उसे हटाने में मदद चाहिए तो सपोर्ट को ईमेल करें।",
      },
    },
  },
  profile: {
    title: "खाता",
    signedIn: "साइन इन है",
    yourAccount: "आपका खाता",
    profileAndSecurity: "प्रोफ़ाइल और सिक्योरिटी",
    profileHint: "प्रोफ़ाइल मैनेजर खुलता है, जहाँ आप अपना नाम, ईमेल पते और पासवर्ड बदल सकते हैं",
    profileDetails: "नाम, ईमेल, पासवर्ड और साइन-इन के तरीके।",
    independence:
      "Scryve स्वतंत्र है। हमारे गेम-कंटेंट नोटिस में बताए गए गेम पब्लिशर, राइट्स होल्डर या डेटा प्रोवाइडर से इसका कोई जुड़ाव नहीं है और न ही उनका समर्थन मिला है।",
    signingOut: "साइन आउट हो रहा है…",
    signOut: "साइन आउट करें",
    signOutFailed: "साइन आउट नहीं हो पाया। दोबारा कोशिश करें।",
    signOutFailedShort: "साइन आउट नहीं हो पाया",
    signInPrompt: "प्रोफ़ाइल खोलने से पहले साइन इन करें।",
    reauthenticate: "दोबारा साइन इन करें",
  },
  deleteAccount: {
    title: "खाता हटाएँ",
    eyebrow: "खाता और डेटा",
    heading: {
      needsAttention: "“खाता हटाने के अनुरोध पर ध्यान दें”",
      inProgress: "आपका खाता हटाया जा रहा है",
      before: "खाता हटाने से पहले",
      completed: "आपका खाता हट गया",
    },
    checkingStatus: "हटाने की स्थिति जाँची जा रही है…",
    intro:
      "इससे आपका Scryve खाता हमेशा के लिए हट जाएगा और आपकी कनेक्टेड हिस्ट्री गुमनाम हो जाएगी। पहले देख लें कि क्या होगा।",
    steps: {
      cloud: {
        title: "आपका क्लाउड खाता हट जाएगा",
        body: "आपकी प्रोफ़ाइल, अवतार, साइन-इन, इनवाइट और खाते से जुड़ा कनेक्टेड डेटा हट जाएगा।",
      },
      history: {
        title: "शेयर की गई मैच हिस्ट्री गुमनाम हो जाएगी",
        body: "बाकी खिलाड़ियों के पास मैच का नतीजा रहेगा, लेकिन आपकी सीट न्यूट्रल अवतार वाली, बिना लिंक की “हटाया गया खिलाड़ी” एंट्री बन जाएँगी।",
      },
      local: {
        title: "लोकल गेम इसी डिवाइस पर रहेंगे",
        body: "ऑफ़लाइन गेम हिस्ट्री सिर्फ़ इसी डिवाइस पर रहती है। वह आपके खाते से जुड़ी नहीं है और दूर से हटाई नहीं जाती।",
      },
      feedback: {
        title: "बिना खाते के भेजा गया फ़ीडबैक रहेगा",
        body: "जो फ़ीडबैक आपने खाते के साथ भेजा है, वह हट जाता है। बिना खाते के भेजा गया फ़ीडबैक उसी डिवाइस के पास रहता है जिससे भेजा था। उसे हटाने के लिए “सहायता” खोलें, फिर “आपका फ़ीडबैक” में जाएँ और “मेरा फ़ीडबैक हटाएँ” पर टैप करें।",
      },
      signOut: {
        title: "सभी डिवाइस साइन आउट हो जाएँगे",
        body: "यह डिवाइस और बाकी साइन इन डिवाइस अपने-आप साइन आउट हो जाएँगे।",
      },
    },
    subscription: {
      heading: "Scryve Pro सब्सक्रिप्शन है?",
      body: "खाता हटाने से सब्सक्रिप्शन रद्द नहीं होगा। जब तक आप उसे वहीं रद्द नहीं करते जहाँ से लिया था, पैसे कटते रह सकते हैं। आप अभी भी खाता हटा सकते हैं, लेकिन बचा हुआ पेड समय आपको नहीं मिलेगा।",
      manageApple: "Apple सब्सक्रिप्शन मैनेज करें",
      manageGoogle: "Google Play सब्सक्रिप्शन मैनेज करें",
      web: "वेब पर सब्सक्रिप्शन लिया था? कस्टमर पोर्टल में रद्द करें। Scryve Pro के हर बिलिंग ईमेल में उसका लिंक होता है।",
      manageWeb: "वेब सब्सक्रिप्शन मैनेज करें",
    },
    signedInAs: "{{email}} से साइन इन है",
    confirmLabel: "जारी रखने के लिए {{word}} टाइप करें",
    submit: {
      submitting: "अनुरोध भेजा जा रहा है…",
      retry: "खाता हटाना दोबारा आज़माएँ",
      delete: "खाता हमेशा के लिए हटाएँ",
    },
    footnote: {
      retry:
        "दोबारा कोशिश करने पर काम पिछले अधूरे स्टेप से आगे बढ़ता है; गुमनाम किया गया डेटा वापस नहीं आता।",
      first: "हटाना तुरंत शुरू हो जाता है और प्रोसेसिंग शुरू होने के बाद वापस नहीं लिया जा सकता।",
    },
    status: {
      failed:
        "Scryve अपने-आप पूरा नहीं कर पाया। दोबारा कोशिश करने के लिए इस पेज पर लौटें और अनुरोध फिर से भेजें।",
      identityPending:
        "आपका कनेक्टेड डेटा गुमनाम हो चुका है। Scryve अब आपकी साइन-इन पहचान हटा रहा है।",
      processing:
        "Scryve कनेक्टेड हिस्ट्री को गुमनाम कर रहा है और खाते से जुड़ा डेटा हटा रहा है। आप यह पेज बेफ़िक्र होकर बंद कर सकते हैं।",
    },
    panel: {
      failed: {
        title: "हटाने पर ध्यान देना ज़रूरी है",
        body: "खाते का कोई डेटा वापस नहीं आएगा। बचा हुआ काम पूरा करने के लिए {{word}} टाइप करें और फिर से भेजें।",
      },
      completed: {
        title: "खाता हट गया",
        body: "इस रसीद में खाते का कोई विवरण नहीं है।",
      },
      received: {
        title: "हटाने का अनुरोध मिल गया",
        body: "अनुरोध प्रोसेस होने तक नई कनेक्टेड गतिविधि बंद रहेगी।",
      },
    },
    receipt: {
      completedBody: "Scryve ने आपका साइन-इन खाता हटा दिया और आपकी कनेक्टेड हिस्ट्री गुमनाम कर दी।",
      failedBody: "Scryve हटाने का बचा हुआ काम अपने-आप पूरा नहीं कर पाया।",
      lastUpdated: "आखिरी अपडेट {{day}}, {{time}}",
      next: {
        completed: "आगे कुछ करने की ज़रूरत नहीं है।",
        failed: "दोबारा साइन इन करें, इस पेज पर लौटें और अनुरोध फिर से भेजें।",
        pending: "आप Scryve बंद कर सकते हैं। आपके लौटने पर यह पेज फिर से जाँच करता रहेगा।",
      },
      signInToRetry: "दोबारा कोशिश के लिए साइन इन करें",
      returnHome: "होम पर लौटें",
    },
    route: {
      statusCheckFailed:
        "Scryve आपके हटाने की स्थिति नहीं जाँच पाया। जाँच सफल होने तक खाता हटाना उपलब्ध नहीं रहेगा।",
      signInPrompt: "अपना Scryve खाता हटाने का अनुरोध करने के लिए साइन इन करें।",
      checkingReceipt: "आपकी हटाने की रसीद जाँची जा रही है…",
      checkingAccount: "आपका खाता जाँचा जा रहा है…",
      reconnect: "खाता हटाने से पहले Scryve से दोबारा कनेक्ट करें।",
      submitFailed: "हटाने का अनुरोध नहीं भेज पाए",
    },
  },
  cloud: {
    signInToContinue: "जारी रखने के लिए साइन इन करें।",
    chooseUsername: "अपना खिलाड़ी यूज़रनेम चुनें।",
    reconnect: "जारी रखने के लिए दोबारा कनेक्ट करें।",
    chooseUsernameAction: "यूज़रनेम चुनें",
    unavailableHeading: "कनेक्टेड फ़ीचर उपलब्ध नहीं हैं",
    localPlayAvailable: "लोकल गेम खेल सकते हैं।",
    notConfigured: "इस बिल्ड में कनेक्टेड फ़ीचर उपलब्ध नहीं हैं। लोकल गेम खेल सकते हैं।",
  },
  billing: {
    proNeedsAccount:
      "Scryve Pro खाते से जुड़ा है। Pro लेने या अपना मौजूदा Pro इस्तेमाल करने के लिए साइन इन करें।",
    signInPrompt: {
      title: "Pro अपने सभी डिवाइस पर रखना चाहते हैं?",
      body: "अपने बाकी डिवाइस और वेब पर Scryve Pro इस्तेमाल करने के लिए साइन इन करें।",
      notNow: "अभी नहीं",
    },
    renewalPrompt: {
      title: "रिन्यू होने से पहले याद दिलाएँ?",
      body_one: "अगले सालाना चार्ज से {{count}} दिन पहले नोटिफ़िकेशन पाएँ।",
      body_other: "अगले सालाना चार्ज से {{count}} दिन पहले नोटिफ़िकेशन पाएँ।",
      notNow: "अभी नहीं",
      remind: "याद दिलाएँ",
    },
    access: {
      checking: "एक्सेस जाँचा जा रहा है…",
      renews: "{{date}} को रिन्यू होगा",
      availableUntil: "{{date}} तक उपलब्ध",
      active: "{{plan}} एक्सेस चालू है",
      unavailable: "स्थिति उपलब्ध नहीं",
      free: "फ़्री प्लान",
    },
    loading: "Scryve Pro लोड हो रहा है",
    manage: "मैनेज करें",
    manageAccessibilityLabel: "Scryve {{plan}} सब्सक्रिप्शन मैनेज करें",
    viewOptions: "विकल्प देखें",
    viewOptionsAccessibilityLabel: "Scryve Pro के विकल्प देखें",
    paywallFailedTitle: "Scryve Pro नहीं खुला",
    notConfigured: "Scryve Pro की खरीदारी सेट नहीं है।",
    missingApiKey:
      "Scryve Pro की खरीदारी अभी उपलब्ध नहीं है, क्योंकि RevenueCat की पब्लिक API कुंजी सेट नहीं है।",
    errors: {
      revenueCatNotConfigured: "RevenueCat सेट नहीं है।",
      unexpected: "खरीदारी में अचानक कोई गड़बड़ी हो गई।",
      offline: "इंटरनेट से कनेक्ट करें और दोबारा कोशिश करें।",
      notAllowed: "इस डिवाइस या स्टोर खाते से खरीदारी की इजाज़त नहीं है।",
      productUnavailable: "मौजूदा स्टोर पर Scryve Pro का यह विकल्प उपलब्ध नहीं है।",
      pending: "स्टोर अभी इस खरीदारी को प्रोसेस कर रहा है। पूरी होते ही एक्सेस अपडेट हो जाएगा।",
      misconfigured: "इस बिल्ड के लिए Scryve Pro ठीक से सेट नहीं है।",
      failed: "खरीदारी पूरी नहीं हो सकी।",
      waitForBilling: "बिलिंग के आपके खाते से कनेक्ट होने का इंतज़ार करें, फिर दोबारा कोशिश करें।",
      foilWebOnly: "Foil की खरीदारी सिर्फ़ वेब पर हो सकती है।",
      manageBeforeFoil: "Foil पर जाने से पहले अपना मौजूदा सब्सक्रिप्शन मैनेज करें।",
      productNotInStore: "{{productId}} मौजूदा स्टोर पर उपलब्ध नहीं है।",
      paywallFailed: "Scryve Pro पेवॉल अनुरोध पूरा नहीं कर सका।",
      noManagementPage: "इस कस्टमर के लिए सब्सक्रिप्शन मैनेज करने का पेज अभी उपलब्ध नहीं है।",
    },
  },
  foil: {
    pageTitle: "Scryve Foil Supporter",
    title: "Foil Supporter",
    price: "US${{amount}}/साल",
    description:
      "वही Pro फ़ीचर। Scryve के लिए वैकल्पिक सपोर्ट। रद्द करने तक हर साल रिन्यू होता है।",
    signInPrompt: "Foil को अपने Scryve खाते से जोड़ने के लिए साइन इन करें।",
    alreadyPro:
      "आपके पास पहले से Pro एक्सेस है। प्लान बदलने से पहले अपना मौजूदा सब्सक्रिप्शन मैनेज करें।",
    manageSubscription: "सब्सक्रिप्शन मैनेज करें",
    openingCheckout: "चेकआउट खुल रहा है…",
    choose: "Foil Supporter चुनें",
    purchasesUnavailable: "इस बिल्ड में खरीदारी उपलब्ध नहीं है।",
  },
  legalDocument: {
    lastUpdated: "आखिरी अपडेट: {{date}}",
  },
  updates: {
    downloading: "अपडेट डाउनलोड हो रहा है…",
    downloadingProgress: "अपडेट डाउनलोड हो रहा है {{progress, percent}}",
    ready: "अपडेट तैयार है",
    cancelReady: "बंद करें",
    restart: "रीस्टार्ट करें",
    whatsNew: "इस अपडेट में क्या है",
    dialogMessage: "अगली बार Scryve खोलने पर लागू होगा। आपका गेम हर हाल में सेव रहेगा।",
    restartNow: "अभी रीस्टार्ट करें",
    later: "बाद में",
    channelAfterRestart: "{{running}} (रीस्टार्ट के बाद {{next}})",
    restarting: "Scryve रीस्टार्ट हो रहा है",
  },
  preview: {
    heading: "PR प्रीव्यू",
    loading: "{{channel}} लोड हो रहा है…",
    busy: "दूसरा प्रीव्यू अभी लोड हो रहा है। यह लिंक दोबारा खोलें।",
    missing:
      "{{channel}} में ऐसा कोई अपडेट नहीं है जो यह बिल्ड चला सके। शायद नया प्रीव्यू बिल्ड चाहिए।",
  },
  launch: {
    starting: "Scryve शुरू हो रहा है…",
    startingAccessibilityLabel: "Scryve शुरू हो रहा है",
  },
  rootError: {
    title: "कुछ गड़बड़ हो गई",
    message:
      "Scryve में अचानक एरर आ गया। दोबारा कोशिश करें, या समस्या बनी रहे तो ऐप रीस्टार्ट करें।",
  },
} satisfies LocaleNamespace
