// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  notFound: "このコードのイベントはありません",
  roundOf: "ラウンド{{round}}/{{planned}}",
  round: "ラウンド{{round}}",
  final: "最終",
  code: "コード",
  paused: "一時停止中",
  time: "時間切れ",
  bye: "不戦勝",
  pairings: "対戦表",
  standings: "順位表",
  players_other: "{{count}}人",
  noPlayers: "まだプレイヤーがいません",
  points: "勝点",
  record: "勝-敗-分",
  tableStatus: {
    open: "対戦中",
    reported: "報告済み",
    confirmed: "承認済み",
  },
} satisfies LocaleNamespace
