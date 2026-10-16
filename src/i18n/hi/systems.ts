// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  counterValue: {
    none_one: "{{count}} लाइफ़",
    none_other: "{{count}} लाइफ़",
    mtg_one: "{{count}} लाइफ़",
    mtg_other: "{{count}} लाइफ़",
    ygo_one: "{{count}} लाइफ़ पॉइंट",
    ygo_other: "{{count}} लाइफ़ पॉइंट",
    pokemon_one: "{{count}} प्राइज़ कार्ड",
    pokemon_other: "{{count}} प्राइज़ कार्ड",
  },
  counterChange: {
    none_one: "{{count}} लाइफ़ बदलाव",
    none_other: "{{count}} लाइफ़ बदलाव",
    mtg_one: "{{count}} लाइफ़ बदलाव",
    mtg_other: "{{count}} लाइफ़ बदलाव",
    ygo_one: "{{count}} लाइफ़ पॉइंट बदलाव",
    ygo_other: "{{count}} लाइफ़ पॉइंट बदलाव",
    pokemon_one: "{{count}} प्राइज़ कार्ड बदलाव",
    pokemon_other: "{{count}} प्राइज़ कार्ड बदलाव",
  },
  noneTaken: "कोई नहीं लिया",
  taken: "{{amount}} लिए",
  even: "बराबर",
  fromStart: "शुरुआत से {{delta}}",
} satisfies LocaleNamespace
