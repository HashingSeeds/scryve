// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  relativeTime: {
    justNow: "방금",
    minutes: "{{minutes}}분 전",
    hours: "{{hours}}시간 전",
    days: "{{days}}일 전",
  },
  resumeTitle: {
    hostingLobby: "호스트 · 시작 대기 중",
    hostingActive: "호스트 · 진행 중",
    playingLobby: "참가 · 시작 대기 중",
    playingActive: "참가 · 진행 중",
  },
  seatCount_other: "좌석 {{count}}개",
  allSeatsClaimed: "모든 좌석 선택됨",
  waitingForPlayers_other: "플레이어 {{count}}명 더 기다리는 중",
  decksRequired: "덱 필수",
  decksOptional: "덱 선택 사항",
  yourSeat: "내 좌석",
  seatNumber: "{{seat}}번 좌석",
  noDeckSelected: "선택한 덱 없음",
  lobbyExit: {
    abandon: {
      title: "이 로비를 폐기할까요?",
      message: "모든 사용자의 로비가 닫히고 최종 요약이 저장됩니다. 되돌릴 수 없습니다.",
      confirmText: "로비 폐기",
    },
    leave: {
      title: "이 로비에서 나갈까요?",
      message: "이 로비가 이어하기 목록에서 사라집니다. 다른 플레이어와 기록은 그대로 유지됩니다.",
      confirmText: "로비 나가기",
    },
  },
  onlineOnly: {
    start:
      "게임을 시작하려면 다시 연결하세요. 시작은 온라인에서만 가능하며 대기열에 저장되지 않습니다.",
    exit: "이 로비를 나가거나 폐기하려면 다시 연결하세요. 이 작업은 온라인에서만 가능하며 대기열에 저장되지 않습니다.",
    join: "좌석을 선택하려면 다시 연결하세요. 좌석 선택은 온라인에서만 가능하며 대기열에 저장되지 않습니다.",
    deck: "덱을 변경하려면 다시 연결하세요. 덱 선택은 온라인에서만 가능하며 대기열에 저장되지 않습니다.",
  },
} satisfies LocaleNamespace
