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
} satisfies LocaleNamespace
