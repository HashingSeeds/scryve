// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  noSystem: "システムなし",
  counterHeading: {
    none: "ライフ",
    mtg: "ライフ",
    ygo: "ライフポイント",
    pokemon: "サイド",
  },
  counterLabel: {
    none: "ライフ",
    mtg: "ライフ",
    ygo: "ライフポイント",
    pokemon: "サイド",
  },
  startingValueRange: {
    none: "初期ライフは1から{{max}}までの整数で入力してください。",
    mtg: "初期ライフは1から{{max}}までの整数で入力してください。",
    ygo: "初期ライフポイントは1から{{max}}までの整数で入力してください。",
    pokemon: "初期のサイドは1から{{max}}までの整数で入力してください。",
  },
  tableItem: {
    poison: "毒",
    commanderTax: "統率者税",
    monarch: "monarch",
    initiative: "イニシアチブ",
  },
  section: {
    commander: "Commander",
    sideboard: "サイドボード",
    extra: "エクストラデッキ",
    side: "サイドデッキ",
    main: {
      mtg: "メインデッキ",
      ygo: "メインデッキ",
      pokemon: "デッキ",
    },
  },
  formatBlurb: {
    mtg: {
      commander: "100枚、シングルトン",
      standard: "最新のセット",
      pioneer: "ラヴニカへの回帰以降",
      modern: "第8版以降",
      legacy: "ほぼ全てのセット",
      vintage: "制限リスト",
      pauper: "コモンのみ",
      brawl: "60枚、シングルトン",
      limited: "ドラフトとシールド",
      constructed: "その他すべて",
    },
  },
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
