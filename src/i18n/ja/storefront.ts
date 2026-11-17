// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  paywall: {
    title: "Scryve Pro",
    perks: {
      decks: "最大{{proDecks}}個のデッキを同期（無料は{{freeDecks}}個）",
      versions: "デッキごとに{{proVersions}}バージョンを保存（無料は{{freeVersions}}バージョン）",
      compare: "リストを並べて比較",
      seatMark: "共有ゲームで自分の席にProマークを表示",
      appIcons: "Pro限定のアプリアイコン",
    },
    save: "{{ product.relative_discount }}お得",
    perMonth: "月々{{ product.price_per_month }}のみ",
    billedAt: "{{ product.price_per_period_abbreviated }}で請求されます。",
    continue: "続ける",
    restore: "購入を復元",
    terms: "利用規約",
    privacy: "プライバシー",
  },
} satisfies LocaleNamespace
