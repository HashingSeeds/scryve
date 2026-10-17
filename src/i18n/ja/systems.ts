// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  noSystem: "システムなし",
  counterHeading: {
    none: "ライフ",
    mtg: "ライフ",
    ygo: "ライフポイント",
    pokemon: "サイド",
    lorcana: "ロア",
  },
  counterLabel: {
    none: "ライフ",
    mtg: "ライフ",
    ygo: "ライフポイント",
    pokemon: "サイド",
    lorcana: "ロア",
  },
  startingValueRange: {
    none: "初期ライフは1から{{max}}までの整数で入力してください。",
    mtg: "初期ライフは1から{{max}}までの整数で入力してください。",
    ygo: "初期ライフポイントは1から{{max}}までの整数にしてください。",
    pokemon: "初期サイドは1から{{max}}までの整数にしてください。",
    lorcana: "初期ロアは0から{{max}}までの整数にしてください。",
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
      lorcana: "デッキ",
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
    none_other: "ライフ {{count}}",
    mtg_other: "ライフ {{count}}",
    ygo_other: "{{count}}ライフポイント",
    pokemon_other: "サイド {{count}}枚",
    lorcana_other: "ロア {{count}}",
  },
  counterChange: {
    none_other: "ライフの変動 {{count}}件",
    mtg_other: "ライフの変動 {{count}}件",
    ygo_other: "ライフポイントの変動: {{count}}",
    pokemon_other: "サイド変動{{count}}回",
    lorcana_other: "ロア変動{{count}}回",
  },
  noneTaken: "なし",
  taken: "{{amount}}受けた",
  even: "同数",
  fromStart: "開始時から{{delta}}",
} satisfies LocaleNamespace
