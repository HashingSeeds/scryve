// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  notFound: "해당 코드의 이벤트가 없습니다",
  roundOf: "{{planned}}라운드 중 {{round}}라운드",
  round: "{{round}}라운드",
  final: "결승",
  code: "코드",
  paused: "일시 정지",
  time: "시간 종료",
  bye: "부전승",
  pairings: "대진표",
  standings: "순위",
  players_other: "플레이어 {{count}}명",
  noPlayers: "아직 플레이어가 없습니다",
  points: "승점",
  record: "승-패-무",
  tableStatus: {
    open: "진행 중",
    reported: "보고됨",
    confirmed: "확인됨",
  },
} satisfies LocaleNamespace
