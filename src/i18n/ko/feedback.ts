// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  support: {
    search: "도움말 검색",
    yourFeedback: "내 피드백",
    newCount_other: "새 답변 {{count}}개",
    email: "이메일 문의",
    emailDetail: "계정 또는 결제 문의",
    suggest: "기능 제안 또는 버그 신고",
    noMatch: "“{{query}}”에 대한 답변이 없습니다.",
    ask: "“{{query}}” 문의하기",
  },
  offline: "오프라인입니다. 연결될 때까지 작성한 내용은 여기에 남아 있습니다.",
  suggest: {
    title: "피드백 보내기",
    kind: "어떤 내용인가요?",
    feature: "기능",
    bug: "버그",
    bodyLabel: "메시지",
    bodyPlaceholder: {
      feature: "어떤 기능을 원하시나요? 언제 사용하시겠습니까?",
      bug: "무슨 일이 있었나요? 어떻게 되길 기대하셨나요?",
    },
    addScreenshot: "스크린샷 추가",
    removeScreenshot: "스크린샷 삭제",
    selectedScreenshot: "선택한 스크린샷",
    screenshotFailed: "스크린샷을 추가하지 못했습니다. 다른 이미지를 선택하세요.",
    bugDisclosure: "버그 신고 시 기기 정보와 스크린샷도 Sentry로 전송됩니다.",
    translationNotice:
      "어떤 언어로든 작성하세요. AI 도구로 번역할 수 있습니다. <privacy>개인정보 처리방침</privacy>을 확인하세요.",
    includeAccount: "내 계정 포함",
    includeAccountHelper:
      "로그인한 모든 기기에서 답변을 확인할 수 있으며, 사용자 이름이 우리에게 표시됩니다.",
    anonymous:
      "계정 없이 전송되었습니다. 답변은 이 기기에 표시되며, 앱을 다시 설치하면 사라질 수 있습니다.",
    signInToKeep: "로그인하여 보관",
    send: "보내기",
    sendFailed: "보내지 못했습니다. 다시 시도하세요.",
    rateLimited_other: "전송 횟수가 너무 많습니다. {{count}}분 후에 다시 시도하세요.",
  },
  mine: {
    title: "내 피드백",
    empty: "이 기기에서 보낸 내용이 아직 없습니다.",
    unread: "새 글",
    deleteAll: "내 피드백 삭제",
    deleteHint:
      "이 기기에서 보낸 내용과 계정을 포함해 보낸 내용을 모두 삭제합니다. 이미 Sentry로 전송된 버그 상세 정보는 그대로 남습니다.",
    deleteConfirmTitle: "피드백을 삭제할까요?",
    deleteConfirmBody:
      "이 기기에서 보낸 내용과 계정을 포함해 보낸 내용, 그리고 답변이 삭제됩니다. 이미 Sentry로 전송된 버그 상세 정보는 그대로 남습니다.",
    delete: "삭제",
    deleteFailed: "피드백을 삭제하지 못했습니다. 온라인 상태일 때 다시 시도하세요.",
  },
  thread: {
    missing: "이 피드백은 삭제되었습니다.",
    you: "나",
    team: "Scryve",
    replyLabel: "답글",
    replyPlaceholder: "내용을 추가하거나 질문에 답해 주세요",
    send: "보내기",
    sendFailed: "보내지 못했습니다. 다시 시도하세요.",
    includeAccount: "내 계정 포함",
    includeAccountHelper: "사용자 이름을 확인할 수 있으며 이 대화가 모든 기기에 유지됩니다.",
    linked: "내 계정으로 전송됨",
    linkedElsewhere: "다른 계정으로 전송됨",
    signInToKeep: "로그인하면 앱을 다시 설치해도 이 대화가 유지됩니다",
    notifyReplies: "내 모든 피드백의 답글 알림 받기",
  },
  unavailable: "피드백은 Scryve 클라우드가 필요하지만 이 빌드에는 설정되어 있지 않습니다.",
} satisfies LocaleNamespace
