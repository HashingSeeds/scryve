// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  camera:
    "Escanea códigos QR de invitación a partidas de Scryve y lee nombres de cartas. Las fotos se quedan en este dispositivo.",
  photos:
    "Permite que Scryve adjunte a una solicitud de soporte una captura de pantalla que elijas.",
  localNetwork:
    "Scryve usa tu red local para encontrar partidas en dispositivos cercanos y unirte a ellas.",
} satisfies LocaleNamespace
