// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  counterValue: {
    none_other: "라이프 {{count}}",
    mtg_other: "라이프 {{count}}",
    ygo_other: "라이프 포인트 {{count}}",
    pokemon_other: "사이드 카드 {{count}}장",
  },
  counterChange: {
    none_other: "라이프 변동 {{count}}회",
    mtg_other: "라이프 변동 {{count}}회",
    ygo_other: "라이프 포인트 변동 {{count}}회",
    pokemon_other: "사이드 카드 변동 {{count}}회",
  },
  noneTaken: "가져간 카드 없음",
  taken: "{{amount}} 가져감",
  even: "동일",
  fromStart: "시작 대비 {{delta}}",
} satisfies LocaleNamespace
