// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  camera: "مسح رموز QR لدعوات مباريات Scryve وقراءة أسماء البطاقات. تبقى الصور على هذا الجهاز.",
  photos: "السماح لتطبيق Scryve بإرفاق لقطة شاشة تختارها بطلب دعم.",
  localNetwork:
    "يستخدم تطبيق Scryve شبكتك المحلية للعثور على المباريات على الأجهزة القريبة والانضمام إليها.",
} satisfies LocaleNamespace
