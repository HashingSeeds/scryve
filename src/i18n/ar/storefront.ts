// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  paywall: {
    title: "اشتراك Scryve Pro",
    perks: {
      decks: "مزامنة المجموعات حتى {{proDecks}} (المجاني: {{freeDecks}})",
      versions: "الاحتفاظ بإصدارات لكل مجموعة حتى {{proVersions}} (المجاني: {{freeVersions}})",
      compare: "مقارنة قوائمك جنبًا إلى جنب",
      seatMark: "شارة Pro على مقعدك في المباريات المتصلة",
      appIcons: "أيقونات تطبيق خاصة باشتراك Pro",
    },
    save: "وفّر {{ product.relative_discount }}",
    perMonth: "فقط {{ product.price_per_month }} شهريًا",
    billedAt: "المبلغ المفوتر: {{ product.price_per_period_abbreviated }}.",
    continue: "متابعة",
    restore: "استعادة المشتريات",
    terms: "الشروط",
    privacy: "الخصوصية",
  },
} satisfies LocaleNamespace
