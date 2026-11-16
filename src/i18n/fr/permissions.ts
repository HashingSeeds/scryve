// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  camera:
    "Scannez les codes QR d'invitation à une partie Scryve et lisez les noms des cartes. Les photos restent sur cet appareil.",
  photos:
    "Autorisez Scryve à joindre à une demande d'assistance une capture d'écran que vous choisissez.",
  localNetwork:
    "Scryve utilise votre réseau local pour trouver des parties sur des appareils à proximité et les rejoindre.",
} satisfies LocaleNamespace
