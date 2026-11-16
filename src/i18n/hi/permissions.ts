// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  camera:
    "Scryve गेम आमंत्रण के QR कोड स्कैन करें और कार्ड के नाम पढ़ें। फ़ोटो इसी डिवाइस पर रहती हैं।",
  photos: "आप जो स्क्रीनशॉट चुनें, उसे Scryve को सहायता अनुरोध के साथ जोड़ने की अनुमति दें।",
  localNetwork:
    "Scryve आपके लोकल नेटवर्क का उपयोग करके आस-पास मौजूद डिवाइस पर गेम खोजता है और उनमें शामिल होता है।",
} satisfies LocaleNamespace
