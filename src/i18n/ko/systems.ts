// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  noSystem: "시스템 없음",
  counterHeading: {
    none: "라이프",
    mtg: "라이프",
    ygo: "라이프 포인트",
    pokemon: "사이드 카드",
  },
  counterLabel: {
    none: "라이프",
    mtg: "라이프",
    ygo: "라이프 포인트",
    pokemon: "사이드 카드",
  },
  startingValueRange: {
    none: "시작 라이프는 1에서 {{max}} 사이의 정수여야 합니다.",
    mtg: "시작 라이프는 1에서 {{max}} 사이의 정수여야 합니다.",
    ygo: "시작 라이프 포인트는 1에서 {{max}} 사이의 정수여야 합니다.",
    pokemon: "시작 사이드 카드는 1에서 {{max}} 사이의 정수여야 합니다.",
  },
  tableItem: {
    poison: "독",
    commanderTax: "커맨더 세금",
    monarch: "모나크",
    initiative: "이니셔티브",
  },
  section: {
    commander: "Commander",
    sideboard: "사이드보드",
    extra: "엑스트라 덱",
    side: "사이드 덱",
    main: {
      mtg: "메인 덱",
      ygo: "메인 덱",
      pokemon: "덱",
    },
  },
  formatBlurb: {
    mtg: {
      commander: "100장, 싱글턴",
      standard: "최근 세트",
      pioneer: "라브니카로의 귀환 이후",
      modern: "8판 이후",
      legacy: "거의 모든 세트",
      vintage: "제한 목록",
      pauper: "커먼만",
      brawl: "60장, 싱글턴",
      limited: "드래프트와 실드",
      constructed: "그 외 전부",
    },
  },
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
