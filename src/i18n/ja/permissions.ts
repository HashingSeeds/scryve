// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  camera:
    "Scryveの招待QRコードのスキャンとカード名の読み取りに使用します。写真はこのデバイスから外に出ません。",
  photos:
    "選択したスクリーンショットをサポートへの問い合わせに添付するため、Scryveに許可してください。",
  localNetwork:
    "近くのデバイスにあるゲームを見つけて参加するため、ローカルネットワークを使用します。",
} satisfies LocaleNamespace
