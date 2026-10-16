// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  playerNames: "플레이어 이름",
  startGame: "게임 시작",
  finish: "종료",
  abandon: "포기",
  ending: "종료 중…",
  gameSummary: "게임 요약",
  noGames: "아직 게임이 없습니다",
  noGamesContent: "종료된 게임이 여기에 표시됩니다.",
} satisfies LocaleNamespace
