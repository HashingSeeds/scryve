// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  noSystem: "कोई सिस्टम नहीं",
  counterHeading: {
    none: "लाइफ",
    mtg: "लाइफ",
    ygo: "लाइफ़ पॉइंट",
    pokemon: "प्राइज़ कार्ड",
  },
  counterLabel: {
    none: "लाइफ",
    mtg: "लाइफ",
    ygo: "लाइफ़ पॉइंट",
    pokemon: "प्राइज़ कार्ड",
  },
  startingValueRange: {
    none: "शुरुआती लाइफ 1 से {{max}} के बीच की पूर्ण संख्या होनी चाहिए।",
    mtg: "शुरुआती लाइफ 1 से {{max}} के बीच की पूर्ण संख्या होनी चाहिए।",
    ygo: "शुरुआती लाइफ़ पॉइंट 1 से {{max}} के बीच की पूर्ण संख्या होनी चाहिए।",
    pokemon: "शुरुआती प्राइज़ कार्ड 1 से {{max}} तक की पूर्ण संख्या होने चाहिए।",
  },
  tableItem: {
    poison: "पॉइज़न",
    commanderTax: "कमांडर टैक्स",
    monarch: "मोनार्क",
    initiative: "इनिशिएटिव",
  },
  section: {
    commander: "Commander",
    sideboard: "साइडबोर्ड",
    extra: "एक्स्ट्रा डेक",
    side: "साइड डेक",
    main: {
      mtg: "मुख्य डेक",
      ygo: "मेन डेक",
      pokemon: "डेक",
    },
  },
  formatBlurb: {
    mtg: {
      commander: "100 कार्ड, सिंगलटन",
      standard: "हाल के सेट",
      pioneer: "Return to Ravnica से आगे",
      modern: "8th Edition से आगे",
      legacy: "लगभग हर सेट",
      vintage: "रिस्ट्रिक्टेड लिस्ट",
      pauper: "सिर्फ़ कॉमन",
      brawl: "60 कार्ड, सिंगलटन",
      limited: "ड्राफ़्ट और सील्ड",
      constructed: "बाकी सब",
    },
  },
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
