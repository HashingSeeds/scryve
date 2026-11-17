const account = {
  // Button that goes to the Play tab.
  openPlay: "Go to Play",
  signIn: "Sign in",
  // ja: Stay means they are kept, not deleted: ローカルゲームはこのデバイスに残ります。 Never 保存されます.
  localGamesStay: "Local games stay on this device.",
  legal: {
    heading: "Legal",
    privacyPolicy: "Privacy Policy",
    termsOfUse: "Terms of Use",
    licenseAgreement: "License Agreement",
    licenseAgreementHint: "Opens Apple's standard license agreement in your browser",
    cookiePolicy: "Cookie Policy",
    gameContent: "Third-party game content",
    licenseOpenFailed: "Couldn't open the license agreement",
  },
  accountData: {
    label: "Account & data",
    accessibilityLabel: "Account and data",
    accessibilityHint: "Opens account deletion and data details",
  },
  shareUsage: "Share usage with Scryve",
  settings: {
    title: "Settings",
    localDefaults: "Local game defaults",
    general: "General",
    appearance: "Appearance",
    about: "About",
    version: "Version",
    // ar: Unit shown after a stepper number. Write "عدد اللاعبين"; لاعبون is wrong after any number.
    players: "players",
    // Label above a choice of which screen Scryve shows when it opens.
    openScryveTo: "When Scryve opens, show",
    launchDestination: {
      // The Play tab.
      play: "Play",
      decks: "Decks",
    },
    game: "Game",
    // Heading of the picker for the game and format new games start with.
    // ja: Heading for the defaults new games start with: 新しいゲームの初期設定.
    chooseGame: "Start new games as",
    closeGameChoices: "Close game choices",
    haptics: {
      label: "Haptic feedback",
    },
    theme: {
      heading: "Theme",
      system: "System",
      light: "Light",
      dark: "Dark",
    },
    appIcon: {
      heading: "App icon",
      changeFailed: "Could not change the app icon. Please try again.",
      lockedPro: "{{name}}, Scryve Pro",
      foilHeading: "Scryve Foil",
      opensPro: "Opens Scryve Pro",
      proFailed: "Couldn't check Scryve Pro, so Pro icons are locked.",
      names: {
        Default: "Default",
        // ko: '2'.
        Two: "Two",
        // ko: '3'.
        Three: "Three",
        Midnight: "Midnight",
        Graphite: "Graphite",
        Ink: "Ink",
        // ar: Icon drawn as an outline: "الإطار". المحيط reads as "the ocean".
        Outline: "Outline",
        // ko: An off-white color name: '아이보리'.
        Bone: "Bone",
        Paper: "Paper",
        Ash: "Ash",
        Pencil: "Pencil",
        Foil: "Foil",
        Contour: "Contour",
        Stripes: "Stripes",
        Neon: "Neon",
        // ar: Icon in blueprint style: "المخطط الأزرق". Bare المخطط is the Archenemy scheme word.
        Blueprint: "Blueprint",
        Gilded: "Gilded",
        Prism: "Prism",
        Holo: "Holo",
      },
    },
    notifications: {
      heading: "Notifications",
      feedbackReplies: "Feedback replies",
      feedbackRepliesHelper: "Replies always show up in Your feedback",
      renewalReminders: "Renewal reminders",
      renewalRemindersHelper_one: "{{count}} day before your subscription renews",
      renewalRemindersHelper_other: "{{count}} days before your subscription renews",
      // Android's name for Scryve's notification channel, shown in system settings.
      channel: "Replies and reminders",
      // Shown on the lock screen instead of a feedback reply when the player hides notification previews.
      feedbackReplyPreview: "New reply to your feedback",
      blockedTitle: "Notifications are off",
      blockedBody: "Turn on notifications for Scryve in Settings.",
      openSettings: "Open Settings",
    },
    privacy: {
      heading: "Privacy",
      shareUsageHelper:
        "Off by default. Shares usage with a random ID that isn't linked to your account. Details in Privacy Policy.",
      saveFailed: "Could not save your choice. Please try again.",
      unavailable: "Usage sharing is unavailable in this build. No PostHog events will be sent.",
    },
    appInfo: {
      heading: "App information",
      analyticsId: "Analytics ID: {{id}}",
      analyticsIdHint:
        "This ID helps us find your usage data. To ask us to delete it, email the ID to privacy@sowinghope.how.",
      version: "Version: {{value}}",
      build: "Build: {{value}}",
      runtime: "Runtime: {{value}}",
      update: "Update: {{value}}",
      channel: "Channel: {{value}}",
      platform: "Platform: {{value}}",
      notApplicable: "Not applicable",
      unavailable: "Unavailable",
      bundled: "Bundled",
      development: "Development",
    },
    beta: {
      label: "Beta updates",
      // hi: “नए अपडेट बाकी लोगों से पहले पाएँ। इनमें गड़बड़ हो सकती है।” (बाकी सबसे पहले reads as “first of all”.)
      helper: "Gets unreleased updates before everyone else. They may be unstable.",
    },
    backToPreview: "Back to preview",
    backToPreviewFailed: "Could not go back to preview. Try again.",
    copyDebugInfo: "Copy debug info",
    copied: "Copied",
    copyFailed: "Could not copy. Try again.",
    turns: {
      label: "Turns",
      // ko: '현재 누구의 턴인지 표시합니다. 턴 칩을 탭하면 다음 플레이어에게 넘어갑니다.'
      helper: "Shows whose turn it is. Tap the turn chip to pass.",
    },
    syncStats: {
      // Playful name for a hidden switch that shows technical timing numbers on the game board.
      // ko: Use YouTube's Korean name for the same menu: '전문가용 통계'.
      label: "Stats for nerds",
      helper:
        "Shows how long changes take to reach each device in online and nearby games, and how the card scanner finds cards.",
    },
  },
  support: {
    pageTitle: "Scryve Support",
    pageDescription:
      "Find answers to common questions, suggest a feature, report a bug, or contact support.",
    title: "Support",
    faq: {
      heading: "Frequently asked questions",
      restorePro: {
        question: "Restore Scryve Pro",
        answer:
          "Open Scryve, go to your account, choose Scryve Pro, and tap Restore Purchases. Use the same Apple or Google account that made the original purchase.",
      },
      manageSubscription: {
        question: "Manage or cancel a subscription",
        answer:
          "Subscriptions are managed by the store where you purchased them. On iPhone or iPad, open Settings, tap your name, then Subscriptions. On Android, open Google Play, tap your profile, then Payments & subscriptions.",
      },
      gameTrouble: {
        question: "Having trouble with a game?",
        answer:
          "Restart Scryve and try again. If the problem continues, report it here with a short description of what happened.",
      },
      accountPrivacy: {
        question: "Account or privacy questions",
        answer:
          "You can manage your account from Scryve’s account screen. Email support if you need help accessing or deleting your account.",
      },
    },
  },
  profile: {
    title: "Account",
    signedIn: "Signed in",
    yourAccount: "Your account",
    profileAndSecurity: "Profile and security",
    profileHint: "Opens the profile manager to change your name, email addresses, and password",
    profileDetails: "Name, email, password, and sign-in methods.",
    independence:
      "Scryve is independent and is not affiliated with or endorsed by the game publishers, rights holders, or data providers named in our game-content notice.",
    signingOut: "Signing out…",
    signOut: "Sign out",
    signOutFailed: "Could not sign out. Try again.",
    signOutFailedShort: "Could not sign out",
    signInPrompt: "Sign in before opening your profile.",
    reauthenticate: "Re-authenticate",
  },
  deleteAccount: {
    title: "Delete account",
    eyebrow: "ACCOUNT & DATA",
    heading: {
      // hi: “खाता हटाने के अनुरोध पर ध्यान दें”.
      needsAttention: "Your deletion needs attention",
      inProgress: "Your deletion is in progress",
      before: "Before you delete your account",
      completed: "Your account was deleted",
    },
    checkingStatus: "Checking deletion status…",
    intro:
      "This permanently deletes your Scryve account and anonymizes your connected-play history. Review what happens first.",
    steps: {
      cloud: {
        title: "Your cloud account is removed",
        body: "Your profile, avatar, sign-in, invitations, and account-linked connected data are deleted.",
      },
      history: {
        title: "Shared match history is anonymized",
        // ar: The entries are unlinked from the account and get a neutral avatar: "يحتفظ اللاعبون الآخرون بنتيجة المواجهة، لكن مقاعدك تتحول إلى إدخالات باسم «لاعب محذوف» غير مرتبطة بحسابك، مع صورة رمزية محايدة."
        // ja: The seats become 「削除されたプレイヤー」 with the default avatar (標準アバター) and are no longer linked to the account (アカウントとのつながりは解除されます). Avoid 中立的なアバター and として…解除.
        body: "Other players keep the match result, but your seats become unlinked “Deleted player” entries with a neutral avatar.",
      },
      local: {
        // ja: Stay means they are kept, not deleted: ローカルゲームはこのデバイスに残ります. Never 保存されます.
        title: "Local games stay on this device",
        body: "Offline game history is stored only on this device. It is not linked to your account and is not remotely erased.",
      },
      feedback: {
        title: "Feedback sent without your account stays",
        // hi: Quote the real labels: the screen is “सहायता”, then “आपका फ़ीडबैक”, and the button is “मेरा फ़ीडबैक हटाएँ”. Deleted feedback हट जाता है, not डिलीट हो जाता है.
        body: "Feedback you included your account with is deleted. Anything sent without it stays with the device that sent it. To remove that, open Support, then Your feedback, and tap Delete my feedback.",
      },
      signOut: {
        title: "All devices are signed out",
        body: "This device and any other signed-in devices are signed out automatically.",
      },
    },
    subscription: {
      heading: "Have a Scryve Pro subscription?",
      // es: Name the object in each clause so "it" never points at the wrong thing: "Eliminar tu cuenta no cancela la suscripción. Es posible que te sigan cobrando hasta que la canceles donde la contrataste. Aun así, puedes eliminar la cuenta ahora, pero perderás el tiempo pagado que te quede."
      body: "Deleting your account won't cancel it. You may keep being charged until you cancel it where you subscribed. You can still delete now, but you'll lose access to any paid time left.",
      manageApple: "Manage Apple subscriptions",
      manageGoogle: "Manage Google Play subscriptions",
      // Web purchases are managed in RevenueCat's customer portal. Its billing emails link there, and the portal can email a sign-in link, so this works after the account is gone.
      web: "Subscribed on the web? Cancel in the customer portal. Every Scryve Pro billing email links to it.",
      manageWeb: "Manage web subscription",
    },
    signedInAs: "Signed in as {{email}}",
    confirmLabel: "Type {{word}} to continue",
    submit: {
      submitting: "Submitting request…",
      retry: "Retry account deletion",
      delete: "Permanently delete account",
    },
    footnote: {
      retry: "Retrying continues from the last incomplete step; anonymized data is not restored.",
      first: "Deletion begins immediately and cannot be undone after processing starts.",
    },
    status: {
      failed:
        "Scryve could not finish automatically. Return to this page and submit the request again to retry.",
      identityPending:
        "Your connected data is anonymized. Scryve is now removing your sign-in identity.",
      processing:
        "Scryve is anonymizing connected history and removing account-linked data. You can close this page safely.",
    },
    panel: {
      failed: {
        title: "Deletion needs attention",
        body: "No account data will be restored. Type {{word}} and submit again to retry the remaining work.",
      },
      completed: {
        title: "Deletion complete",
        // ko: Receipt here is a deletion confirmation, not a purchase receipt: '이 확인서에는 계정 정보가 포함되어 있지 않습니다.' Never 영수증.
        body: "This receipt contains no account details.",
      },
      received: {
        title: "Deletion request received",
        body: "New connected activity is blocked while the request is processed.",
      },
    },
    receipt: {
      completedBody:
        "Scryve removed your sign-in account and anonymized your connected-play history.",
      failedBody: "Scryve could not finish the remaining deletion work automatically.",
      lastUpdated: "Last updated {{day}} at {{time}}",
      next: {
        completed: "No further action is needed.",
        failed: "Sign in again, return to this page, and retry the request.",
        pending: "You can close Scryve. This page will keep checking when you return.",
      },
      signInToRetry: "Sign in to retry",
      returnHome: "Return home",
    },
    route: {
      statusCheckFailed:
        "Scryve couldn't check your deletion status. Account deletion stays unavailable until the check succeeds.",
      signInPrompt: "Sign in to request deletion of your Scryve account.",
      // ko: '삭제 확인서 확인 중…'. Never 영수증.
      // es: Avoid "Comprobando tu comprobante". Use "Cargando tu comprobante de eliminación…".
      checkingReceipt: "Checking your deletion receipt…",
      checkingAccount: "Checking your account…",
      reconnect: "Reconnect to Scryve before deleting your account.",
      submitFailed: "Could not submit the deletion request",
    },
  },
  cloud: {
    signInToContinue: "Sign in to continue.",
    chooseUsername: "Choose your player username.",
    reconnect: "Reconnect to continue.",
    chooseUsernameAction: "Choose username",
    unavailableHeading: "Connected features unavailable",
    localPlayAvailable: "Local play remains available.",
    notConfigured:
      "Connected features are unavailable in this build. Local play remains available.",
  },
  billing: {
    // Shown when a signed-out player taps something that needs Scryve Pro, beside a Sign in button.
    // ja: Keep both halves, buying Pro and using Pro already bought: Proを購入する、または購入済みのProを使うにはサインインしてください。
    proNeedsAccount:
      "Scryve Pro is tied to an account. Sign in to get Pro or use Pro you already have.",
    // Asked right after someone buys a yearly plan.
    renewalPrompt: {
      title: "Remind you before it renews?",
      body_one: "Get a notification {{count}} day before your next yearly charge.",
      body_other: "Get a notification {{count}} days before your next yearly charge.",
      notNow: "Not now",
      remind: "Remind me",
    },
    access: {
      checking: "Checking access…",
      renews: "Renews {{date}}",
      availableUntil: "Available until {{date}}",
      active: "{{plan}} access active",
      unavailable: "Status unavailable",
      free: "Free plan",
    },
    loading: "Loading Scryve Pro",
    manage: "Manage",
    manageAccessibilityLabel: "Manage Scryve {{plan}} subscription",
    viewOptions: "View options",
    viewOptionsAccessibilityLabel: "View Scryve Pro options",
    paywallFailedTitle: "Scryve Pro didn't open",
    notConfigured: "Scryve Pro purchases are not configured.",
    missingApiKey:
      "Scryve Pro purchases are unavailable because the RevenueCat public API key is not configured.",
    errors: {
      revenueCatNotConfigured: "RevenueCat is not configured.",
      unexpected: "An unexpected purchase error occurred.",
      offline: "Connect to the internet and try again.",
      notAllowed: "Purchases are not allowed on this device or store account.",
      productUnavailable: "This Scryve Pro option is not available from the current store.",
      pending: "The store is still processing this purchase. Access will update when it completes.",
      misconfigured: "Scryve Pro is not configured correctly for this build.",
      failed: "The purchase could not be completed.",
      waitForBilling: "Wait for billing to connect to your account, then try again.",
      foilWebOnly: "Foil purchases are only available on the web.",
      manageBeforeFoil: "Manage your existing subscription before switching to Foil.",
      productNotInStore: "{{productId}} is not available from the current store.",
      paywallFailed: "The Scryve Pro paywall could not complete the request.",
      noManagementPage: "No subscription management page is available for this customer yet.",
    },
  },
  foil: {
    pageTitle: "Scryve Foil Supporter",
    title: "Foil Supporter",
    // {{amount}} is the yearly price in US dollars. Place the US$ mark where your language writes it.
    price: "US${{amount}}/year",
    description:
      "The same Pro features. Optional support for Scryve. Renews yearly until canceled.",
    signInPrompt: "Sign in to link Foil to your Scryve account.",
    alreadyPro:
      "You already have Pro access. Manage your existing subscription before switching plans.",
    manageSubscription: "Manage subscription",
    openingCheckout: "Opening checkout…",
    choose: "Choose Foil Supporter",
    purchasesUnavailable: "Purchases are unavailable in this build.",
  },
  legalDocument: {
    lastUpdated: "Last updated {{date}}",
  },
  updates: {
    downloading: "Downloading update…",
    downloadingProgress: "Downloading update {{progress, percent}}",
    ready: "Update ready",
    // Accessibility label for tapping outside the update-ready sheet. It does not cancel the update.
    cancelReady: "Close",
    restart: "Restart",
    whatsNew: "What's in this update",
    // ko: Say which options: '다음에 Scryve를 열 때 적용됩니다. 지금 다시 시작해도, 나중에 해도 게임은 저장됩니다.'
    // hi: “अगली बार Scryve खोलने पर लागू होगा। आपका गेम हर हाल में सेव रहेगा।”
    dialogMessage: "Applies the next time you open Scryve. Your game is saved either way.",
    restartNow: "Restart now",
    later: "Later",
    channelAfterRestart: "{{running}} ({{next}} after restart)",
    restarting: "Restarting Scryve",
  },
  preview: {
    heading: "PR preview",
    loading: "Loading {{channel}}…",
    busy: "Another preview is still loading. Open this link again.",
    missing: "{{channel}} has no update this build can run. It may need a new preview build.",
  },
  launch: {
    starting: "Starting Scryve…",
    startingAccessibilityLabel: "Starting Scryve",
  },
  rootError: {
    title: "Something went wrong",
    message:
      "Scryve hit an unexpected error. Try again, or restart the app if the problem continues.",
  },
}

export default account
