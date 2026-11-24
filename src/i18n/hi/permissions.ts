// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  camera:
    "Scryve इनवाइट QR कोड स्कैन करने और कार्ड के नाम पढ़ने के लिए कैमरा इस्तेमाल होता है। फ़ोटो इसी डिवाइस पर रहती हैं।",
  photos: "सपोर्ट रिक्वेस्ट के साथ आपकी चुनी हुई स्क्रीनशॉट अटैच करने के लिए Scryve को इजाज़त दें।",
  localNetwork:
    "आस-पास मौजूद डिवाइस पर गेम ढूँढने और उनमें शामिल होने के लिए Scryve आपके लोकल नेटवर्क का इस्तेमाल करता है।",
} satisfies LocaleNamespace
