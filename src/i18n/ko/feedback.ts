// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  support: {
    search: "도움말 검색",
    yourFeedback: "내 피드백",
    newCount_other: "새 답변 {{count}}개",
    email: "이메일 문의",
    emailDetail: "계정 또는 결제 문의",
    suggestFeature: "기능 제안하기",
    reportBug: "버그 신고하기",
    noMatch: "“{{query}}”에 대한 답변이 없습니다.",
    ask: "“{{query}}” 문의하기",
  },
  offline: "오프라인입니다. 연결될 때까지 초안은 여기에 그대로 남아 있습니다.",
  suggest: {
    title: "피드백 보내기",
    kind: "어떤 내용인가요?",
    feature: "기능",
    bug: "버그",
    prompt: {
      feature: "어떤 기능을 원하시나요?",
      bug: "어떤 문제가 있었나요?",
    },
    bodyPlaceholder: {
      feature: "언제 사용하실 건가요?",
      bug: "어떤 동작을 예상하셨나요?",
    },
    addScreenshot: "스크린샷 추가",
    removeScreenshot: "스크린샷 삭제",
    selectedScreenshot: "선택한 스크린샷",
    screenshotFailed: "스크린샷을 추가하지 못했습니다. 다른 이미지를 선택하세요.",
    notice:
      "어떤 언어든 괜찮습니다. AI가 읽는 데 도움을 줄 수 있습니다. <privacy>개인정보 처리방침</privacy>",
    includeAccount: "내 계정 포함",
    includeAccountHelper: "답변이 내 기기에 동기화되며, 사용자 이름이 우리에게 표시됩니다.",
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
    replyPlaceholder: "내용을 추가하거나 질문에 답해 주세요",
    send: "보내기",
    sending: "보내는 중…",
    sent: "전송됨",
    sendFailed: "보내지 못했습니다. 다시 시도하세요.",
    linked: "내 계정으로 전송됨",
    linkedElsewhere: "다른 계정으로 전송됨",
    notLinked: "계정 없이 전송되었습니다.",
    includeAccount: "계정 포함하기",
    signInToSync: "로그인하여 동기화하세요",
  },
  notifyPrompt: {
    title: "답변 알림을 받을까요?",
    body: "어느 쪽이든 답변은 항상 Scryve에 표시됩니다.",
    notNow: "나중에",
    notify: "알림 받기",
  },
  unavailable: "피드백은 Scryve 클라우드가 필요하지만 이 빌드에는 설정되어 있지 않습니다.",
} satisfies LocaleNamespace
