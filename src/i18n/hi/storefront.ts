// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  paywall: {
    title: "Scryve Pro",
    perks: {
      decks: "{{proDecks}} डेक तक सिंक करें (फ़्री में {{freeDecks}})",
      versions: "हर डेक के {{proVersions}} वर्शन रखें (फ़्री में {{freeVersions}})",
      compare: "अपनी लिस्ट आमने-सामने कंपेयर करें",
      seatMark: "शेयर्ड गेम में आपकी सीट पर Pro निशान",
      appIcons: "Pro ऐप आइकन",
    },
    save: "{{ product.relative_discount }} बचाएँ",
    perMonth: "सिर्फ़ {{ product.price_per_month }}/माह",
    billedAt: "{{ product.price_per_period_abbreviated }} पर बिल किया जाएगा।",
    continue: "आगे बढ़ें",
    restore: "रिस्टोर परचेज़ेज़",
    terms: "शर्तें",
    privacy: "गोपनीयता",
  },
} satisfies LocaleNamespace
