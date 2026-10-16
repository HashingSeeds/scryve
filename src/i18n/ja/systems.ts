// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  counterValue: {
    none_other: "ライフ{{count}}",
    mtg_other: "ライフ{{count}}",
    ygo_other: "ライフポイント{{count}}",
    pokemon_other: "サイド{{count}}枚",
  },
  counterChange: {
    none_other: "ライフ変動{{count}}回",
    mtg_other: "ライフ変動{{count}}回",
    ygo_other: "ライフポイント変動{{count}}回",
    pokemon_other: "サイド変動{{count}}回",
  },
  noneTaken: "なし",
  taken: "{{amount}}受けた",
  even: "同数",
  fromStart: "開始時から{{delta}}",
} satisfies LocaleNamespace
