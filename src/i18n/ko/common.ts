// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  back: "뒤로",
  cancel: "취소",
  close: "닫기",
  delete: "삭제",
  done: "완료",
  edit: "편집",
  remove: "제거",
  retry: "재시도",
  save: "저장",
  tryAgain: "다시 시도",
  undo: "실행 취소",
  emptyState: {
    heading: "아직 아무것도 없습니다",
    content: "데이터가 없습니다. 새로고침하거나 앱을 다시 실행해 보세요.",
  },
  appMenu: {
    more: "더보기",
    moreUpdateReady: "더보기, 업데이트 준비됨",
    settings: "설정",
    settingsUpdateReady: "설정, 업데이트 준비됨",
    account: "계정",
    signIn: "로그인",
    closeMenu: "유틸리티 메뉴 닫기",
  },
  appNavigation: {
    decks: "덱",
    returnToGame: "게임으로 돌아가기",
    play: "플레이",
    backToLobby: "로비로 돌아가기",
  },
  confirmDialog: {
    cancelAction: "{{action}} 취소",
  },
  retryableError: {
    retryingIn: "{{seconds}}초 후 다시 시도",
  },
  selectField: {
    none: "없음",
    triggerLabel: "{{label}}, {{value}}",
    openHint: "{{label}} 선택지 열기",
    closeLabel: "{{label}} 선택지 닫기",
  },
  valueField: {
    readoutLabel: "{{label}}, {{value}}",
    decrease: "{{label}} {{step}} 감소",
    increase: "{{label}} {{step}} 증가",
    longPressHint: "길게 누르면 {{step}}씩 변경됩니다.",
  },
} satisfies LocaleNamespace
