// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  openPlay: "플레이 열기",
  signIn: "로그인",
  localGamesStay: "로컬 게임은 이 기기에 저장됩니다.",
  legal: {
    heading: "법적 고지",
    privacyPolicy: "개인정보 처리방침",
    termsOfUse: "이용약관",
    licenseAgreement: "라이선스 계약",
    licenseAgreementHint: "브라우저에서 Apple의 표준 라이선스 계약을 엽니다",
    cookiePolicy: "쿠키 정책",
    gameContent: "제3자 게임 콘텐츠",
    licenseOpenFailed: "라이선스 계약을 열 수 없습니다",
  },
  accountData: {
    label: "계정 및 데이터",
    accessibilityLabel: "계정 및 데이터",
    accessibilityHint: "계정 삭제 및 데이터 정보를 엽니다",
  },
  shareUsage: "Scryve에 사용 정보 공유",
  settings: {
    title: "설정",
    localDefaults: "로컬 게임 기본값",
    players: "플레이어",
    openScryveTo: "Scryve 시작 화면",
    launchDestination: {
      play: "플레이",
      decks: "덱",
    },
    launchDestinationHint: "플레이를 선택하면 진행 중인 게임을 이어가거나 새 보드를 엽니다.",
    game: "게임",
    chooseGame: "새 게임 시작 유형",
    closeGameChoices: "게임 선택 닫기",
    defaultsHint: "새 게임을 항상 같은 시스템과 포맷으로 시작하고 싶을 때만 설정하세요.",
    haptics: {
      label: "햅틱 피드백",
      helper: "라이프가 바뀐 뒤 가벼운 진동을 줍니다. 실패해도 플레이에는 영향이 없습니다.",
    },
    theme: {
      heading: "테마",
      system: "시스템",
      light: "라이트",
      dark: "다크",
      hint: "시스템은 기기 화면 설정을 따릅니다. 라이트와 다크는 여기서 바꾸기 전까지 고정됩니다.",
    },
    appIcon: {
      heading: "앱 아이콘",
      changeFailed: "앱 아이콘을 변경할 수 없습니다. 다시 시도하세요.",
      lockedPro: "{{name}}, Scryve Pro",
      opensPro: "Scryve Pro 열기",
      opensSignIn: "로그인 열기",
      names: {
        Default: "기본",
        Two: "투",
        Three: "쓰리",
        Midnight: "미드나이트",
        Graphite: "그래파이트",
        Ink: "잉크",
        Outline: "아웃라인",
        Bone: "본",
        Foil: "Foil",
      },
    },
    menuButton: {
      heading: "게임 메뉴 버튼",
      hint: "보드 중앙의 모양을 바꿉니다. 프리즘은 테이블에 있는 모든 사람의 색으로 버튼을 물들입니다.",
    },
    privacy: {
      heading: "개인정보",
      shareUsageHelper:
        "기본값은 꺼짐입니다. 계정과 연결되지 않은 임의의 ID로 사용 정보를 공유합니다. 자세한 내용은 개인정보 처리방침을 확인하세요.",
      saveFailed: "선택을 저장하지 못했습니다. 다시 시도해 주세요.",
      unavailable:
        "이 빌드에서는 사용 정보 공유를 사용할 수 없습니다. PostHog 이벤트가 전송되지 않습니다.",
    },
    accountData: {
      description:
        "Scryve 계정에 연결된 클라우드 데이터를 관리합니다. 로컬 게임은 이 기기에 저장됩니다.",
      requestDeletion: "계정 삭제 요청",
      requestDeletionHint: "계정 삭제 요청 페이지를 엽니다",
    },
    help: {
      heading: "도움말",
      support: "도움말 및 지원",
    },
    appInfo: {
      heading: "앱 정보",
      analyticsId: "분석 ID: {{id}}",
      analyticsIdHint:
        "이 ID로 사용 데이터를 찾을 수 있습니다. 삭제를 요청하려면 ID를 privacy@sowinghope.how로 이메일 보내 주세요.",
      version: "버전: {{value}}",
      build: "빌드: {{value}}",
      runtime: "런타임: {{value}}",
      update: "업데이트: {{value}}",
      channel: "채널: {{value}}",
      platform: "플랫폼: {{value}}",
      notApplicable: "해당 없음",
      unavailable: "사용 불가",
      bundled: "번들",
      development: "개발",
    },
    beta: {
      label: "베타 업데이트",
      helper: "정식 출시 전 업데이트를 먼저 받습니다. 불안정할 수 있습니다.",
    },
    backToPreview: "미리보기로 돌아가기",
    backToPreviewFailed: "미리보기로 돌아갈 수 없습니다. 다시 시도해 주세요.",
    copyDebugInfo: "디버그 정보 복사",
    copied: "복사됨",
    copyFailed: "복사할 수 없습니다. 다시 시도해 주세요.",
  },
  support: {
    pageTitle: "Scryve 도움말",
    pageDescription:
      "Scryve 시작 방법을 알아보고, 자주 묻는 질문의 답을 찾거나 지원팀에 문의하세요.",
    title: "도움말",
    subtitle: "게임, 계정, Scryve Pro에 관한 답변입니다. 도움이 필요하면 메시지를 보내 주세요.",
    contactUs: "문의하기",
    contactReason: "문의 유형",
    kind: {
      bug: "문제 신고",
      help: "도움 요청",
    },
    messageLabel: {
      bug: "어떤 일이 있었나요?",
      help: "무엇을 도와드릴까요?",
    },
    messagePlaceholder: {
      bug: "어떤 일이 있었나요? 어떻게 되기를 기대했나요?",
      help: "도움이 필요한 내용을 알려 주세요",
    },
    emailLabel: {
      bug: "답변 받을 이메일 (선택)",
      help: "답변 받을 이메일",
    },
    emailInvalid: "올바른 이메일 주소를 입력하세요.",
    replyTime: "보통 영업일 기준 2일 이내에 답변드립니다.",
    selectedScreenshot: "선택한 스크린샷",
    removeScreenshot: "스크린샷 삭제",
    addScreenshot: "스크린샷 추가",
    disclosure:
      "메시지, 입력한 경우 이메일, 앱 버전, 빌드, 플랫폼, 추가한 스크린샷을 Sentry로 전송합니다.",
    send: "보내기",
    preferEmail: "이메일이 편하신가요?",
    emailSupport: "이메일 지원",
    status: {
      queued: "피드백이 대기 중입니다. 오프라인이면 다시 연결될 때 전송됩니다.",
      saveFailed: "메시지를 저장하지 못했습니다. 다시 시도하거나 이메일로 보내 주세요.",
      screenshotFailed: "스크린샷을 추가할 수 없습니다. 다른 이미지를 선택해 주세요.",
    },
    gettingStarted: {
      heading: "시작하기",
      startGame: {
        title: "게임 시작",
        body: "플레이를 여세요. 새 보드는 설정에 저장된 기본값을 사용합니다.",
      },
      choosePlay: {
        title: "플레이 방식 선택",
        body: "한 기기로 함께 플레이하거나, 연결을 선택해 각자의 기기로 플레이하세요.",
      },
      setUpTable: {
        title: "테이블 설정",
        body: "플레이어 수와 시작 라이프를 선택한 다음 게임을 시작하세요.",
      },
    },
    faq: {
      heading: "자주 묻는 질문",
      restorePro: {
        question: "Scryve Pro 복원",
        answer:
          "Scryve를 열고 계정으로 이동해 Scryve Pro를 선택한 다음 구매 항목 복원을 누르세요. 처음 구매할 때 사용한 Apple 또는 Google 계정을 사용해야 합니다.",
      },
      manageSubscription: {
        question: "구독 관리 또는 해지",
        answer:
          "구독은 구매한 스토어에서 관리합니다. iPhone 또는 iPad에서는 설정을 열고 내 이름을 누른 다음 구독을 누르세요. Android에서는 Google Play를 열고 프로필을 누른 다음 결제 및 구독을 누르세요.",
      },
      gameTrouble: {
        question: "게임에 문제가 있나요?",
        answer:
          "Scryve를 다시 시작한 후 다시 시도하세요. 문제가 계속되면 발생한 상황을 간단히 적어 여기에서 신고해 주세요.",
      },
      accountPrivacy: {
        question: "계정 또는 개인정보 문의",
        answer:
          "Scryve의 계정 화면에서 계정을 관리할 수 있습니다. 계정에 접근하거나 삭제하는 데 도움이 필요하면 문의해 주세요.",
      },
    },
    appVersion: "Scryve {{version}}",
  },
  profile: {
    title: "계정",
    signedIn: "로그인됨",
    yourAccount: "내 계정",
    profileAndSecurity: "프로필 및 보안",
    profileHint: "프로필 관리로 이동하여 이름, 이메일 주소, 비밀번호를 변경합니다",
    profileDetails: "이름, 이메일, 비밀번호, 로그인 방법.",
    independence:
      "Scryve는 독립적으로 운영되며, 게임 콘텐츠 고지에 명시된 게임 퍼블리셔, 권리 보유자, 데이터 제공자와 제휴하거나 승인을 받지 않았습니다.",
    signingOut: "로그아웃 중…",
    signOut: "로그아웃",
    signOutFailed: "로그아웃하지 못했습니다. 다시 시도하세요.",
    signOutFailedShort: "로그아웃하지 못했습니다",
    signInPrompt: "프로필을 열기 전에 로그인하세요.",
    reauthenticate: "다시 인증",
  },
  deleteAccount: {
    title: "계정 삭제",
    eyebrow: "계정 및 데이터",
    heading: {
      needsAttention: "삭제 작업에 확인이 필요합니다",
      inProgress: "삭제가 진행 중입니다",
      before: "계정을 삭제하기 전에",
      completed: "계정이 삭제되었습니다",
    },
    checkingStatus: "삭제 상태 확인 중…",
    intro:
      "Scryve 계정이 영구적으로 삭제되고 연결 플레이 기록은 익명 처리됩니다. 먼저 어떤 일이 일어나는지 확인하세요.",
    steps: {
      cloud: {
        title: "클라우드 계정이 삭제됩니다",
        body: "프로필, 아바타, 로그인 정보, 초대, 계정과 연결된 데이터가 삭제됩니다.",
      },
      history: {
        title: "공유된 대전 기록은 익명 처리됩니다",
        body: "다른 플레이어에게는 대전 결과가 남지만, 내 자리는 중립적인 아바타의 연결되지 않은 “삭제된 플레이어”로 표시됩니다.",
      },
      local: {
        title: "로컬 게임은 이 기기에 남습니다",
        body: "오프라인 게임 기록은 이 기기에만 저장됩니다. 계정과 연결되어 있지 않으며 원격으로 삭제되지 않습니다.",
      },
      signOut: {
        title: "모든 기기에서 로그아웃됩니다",
        body: "이 기기와 로그인된 다른 모든 기기에서 자동으로 로그아웃됩니다.",
      },
    },
    subscription: {
      heading: "Scryve Pro를 구독 중인가요?",
      body: "계정을 삭제해도 구독은 해지되지 않습니다. Apple 또는 Google Play에서 해지하기 전까지 요금이 계속 청구될 수 있습니다. 지금 삭제할 수는 있지만 남은 유료 이용 기간은 사용할 수 없게 됩니다.",
      manageApple: "Apple 구독 관리",
      manageGoogle: "Google Play 구독 관리",
    },
    signedInAs: "{{email}}(으)로 로그인됨",
    confirmLabel: "계속하려면 {{word}}을(를) 입력하세요",
    submit: {
      submitting: "요청 제출 중…",
      retry: "계정 삭제 다시 시도",
      delete: "계정 영구 삭제",
    },
    footnote: {
      retry:
        "다시 시도하면 마지막으로 완료되지 않은 단계부터 이어집니다. 익명 처리된 데이터는 복원되지 않습니다.",
      first: "삭제는 즉시 시작되며 처리가 시작된 후에는 되돌릴 수 없습니다.",
    },
    status: {
      failed:
        "Scryve가 자동으로 완료하지 못했습니다. 이 페이지로 돌아와 요청을 다시 제출해 재시도하세요.",
      identityPending:
        "연결된 데이터가 익명 처리되었습니다. 이제 Scryve가 로그인 ID를 삭제하고 있습니다.",
      processing:
        "Scryve가 연결 기록을 익명 처리하고 계정과 연결된 데이터를 삭제하는 중입니다. 이 페이지를 닫아도 됩니다.",
    },
    panel: {
      failed: {
        title: "삭제 작업에 확인이 필요합니다",
        body: "계정 데이터는 복원되지 않습니다. {{word}}을(를) 입력하고 다시 제출하여 남은 작업을 재시도하세요.",
      },
      completed: {
        title: "삭제 완료",
        body: "이 영수증에는 계정 정보가 포함되어 있지 않습니다.",
      },
      received: {
        title: "삭제 요청이 접수되었습니다",
        body: "요청이 처리되는 동안 새로운 연결 활동은 차단됩니다.",
      },
    },
    receipt: {
      completedBody: "Scryve가 로그인 계정을 삭제하고 연결 플레이 기록을 익명 처리했습니다.",
      failedBody: "Scryve가 남은 삭제 작업을 자동으로 완료하지 못했습니다.",
      lastUpdated: "마지막 업데이트 {{day}} {{time}}",
      next: {
        completed: "더 이상 필요한 조치가 없습니다.",
        failed: "다시 로그인하고 이 페이지로 돌아와 요청을 재시도하세요.",
        pending: "Scryve를 닫아도 됩니다. 돌아오면 이 페이지에서 계속 확인합니다.",
      },
      signInToRetry: "로그인하여 재시도",
      returnHome: "홈으로 돌아가기",
    },
    route: {
      statusCheckFailed:
        "Scryve가 삭제 상태를 확인하지 못했습니다. 확인이 성공할 때까지 계정 삭제를 사용할 수 없습니다.",
      signInPrompt: "Scryve 계정 삭제를 요청하려면 로그인하세요.",
      checkingReceipt: "삭제 영수증 확인 중…",
      checkingAccount: "계정 확인 중…",
      reconnect: "계정을 삭제하기 전에 Scryve에 다시 연결하세요.",
      submitFailed: "삭제 요청을 제출하지 못했습니다",
    },
  },
  cloud: {
    signInToContinue: "계속하려면 로그인하세요.",
    chooseUsername: "플레이어 사용자 이름을 선택하세요.",
    reconnect: "계속하려면 다시 연결하세요.",
    chooseUsernameAction: "사용자 이름 선택",
    unavailableHeading: "연결 기능을 사용할 수 없음",
    localPlayAvailable: "로컬 플레이는 계속 사용할 수 있습니다.",
    notConfigured:
      "이 빌드에서는 연결 기능을 사용할 수 없습니다. 로컬 플레이는 계속 사용할 수 있습니다.",
    closeSignIn: "로그인 닫기",
  },
  billing: {
    access: {
      checking: "이용 권한 확인 중…",
      renews: "{{date}}에 갱신",
      availableUntil: "{{date}}까지 이용 가능",
      active: "{{plan}} 이용 중",
      unavailable: "상태를 확인할 수 없음",
      free: "무료 플랜",
    },
    loading: "Scryve Pro 불러오는 중",
    manage: "관리",
    manageAccessibilityLabel: "Scryve {{plan}} 구독 관리",
    viewOptions: "옵션 보기",
    viewOptionsAccessibilityLabel: "Scryve Pro 옵션 보기",
    notConfigured: "Scryve Pro 구매가 설정되지 않았습니다.",
    missingApiKey: "RevenueCat 공개 API 키가 설정되지 않아 Scryve Pro를 구매할 수 없습니다.",
    errors: {
      revenueCatNotConfigured: "RevenueCat이 설정되지 않았습니다.",
      unexpected: "예기치 않은 구매 오류가 발생했습니다.",
      offline: "인터넷에 연결한 후 다시 시도하세요.",
      notAllowed: "이 기기 또는 스토어 계정에서는 구매할 수 없습니다.",
      productUnavailable: "현재 스토어에서는 이 Scryve Pro 옵션을 사용할 수 없습니다.",
      pending: "스토어에서 아직 이 구매를 처리하고 있습니다. 완료되면 이용 권한이 업데이트됩니다.",
      misconfigured: "이 빌드에는 Scryve Pro가 올바르게 설정되어 있지 않습니다.",
      failed: "구매를 완료하지 못했습니다.",
      waitForBilling: "결제가 계정에 연결될 때까지 기다린 후 다시 시도하세요.",
      foilWebOnly: "Foil 구매는 웹에서만 가능합니다.",
      manageBeforeFoil: "Foil로 전환하기 전에 기존 구독을 관리하세요.",
      productNotInStore: "현재 스토어에서 {{productId}}을(를) 사용할 수 없습니다.",
      paywallFailed: "Scryve Pro 결제 화면에서 요청을 완료하지 못했습니다.",
      noManagementPage: "이 고객에게는 아직 구독 관리 페이지가 없습니다.",
    },
  },
  foil: {
    pageTitle: "Scryve Foil Supporter",
    title: "Foil Supporter",
    price: "연 US$500",
    description: "Pro와 같은 기능. Scryve를 위한 선택형 후원. 취소할 때까지 매년 갱신됩니다.",
    signInPrompt: "로그인하여 Foil을 Scryve 계정에 연결하세요.",
    alreadyPro: "이미 Pro를 이용 중입니다. 플랜을 바꾸기 전에 기존 구독을 관리하세요.",
    manageSubscription: "구독 관리",
    openingCheckout: "결제 화면 여는 중…",
    choose: "Foil Supporter 선택",
    purchasesUnavailable: "이 빌드에서는 구매할 수 없습니다.",
  },
  legalConsent: {
    heading: {
      updatedPrivacy: "개인정보 처리방침이 업데이트되었습니다",
      updatedTerms: "이용약관이 업데이트되었습니다",
      beforeStart: "시작하기 전에",
    },
    intro: "이용약관과 개인정보 처리방침을 확인하세요. Scryve를 사용하려면 동의해야 합니다.",
    returning: {
      dated: {
        terms:
          "이용약관이 {{date}}에 변경되었습니다. Scryve를 계속 사용하려면 변경 내용을 확인하세요.",
        privacy:
          "개인정보 처리방침이 {{date}}에 변경되었습니다. Scryve를 계속 사용하려면 변경 내용을 확인하세요.",
        both: "이용약관과 개인정보 처리방침이 {{date}}에 변경되었습니다. Scryve를 계속 사용하려면 변경 내용을 확인하세요.",
      },
      undated: {
        terms: "이용약관이 변경되었습니다. Scryve를 계속 사용하려면 변경 내용을 확인하세요.",
        privacy:
          "개인정보 처리방침이 변경되었습니다. Scryve를 계속 사용하려면 변경 내용을 확인하세요.",
        both: "이용약관과 개인정보 처리방침이 변경되었습니다. Scryve를 계속 사용하려면 변경 내용을 확인하세요.",
      },
    },
    acceptance: {
      dated: {
        terms: '"동의"를 누르면 {{date}}자 이용약관에 동의하는 것입니다.',
        privacy: '"동의"를 누르면 {{date}}자 개인정보 처리방침에 동의하는 것입니다.',
        both: '"동의"를 누르면 {{date}}자 이용약관과 개인정보 처리방침에 동의하는 것입니다.',
      },
      undated: {
        terms: '"동의"를 누르면 현재 이용약관에 동의하는 것입니다.',
        privacy: '"동의"를 누르면 현재 개인정보 처리방침에 동의하는 것입니다.',
        both: '"동의"를 누르면 현재 이용약관과 개인정보 처리방침에 동의하는 것입니다.',
      },
    },
    readTerms: "이용약관 읽기",
    readPrivacy: "개인정보 처리방침 읽기",
    shareUsageHelper:
      "기본값은 꺼짐입니다. 공유는 원하는 기능을 만드는 데 도움이 됩니다. 자세한 내용은 개인정보 처리방침을 확인하세요.",
    sharingSaveFailed: "공유 설정을 저장하지 못했습니다. 다시 시도하거나 공유를 끄고 계속하세요.",
    saving: "저장 중…",
    agree: "동의",
  },
  legalDocument: {
    lastUpdated: "최종 업데이트 {{date}}",
  },
  consentSync: {
    syncing: "동의 내용 동기화 중…",
    stillPending: "계정 동기화가 아직 대기 중입니다. 동의 내용은 이 기기에 저장되었습니다.",
    pending: "동의 내용이 이 기기에 저장되었습니다. 계정 동기화 대기 중.",
    retrying: "다시 시도 중…",
    retryAccessibilityLabel: "계정 동의 동기화 다시 시도",
  },
  updates: {
    downloading: "업데이트 다운로드 중…",
    downloadingProgress: "업데이트 다운로드 중 {{percent}}%",
    ready: "업데이트 준비됨",
    cancelReady: "업데이트 준비 취소",
    restart: "다시 시작",
    whatsNew: "이번 업데이트 내용",
    dialogMessage: "다음에 Scryve를 열 때 적용됩니다. 게임은 어느 쪽이든 저장됩니다.",
    restartNow: "지금 다시 시작",
    later: "나중에",
    channelAfterRestart: "{{running}} (다시 시작 후 {{next}})",
    restarting: "Scryve를 다시 시작하는 중",
  },
  preview: {
    heading: "PR 미리보기",
    loading: "{{channel}} 불러오는 중…",
    busy: "다른 미리보기를 아직 불러오는 중입니다. 이 링크를 다시 여세요.",
    missing:
      "{{channel}}에 이 빌드에서 실행할 수 있는 업데이트가 없습니다. 새 미리보기 빌드가 필요할 수 있습니다.",
  },
  launch: {
    starting: "Scryve 시작 중…",
    startingAccessibilityLabel: "Scryve 시작 중",
  },
  rootError: {
    title: "문제가 발생했습니다",
    message:
      "Scryve에 예기치 않은 오류가 발생했습니다. 다시 시도하고, 문제가 계속되면 앱을 다시 시작하세요.",
  },
} satisfies LocaleNamespace
