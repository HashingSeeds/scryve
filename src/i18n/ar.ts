import en, { type Translations } from "./en"

const ar: Translations = {
  game: en.game,
  common: {
    ok: "حسنًا",
    cancel: "إلغاء",
    back: "رجوع",
  },
  landingScreen: {
    eyebrow: "عدّاد النقاط",
    title: "كل نقطة. كل لاعب. لوحة واحدة واضحة.",
    subtitle: "ابدأوا معًا على جهاز واحد، أو صِلوا الطاولة كلها عند وصول اللعب عبر الإنترنت.",
    quickLocalGame: "مباراة محلية سريعة",
    quickLocalGameHint: "لا يلزم حساب أو اتصال بالشبكة.",
    quickLocalGameAccessibilityHint: "ابدأ مباراة على هذا الجهاز. ستتوفر في مرحلة المنتج التالية.",
    joinConnectedGame: "انضم إلى مباراة متصلة",
    joinConnectedGameAccessibilityHint: "انضم إلى مباراة مشتركة بين الأجهزة. قريبًا.",
    signIn: "تسجيل الدخول",
    signInAccessibilityHint: "سجّل الدخول للعب المتصل. قريبًا.",
    status: "أساس المنتج جاهز. إعداد المباراة واللعب المتصل قادمان.",
    comingSoonTitle: "قريبًا",
    comingSoonMessage: "نقطة الدخول هذه جاهزة لمرحلة تنفيذ Scryve التالية.",
    dismissComingSoon: "حسنًا",
  },
  errorScreen: {
    title: "حدث خطأ ما",
    friendlySubtitle:
      "واجه Scryve خطأ غير متوقع. أعد تعيين التطبيق للعودة إلى حالة سليمة. إذا استمرت المشكلة، فأعد تشغيل عميل التطوير.",
    reset: "إعادة تعيين التطبيق",
  },
  emptyStateComponent: {
    generic: {
      heading: "لا يوجد شيء هنا بعد",
      content: "لم يتم العثور على بيانات. حاول تحديث التطبيق أو إعادة تحميله.",
      button: "حاول مرة أخرى",
    },
  },
}

export default ar
