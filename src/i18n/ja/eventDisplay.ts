// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  notFound: "そのコードのイベントはありません",
  roundOf: "第{{round}}ラウンド / 全{{planned}}ラウンド",
  round: "第{{round}}ラウンド",
  final: "最終結果",
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
    confirmed: "確定済み",
  },
} satisfies LocaleNamespace
