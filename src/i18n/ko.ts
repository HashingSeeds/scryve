import en, { type Translations } from "./en"

const ko: Translations = {
  game: en.game,
  common: {
    ok: "확인",
    cancel: "취소",
    back: "뒤로",
  },
  landingScreen: {
    eyebrow: "생명점 카운터",
    title: "모든 점수. 모든 플레이어. 하나의 선명한 보드.",
    subtitle: "한 기기에서 함께 시작하고, 온라인 플레이가 출시되면 테이블 전체를 연결하세요.",
    quickLocalGame: "빠른 로컬 게임",
    quickLocalGameHint: "계정이나 네트워크가 필요하지 않습니다.",
    quickLocalGameAccessibilityHint:
      "이 기기에서 게임을 시작합니다. 다음 제품 단계에서 제공됩니다.",
    joinConnectedGame: "연결 게임 참가",
    joinConnectedGameAccessibilityHint: "여러 기기에서 공유하는 게임에 참가합니다. 곧 제공됩니다.",
    signIn: "로그인",
    signInAccessibilityHint: "연결 플레이를 위해 로그인합니다. 곧 제공됩니다.",
    status: "제품 기반이 준비되었습니다. 게임 설정과 연결 플레이가 다음에 추가됩니다.",
    comingSoonTitle: "곧 제공 예정",
    comingSoonMessage: "이 진입점은 Scryve의 다음 구현 단계를 위해 준비되었습니다.",
    dismissComingSoon: "확인",
  },
  errorScreen: {
    title: "문제가 발생했습니다",
    friendlySubtitle:
      "Scryve에서 예기치 않은 오류가 발생했습니다. 앱을 초기화해 정상 상태로 돌아가세요. 문제가 계속되면 개발 클라이언트를 다시 시작하세요.",
    reset: "앱 초기화",
  },
  emptyStateComponent: {
    generic: {
      heading: "아직 아무것도 없습니다",
      content: "데이터를 찾지 못했습니다. 새로 고치거나 앱을 다시 불러오세요.",
      button: "다시 시도",
    },
  },
}

export default ko
