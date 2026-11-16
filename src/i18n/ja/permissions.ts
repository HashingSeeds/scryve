// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  camera:
    "ScryveのゲームQR招待コードをスキャンし、カード名を読み取ります。写真はこのデバイスから出ることはありません。",
  photos: "選択したスクリーンショットをサポートリクエストに添付することをScryveに許可します。",
  localNetwork:
    "Scryveはローカルネットワークを使用して、近くのデバイスにあるゲームを見つけて参加します。",
} satisfies LocaleNamespace
