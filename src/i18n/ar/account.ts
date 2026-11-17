// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  openPlay: "الانتقال إلى اللعب",
  signIn: "تسجيل الدخول",
  localGamesStay: "تبقى المباريات المحلية على هذا الجهاز.",
  legal: {
    heading: "الشؤون القانونية",
    privacyPolicy: "سياسة الخصوصية",
    termsOfUse: "شروط الاستخدام",
    licenseAgreement: "اتفاقية الترخيص",
    licenseAgreementHint: "يفتح اتفاقية الترخيص القياسية من Apple في المتصفح",
    cookiePolicy: "سياسة ملفات تعريف الارتباط",
    gameContent: "محتوى الألعاب من جهات خارجية",
    licenseOpenFailed: "تعذّر فتح اتفاقية الترخيص",
  },
  accountData: {
    label: "الحساب والبيانات",
    accessibilityLabel: "الحساب والبيانات",
    accessibilityHint: "يفتح حذف الحساب وتفاصيل البيانات",
  },
  shareUsage: "مشاركة بيانات الاستخدام مع Scryve",
  settings: {
    title: "الإعدادات",
    localDefaults: "الإعدادات الافتراضية للمباراة المحلية",
    general: "عام",
    appearance: "المظهر",
    about: "حول التطبيق",
    version: "الإصدار",
    players: "عدد اللاعبين",
    openScryveTo: "عند فتح Scryve، عرض",
    launchDestination: {
      play: "اللعب",
      decks: "المجموعات",
    },
    game: "اللعبة",
    chooseGame: "بدء المباريات الجديدة على",
    closeGameChoices: "إغلاق خيارات اللعبة",
    haptics: {
      label: "الاستجابة اللمسية",
    },
    theme: {
      heading: "السمة",
      system: "النظام",
      light: "فاتح",
      dark: "داكن",
    },
    appIcon: {
      heading: "أيقونة التطبيق",
      changeFailed: "تعذّر تغيير أيقونة التطبيق. حاول مرة أخرى.",
      lockedPro: "الأيقونة {{name}}، Scryve Pro",
      foilHeading: "Scryve Foil",
      opensPro: "يفتح Scryve Pro",
      proFailed: "تعذّر التحقق من اشتراك Scryve Pro، لذا أيقونات Pro مقفلة.",
      names: {
        Default: "الافتراضية",
        Two: "اثنتان",
        Three: "ثلاث",
        Midnight: "منتصف الليل",
        Graphite: "الجرافيت",
        Ink: "الحبر",
        Outline: "الإطار",
        Bone: "العاجي",
        Paper: "الورقي",
        Ash: "الرمادي",
        Pencil: "قلم الرصاص",
        Foil: "فويل",
        Contour: "الكفاف",
        Stripes: "الخطوط",
        Neon: "النيون",
        Blueprint: "المخطط الأزرق",
        Gilded: "المذهّب",
        Prism: "المنشور",
        Holo: "الهولو",
      },
    },
    notifications: {
      heading: "الإشعارات",
      feedbackReplies: "الردود على الملاحظات",
      feedbackRepliesHelper: "تظهر الردود دائمًا في ملاحظاتك",
      renewalReminders: "تذكيرات التجديد",
      renewalRemindersHelper_zero: "قبل تجديد اشتراكك بـ{{count}} يوم",
      renewalRemindersHelper_one: "قبل تجديد اشتراكك بيوم واحد",
      renewalRemindersHelper_two: "قبل تجديد اشتراكك بيومين",
      renewalRemindersHelper_few: "قبل تجديد اشتراكك بـ{{count}} أيام",
      renewalRemindersHelper_many: "قبل تجديد اشتراكك بـ{{count}} يومًا",
      renewalRemindersHelper_other: "قبل تجديد اشتراكك بـ{{count}} يوم",
      channel: "الردود والتذكيرات",
      feedbackReplyPreview: "رد جديد على ملاحظاتك",
      blockedTitle: "الإشعارات متوقفة",
      blockedBody: "فعّل الإشعارات لتطبيق Scryve من الإعدادات.",
      openSettings: "فتح الإعدادات",
    },
    privacy: {
      heading: "الخصوصية",
      shareUsageHelper:
        "متوقفة افتراضيًا. تشارك بيانات الاستخدام بمعرّف عشوائي غير مرتبط بحسابك. التفاصيل في سياسة الخصوصية.",
      saveFailed: "تعذّر حفظ اختيارك. حاول مرة أخرى.",
      unavailable:
        "مشاركة بيانات الاستخدام غير متاحة في هذا الإصدار. لن يتم إرسال أي أحداث إلى PostHog.",
    },
    appInfo: {
      heading: "معلومات التطبيق",
      analyticsId: "معرّف التحليلات: {{id}}",
      analyticsIdHint:
        "يساعدنا هذا المعرّف في العثور على بيانات استخدامك. لطلب حذفها، أرسل المعرّف إلى privacy@sowinghope.how.",
      version: "الإصدار: {{value}}",
      build: "رقم البناء: {{value}}",
      runtime: "بيئة التشغيل: {{value}}",
      update: "التحديث: {{value}}",
      channel: "القناة: {{value}}",
      platform: "المنصة: {{value}}",
      notApplicable: "لا ينطبق",
      unavailable: "غير متاح",
      bundled: "مضمّن",
      development: "تطوير",
    },
    beta: {
      label: "التحديثات التجريبية",
      helper: "تتيح الحصول على تحديثات غير منشورة قبل الجميع. قد تكون غير مستقرة.",
    },
    backToPreview: "العودة إلى النسخة المعاينة",
    backToPreviewFailed: "تعذّرت العودة إلى النسخة المعاينة. حاول مرة أخرى.",
    copyDebugInfo: "نسخ معلومات التصحيح",
    copied: "تم النسخ",
    copyFailed: "تعذّر النسخ. حاول مرة أخرى.",
    turns: {
      label: "الأدوار",
      helper: "يعرض صاحب الدور الحالي. اضغط على شارة الدور لتمرير الدور.",
    },
    syncStats: {
      label: "إحصاءات للمهتمين بالتفاصيل",
      helper:
        "يعرض المدة التي تستغرقها التغييرات للوصول إلى كل جهاز في المباريات المتصلة والمباريات القريبة، وكيف يعثر ماسح البطاقات على البطاقات.",
    },
  },
  support: {
    pageTitle: "دعم Scryve",
    pageDescription:
      "ابحث عن إجابات للأسئلة الشائعة، أو اقترح ميزة، أو أبلغ عن خلل، أو تواصل مع الدعم.",
    title: "الدعم",
    faq: {
      heading: "الأسئلة الشائعة",
      restorePro: {
        question: "استعادة اشتراك Scryve Pro",
        answer:
          "افتح Scryve، وانتقل إلى حسابك، واختر Scryve Pro، ثم اضغط على استعادة المشتريات. استخدم حساب Apple أو Google نفسه الذي تمت به عملية الشراء الأصلية.",
      },
      manageSubscription: {
        question: "إدارة الاشتراك أو إلغاؤه",
        answer:
          "تتم إدارة الاشتراكات من المتجر الذي تم الشراء منه. على iPhone أو iPad، افتح الإعدادات، واضغط على اسمك، ثم الاشتراكات. على Android، افتح Google Play، واضغط على ملفك الشخصي، ثم المدفوعات والاشتراكات.",
      },
      gameTrouble: {
        question: "هل هناك مشكلة في إحدى المباريات؟",
        answer:
          "أعد تشغيل Scryve وحاول مرة أخرى. إذا استمرت المشكلة، أبلغ عنها من هنا مع وصف موجز لما حدث.",
      },
      accountPrivacy: {
        question: "أسئلة عن الحساب أو الخصوصية",
        answer:
          "يمكنك إدارة حسابك من شاشة الحساب في Scryve. عند الحاجة إلى مساعدة في الوصول إلى حسابك أو حذفه، راسل الدعم عبر البريد الإلكتروني.",
      },
    },
  },
  profile: {
    title: "الحساب",
    signedIn: "تم تسجيل الدخول",
    yourAccount: "حسابك",
    profileAndSecurity: "الملف الشخصي والأمان",
    profileHint: "يفتح إدارة الملف الشخصي لتغيير الاسم وعناوين البريد الإلكتروني وكلمة المرور",
    profileDetails: "الاسم والبريد الإلكتروني وكلمة المرور وطرق تسجيل الدخول.",
    independence:
      "تطبيق Scryve مستقل وغير تابع للناشرين أو أصحاب الحقوق أو مزودي البيانات المذكورين في إشعار محتوى الألعاب، ولا يحظى بتأييدهم.",
    signingOut: "جارٍ تسجيل الخروج…",
    signOut: "تسجيل الخروج",
    signOutFailed: "تعذر تسجيل الخروج. حاول مرة أخرى.",
    signOutFailedShort: "تعذر تسجيل الخروج",
    signInPrompt: "سجّل الدخول قبل فتح ملفك الشخصي.",
    reauthenticate: "إعادة المصادقة",
  },
  deleteAccount: {
    title: "حذف الحساب",
    eyebrow: "الحساب والبيانات",
    heading: {
      needsAttention: "يحتاج حذف حسابك إلى انتباه",
      inProgress: "حذف حسابك قيد التنفيذ",
      before: "قبل حذف حسابك",
      completed: "تم حذف حسابك",
    },
    checkingStatus: "جارٍ التحقق من حالة الحذف…",
    intro:
      "سيؤدي هذا إلى حذف حساب Scryve نهائيًا وإخفاء هوية سجل اللعب عبر الأجهزة. راجع ما سيحدث أولًا.",
    steps: {
      cloud: {
        title: "حذف حسابك السحابي",
        body: "حذف ملفك الشخصي وصورتك الرمزية وبيانات تسجيل الدخول والدعوات وبيانات اللعب عبر الأجهزة المرتبطة بحسابك.",
      },
      history: {
        title: "إخفاء هوية سجل المباريات المشترك",
        body: "يحتفظ اللاعبون الآخرون بنتيجة المواجهة، لكن مقاعدك تتحول إلى إدخالات باسم «لاعب محذوف» غير مرتبطة بحسابك، مع صورة رمزية محايدة.",
      },
      local: {
        title: "تبقى المباريات المحلية على هذا الجهاز",
        body: "يُخزَّن سجل المباريات دون إنترنت على هذا الجهاز فقط. وهو غير مرتبط بحسابك ولا يُمسح عن بُعد.",
      },
      feedback: {
        title: "تبقى الملاحظات المرسلة دون حسابك",
        body: "تُحذف الملاحظات التي أُرفق بها حسابك. أما ما أُرسل دونه فيبقى مع الجهاز الذي أرسله. لإزالته، افتح الدعم، ثم ملاحظاتك، واضغط على حذف ملاحظاتي.",
      },
      signOut: {
        title: "تسجيل الخروج من جميع الأجهزة",
        body: "يتم تسجيل الخروج تلقائيًا من هذا الجهاز ومن أي أجهزة أخرى مسجَّل الدخول فيها.",
      },
    },
    subscription: {
      heading: "هل لديك اشتراك Scryve Pro؟",
      body: "حذف حسابك لا يلغي الاشتراك. قد يستمر الخصم إلى أن يُلغى الاشتراك من المتجر الذي تم الاشتراك منه. يمكنك الحذف الآن، لكن سيتم فقدان الوصول إلى أي مدة مدفوعة متبقية.",
      manageApple: "إدارة اشتراكات Apple",
      manageGoogle: "إدارة اشتراكات Google Play",
      web: "هل تم الاشتراك عبر الويب؟ ألغِ الاشتراك من بوابة العملاء. كل رسالة بريد إلكتروني خاصة بفوترة Scryve Pro تتضمن رابطًا إليها.",
      manageWeb: "إدارة اشتراك الويب",
    },
    signedInAs: "تم تسجيل الدخول بحساب {{email}}",
    confirmLabel: "اكتب {{word}} للمتابعة",
    submit: {
      submitting: "جارٍ إرسال الطلب…",
      retry: "إعادة محاولة حذف الحساب",
      delete: "حذف الحساب نهائيًا",
    },
    footnote: {
      retry:
        "تستأنف إعادة المحاولة من آخر خطوة غير مكتملة، ولا تتم استعادة البيانات التي أُخفيت هويتها.",
      first: "يبدأ الحذف فورًا ولا يمكن التراجع عنه بعد بدء المعالجة.",
    },
    status: {
      failed:
        "تعذر على Scryve الإكمال تلقائيًا. ارجع إلى هذه الصفحة وأرسل الطلب مرة أخرى لإعادة المحاولة.",
      identityPending:
        "تم إخفاء هوية بيانات اللعب عبر الأجهزة الخاصة بك. يجري الآن إزالة هوية تسجيل الدخول.",
      processing:
        "يجري إخفاء هوية سجل اللعب عبر الأجهزة وإزالة البيانات المرتبطة بالحساب. يمكنك إغلاق هذه الصفحة بأمان.",
    },
    panel: {
      failed: {
        title: "الحذف يحتاج إلى انتباه",
        body: "لن تتم استعادة أي بيانات من الحساب. اكتب {{word}} وأرسل الطلب مرة أخرى لإعادة محاولة ما تبقى من العمل.",
      },
      completed: {
        title: "اكتمل الحذف",
        body: "لا يحتوي هذا الإيصال على أي تفاصيل عن الحساب.",
      },
      received: {
        title: "تم استلام طلب الحذف",
        body: "يتم حظر أي نشاط جديد عبر الأجهزة أثناء معالجة الطلب.",
      },
    },
    receipt: {
      completedBody: "تمت إزالة حساب تسجيل الدخول وإخفاء هوية سجل اللعب عبر الأجهزة.",
      failedBody: "تعذر على Scryve إكمال ما تبقى من أعمال الحذف تلقائيًا.",
      lastUpdated: "آخر تحديث {{day}} في {{time}}",
      next: {
        completed: "لا يلزم أي إجراء آخر.",
        failed: "سجّل الدخول مرة أخرى، وارجع إلى هذه الصفحة، وأعد محاولة الطلب.",
        pending: "يمكنك إغلاق Scryve. ستواصل هذه الصفحة التحقق عند العودة.",
      },
      signInToRetry: "تسجيل الدخول لإعادة المحاولة",
      returnHome: "العودة إلى الصفحة الرئيسية",
    },
    route: {
      statusCheckFailed:
        "تعذر على Scryve التحقق من حالة الحذف. يبقى حذف الحساب غير متاح إلى أن ينجح التحقق.",
      signInPrompt: "سجّل الدخول لطلب حذف حساب Scryve الخاص بك.",
      checkingReceipt: "جارٍ التحقق من إيصال الحذف…",
      checkingAccount: "جارٍ التحقق من حسابك…",
      reconnect: "أعد الاتصال بـ Scryve قبل حذف حسابك.",
      submitFailed: "تعذر إرسال طلب الحذف",
    },
  },
  cloud: {
    signInToContinue: "سجّل الدخول للمتابعة.",
    chooseUsername: "اختر اسم المستخدم الخاص بك للعب.",
    reconnect: "أعد الاتصال للمتابعة.",
    chooseUsernameAction: "اختيار اسم المستخدم",
    unavailableHeading: "ميزات اللعب عبر الأجهزة غير متاحة",
    localPlayAvailable: "يبقى اللعب على جهاز واحد متاحًا.",
    notConfigured:
      "ميزات اللعب عبر الأجهزة غير متاحة في هذا الإصدار. يبقى اللعب على جهاز واحد متاحًا.",
  },
  billing: {
    proNeedsAccount:
      "اشتراك Scryve Pro مرتبط بحساب. سجّل الدخول للحصول على الاشتراك Pro أو لاستخدام الاشتراك Pro الذي لديك بالفعل.",
    renewalPrompt: {
      title: "هل تريد تذكيرًا قبل التجديد؟",
      body_zero: "تلقَّ إشعارًا قبل {{count}} يوم من خصم الاشتراك السنوي القادم.",
      body_one: "تلقَّ إشعارًا قبل يوم واحد من خصم الاشتراك السنوي القادم.",
      body_two: "تلقَّ إشعارًا قبل يومين من خصم الاشتراك السنوي القادم.",
      body_few: "تلقَّ إشعارًا قبل {{count}} أيام من خصم الاشتراك السنوي القادم.",
      body_many: "تلقَّ إشعارًا قبل {{count}} يومًا من خصم الاشتراك السنوي القادم.",
      body_other: "تلقَّ إشعارًا قبل {{count}} يوم من خصم الاشتراك السنوي القادم.",
      notNow: "ليس الآن",
      remind: "ذكّرني",
    },
    access: {
      checking: "جارٍ التحقق من الوصول…",
      renews: "يتجدد في {{date}}",
      availableUntil: "متاح حتى {{date}}",
      active: "الوصول إلى خطة {{plan}} مفعّل",
      unavailable: "الحالة غير متاحة",
      free: "الخطة المجانية",
    },
    loading: "جارٍ تحميل Scryve Pro",
    manage: "إدارة الاشتراك",
    manageAccessibilityLabel: "إدارة اشتراك Scryve {{plan}}",
    viewOptions: "عرض الخيارات",
    viewOptionsAccessibilityLabel: "عرض خيارات Scryve Pro",
    paywallFailedTitle: "لم يُفتح اشتراك Scryve Pro",
    notConfigured: "مشتريات Scryve Pro غير مهيأة.",
    missingApiKey:
      "عمليات شراء Scryve Pro غير متاحة لأن مفتاح RevenueCat العام لواجهة البرمجة غير مضبوط.",
    errors: {
      revenueCatNotConfigured: "خدمة RevenueCat غير مضبوطة.",
      unexpected: "حدث خطأ غير متوقع في عملية الشراء.",
      offline: "اتصل بالإنترنت ثم حاول مرة أخرى.",
      notAllowed: "عمليات الشراء غير مسموح بها على هذا الجهاز أو حساب المتجر.",
      productUnavailable: "خيار Scryve Pro هذا غير متاح في المتجر الحالي.",
      pending: "لا يزال المتجر يعالج عملية الشراء هذه. سيتحدث الوصول عند اكتمالها.",
      misconfigured: "اشتراك Scryve Pro غير مضبوط بشكل صحيح لهذا الإصدار من التطبيق.",
      failed: "تعذر إكمال عملية الشراء.",
      waitForBilling: "انتظر حتى يتصل نظام الفوترة بحسابك ثم حاول مرة أخرى.",
      foilWebOnly: "عمليات شراء Foil متاحة عبر الويب فقط.",
      manageBeforeFoil: "أدِر اشتراكك الحالي قبل الانتقال إلى Foil.",
      productNotInStore: "المنتج {{productId}} غير متاح في المتجر الحالي.",
      paywallFailed: "تعذر على شاشة اشتراك Scryve Pro إكمال الطلب.",
      noManagementPage: "لا توجد حتى الآن صفحة لإدارة الاشتراك لهذا العميل.",
    },
  },
  foil: {
    pageTitle: "داعم Scryve Foil",
    title: "داعم Foil",
    price: "الاشتراك السنوي: {{amount}} دولار أمريكي",
    description: "الميزات نفسها في Pro، مع دعم اختياري لتطبيق Scryve. يتجدد سنويًا حتى الإلغاء.",
    signInPrompt: "سجّل الدخول لربط اشتراك Foil بحسابك في Scryve.",
    alreadyPro: "لديك وصول Pro بالفعل. أدِر اشتراكك الحالي قبل تغيير الخطة.",
    manageSubscription: "إدارة الاشتراك",
    openingCheckout: "جارٍ فتح صفحة الدفع…",
    choose: "اختر داعم Foil",
    purchasesUnavailable: "عمليات الشراء غير متاحة في هذا الإصدار من التطبيق.",
  },
  legalDocument: {
    lastUpdated: "آخر تحديث: {{date}}",
  },
  updates: {
    downloading: "جارٍ تنزيل التحديث…",
    downloadingProgress: "تنزيل التحديث: {{progress, percent}}",
    ready: "التحديث جاهز",
    cancelReady: "إغلاق",
    restart: "إعادة التشغيل",
    whatsNew: "ما الجديد في هذا التحديث",
    dialogMessage: "يُطبَّق عند فتح تطبيق Scryve في المرة التالية. مباراتك محفوظة في الحالتين.",
    restartNow: "أعد التشغيل الآن",
    later: "لاحقًا",
    channelAfterRestart: "{{running}} ({{next}} بعد إعادة التشغيل)",
    restarting: "جارٍ إعادة تشغيل تطبيق Scryve",
  },
  preview: {
    heading: "معاينة طلب الدمج",
    loading: "جارٍ تحميل {{channel}}…",
    busy: "هناك معاينة أخرى لا تزال قيد التحميل. افتح هذا الرابط مرة أخرى.",
    missing:
      "القناة {{channel}} لا تحتوي على تحديث يمكن لهذا الإصدار تشغيله. قد تحتاج إلى إصدار معاينة جديد.",
  },
  launch: {
    starting: "جارٍ تشغيل تطبيق Scryve…",
    startingAccessibilityLabel: "جارٍ تشغيل تطبيق Scryve",
  },
  rootError: {
    title: "حدث خطأ ما",
    message:
      "واجه تطبيق Scryve خطأ غير متوقع. حاول مرة أخرى، أو أعد تشغيل التطبيق إذا استمرت المشكلة.",
  },
} satisfies LocaleNamespace
