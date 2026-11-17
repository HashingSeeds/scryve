// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  support: {
    search: "도움말 검색",
    yourFeedback: "내 피드백",
    newCount_other: "새 답변 {{count}}개",
    email: "이메일로 지원팀에 문의",
    emailDetail: "계정 또는 결제 관련 문의",
    suggestFeature: "기능 제안",
    reportBug: "버그 신고",
    noMatch: "“{{query}}”에 대한 답변이 없습니다.",
    ask: "“{{query}}” 문의하기",
  },
  offline: "오프라인입니다. 연결될 때까지 작성한 내용이 여기에 보관됩니다.",
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
      feature: "언제 사용하시나요?",
      bug: "어떻게 되길 기대했나요?",
    },
    addScreenshot: "스크린샷 추가",
    removeScreenshot: "스크린샷 제거",
    selectedScreenshot: "선택한 스크린샷",
    screenshotFailed: "스크린샷을 추가하지 못했습니다. 다른 이미지를 선택하세요.",
    notice:
      "어떤 언어든 괜찮습니다. AI가 내용을 읽는 데 도움을 줄 수 있습니다. <privacy>개인정보 처리방침</privacy>",
    includeAccount: "내 계정 포함",
    includeAccountHelper: "답변이 내 기기들에 동기화되며, 사용자 이름이 확인됩니다.",
    sendFailed: "보내지 못했습니다. 다시 시도하세요.",
    rateLimited_other: "전송 횟수가 너무 많습니다. {{count}}분 후에 다시 시도하세요.",
  },
  mine: {
    title: "내 피드백",
    empty: "이 기기에서 보낸 피드백이 아직 없습니다.",
    unread: "새 답변",
    deleteAll: "내 피드백 삭제",
    deleteHint:
      "이 기기에서 보낸 피드백과 내 계정으로 보낸 피드백이 삭제됩니다. 이미 Sentry로 전송된 버그 상세 정보는 그대로 남습니다.",
    deleteConfirmTitle: "피드백을 삭제할까요?",
    deleteConfirmBody:
      "이 기기에서 보낸 피드백과 내 계정으로 보낸 피드백이 답변과 함께 삭제됩니다. 이미 Sentry로 전송된 버그 상세 정보는 그대로 남습니다.",
    delete: "삭제",
    deleteFailed: "피드백을 삭제하지 못했습니다. 온라인 상태에서 다시 시도하세요.",
  },
  thread: {
    missing: "이 피드백은 더 이상 없습니다.",
    you: "나",
    team: "Scryve",
    replyPlaceholder: "추가 내용이나 질문에 대한 답변 입력",
    send: "보내기",
    sending: "보내는 중…",
    sent: "보냄",
    sendFailed: "보내지 못했습니다. 다시 시도하세요.",
    linked: "내 계정으로 보냄",
    linkedElsewhere: "다른 계정으로 보냄",
    notLinked: "계정 없이 보냈습니다.",
    includeAccount: "계정 포함하기",
    signInToSync: "로그인하여 동기화",
  },
  notifyPrompt: {
    title: "답변이 오면 알림을 받을까요?",
    body: "알림을 받지 않아도 답변은 항상 Scryve에 표시됩니다.",
    notNow: "나중에",
    notify: "알림 받기",
  },
  unavailable: "피드백 기능은 Scryve 클라우드가 필요하지만, 이 빌드에는 설정되어 있지 않습니다.",
} satisfies LocaleNamespace
