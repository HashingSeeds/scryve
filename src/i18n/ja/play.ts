// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  playerNames: "プレイヤー名",
  startGame: "ゲーム開始",
  finish: "終了",
  abandon: "中断",
  ending: "終了中…",
  gameSummary: "ゲームの概要",
  noGames: "ゲームはまだありません",
  noGamesContent: "終了したゲームはここに表示されます。",
} satisfies LocaleNamespace
