const account = {
  // Button that goes to the Play tab.
  openPlay: "Go to Play",
  signIn: "Sign in",
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
    players: "players",
    // Label above a choice of which screen Scryve shows when it opens.
    openScryveTo: "When Scryve opens, show",
    launchDestination: {
      play: "Play",
      decks: "Decks",
    },
    launchDestinationHint: "Play resumes a current game or opens a fresh board.",
    game: "Game",
    // Heading of the picker for the game and format new games start with.
    chooseGame: "Start new games as",
    closeGameChoices: "Close game choices",
    defaultsHint:
      "Set these only when you want new games to start with the same system and format.",
    haptics: {
      label: "Haptic feedback",
      helper: "A subtle tap response after life changes. Failures never block play.",
    },
    theme: {
      heading: "Theme",
      system: "System",
      light: "Light",
      dark: "Dark",
      hint: "System follows your device appearance. Light and dark stay fixed until changed here.",
    },
    appIcon: {
      heading: "App icon",
      changeFailed: "Could not change the app icon. Please try again.",
      lockedPro: "{{name}}, Scryve Pro",
      foilHeading: "Scryve Foil",
      opensPro: "Opens Scryve Pro",
      opensSignIn: "Opens sign in",
      names: {
        Default: "Default",
        Two: "Two",
        Three: "Three",
        Midnight: "Midnight",
        Graphite: "Graphite",
        Ink: "Ink",
        Outline: "Outline",
        Bone: "Bone",
        Paper: "Paper",
        Ash: "Ash",
        Pencil: "Pencil",
        Foil: "Foil",
        Contour: "Contour",
        Stripes: "Stripes",
        Neon: "Neon",
        Blueprint: "Blueprint",
        Gilded: "Gilded",
        Prism: "Prism",
        Holo: "Holo",
      },
    },
    menuButton: {
      heading: "Game menu button",
      hint: "Changes the shape at the center of the board. Prism tints the button with the colors of everyone at the table.",
    },
    privacy: {
      heading: "Privacy",
      shareUsageHelper:
        "Off by default. Shares usage with a random ID that isn't linked to your account. Details in Privacy Policy.",
      saveFailed: "Could not save your choice. Please try again.",
      unavailable: "Usage sharing is unavailable in this build. No PostHog events will be sent.",
    },
    accountData: {
      description:
        "Manage the cloud data tied to your Scryve account. Local games stay on this device.",
      requestDeletion: "Request account deletion",
      requestDeletionHint: "Opens the account deletion request page",
    },
    help: {
      heading: "Help",
      support: "Help & support",
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
      helper: "Gets unreleased updates before everyone else. They may be unstable.",
    },
    backToPreview: "Back to preview",
    backToPreviewFailed: "Could not go back to preview. Try again.",
    copyDebugInfo: "Copy debug info",
    copied: "Copied",
    copyFailed: "Could not copy. Try again.",
  },
  support: {
    pageTitle: "Scryve Help",
    pageDescription:
      "Learn how to get started with Scryve, find answers to common questions, or contact support.",
    title: "Help",
    subtitle:
      "Answers about games, accounts, and Scryve Pro. Send us a message when you need help.",
    contactUs: "Contact us",
    contactReason: "Contact reason",
    kind: {
      bug: "Report a problem",
      help: "Ask for help",
    },
    messageLabel: {
      bug: "What happened?",
      help: "How can we help?",
    },
    messagePlaceholder: {
      bug: "What happened? What did you expect?",
      help: "Tell us what you need help with",
    },
    emailLabel: {
      bug: "Email for a reply (optional)",
      help: "Email for a reply",
    },
    emailInvalid: "Enter a valid email address.",
    replyTime: "We usually reply within two business days.",
    selectedScreenshot: "Selected screenshot",
    removeScreenshot: "Remove screenshot",
    addScreenshot: "Add screenshot",
    disclosure:
      "Sends your message, email if provided, app version, build, platform, and any screenshot you add to Sentry.",
    send: "Send",
    preferEmail: "Prefer email?",
    emailSupport: "Email support",
    status: {
      queued: "Feedback queued. If you are offline, it will send when you reconnect.",
      saveFailed: "Could not save your message. Try again or email us.",
      screenshotFailed: "Could not add that screenshot. Try another image.",
    },
    gettingStarted: {
      heading: "Getting started",
      startGame: {
        title: "Start a game",
        body: "Open Play. Your fresh board uses the defaults saved in Settings.",
      },
      choosePlay: {
        title: "Choose how to play",
        body: "Play together on one device, or choose Connected to play on separate devices.",
      },
      setUpTable: {
        title: "Set up the table",
        body: "Select the number of players and starting life, then start the game.",
      },
    },
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
          "You can manage your account from Scryve’s account screen. Contact us if you need help accessing or deleting your account.",
      },
    },
    appVersion: "Scryve {{version}}",
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
        body: "Other players keep the match result, but your seats become unlinked “Deleted player” entries with a neutral avatar.",
      },
      local: {
        title: "Local games stay on this device",
        body: "Offline game history is stored only on this device. It is not linked to your account and is not remotely erased.",
      },
      signOut: {
        title: "All devices are signed out",
        body: "This device and any other signed-in devices are signed out automatically.",
      },
    },
    subscription: {
      heading: "Have a Scryve Pro subscription?",
      body: "Deleting your account won't cancel it. You may keep being charged until you cancel through Apple or Google Play. You can still delete now, but you'll lose access to any paid time left.",
      manageApple: "Manage Apple subscriptions",
      manageGoogle: "Manage Google Play subscriptions",
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
    closeSignIn: "Close sign in",
  },
  billing: {
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
    price: "US$500/year",
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
  legalConsent: {
    heading: {
      updatedPrivacy: "We have updated our privacy policy",
      updatedTerms: "We have updated our terms",
      beforeStart: "Before you start",
    },
    intro:
      "Please review our Terms of Use and Privacy Policy. You need to accept them to use Scryve.",
    returning: {
      dated: {
        terms:
          "Our Terms of Use changed on {{date}}. Please review the update to keep using Scryve.",
        privacy:
          "Our Privacy Policy changed on {{date}}. Please review the update to keep using Scryve.",
        both: "Our Terms of Use and Privacy Policy changed on {{date}}. Please review the update to keep using Scryve.",
      },
      undated: {
        terms: "Our Terms of Use have changed. Please review the updates to keep using Scryve.",
        privacy: "Our Privacy Policy have changed. Please review the updates to keep using Scryve.",
        both: "Our Terms of Use and Privacy Policy have changed. Please review the updates to keep using Scryve.",
      },
    },
    acceptance: {
      dated: {
        terms: 'By tapping "I agree" you accept the Terms of Use dated {{date}}.',
        privacy: 'By tapping "I agree" you accept the Privacy Policy dated {{date}}.',
        both: 'By tapping "I agree" you accept the Terms of Use and Privacy Policy dated {{date}}.',
      },
      undated: {
        terms: 'By tapping "I agree" you accept the current Terms of Use.',
        privacy: 'By tapping "I agree" you accept the current Privacy Policy.',
        both: 'By tapping "I agree" you accept the current Terms of Use and Privacy Policy.',
      },
    },
    readTerms: "Read the Terms of Use",
    readPrivacy: "Read the Privacy Policy",
    shareUsageHelper:
      "Off by default. Sharing helps us build what you want. Details in Privacy Policy.",
    sharingSaveFailed:
      "Could not save your sharing choice. Try again or turn sharing off to continue.",
    saving: "Saving…",
    agree: "I agree",
  },
  legalDocument: {
    lastUpdated: "Last updated {{date}}",
  },
  consentSync: {
    syncing: "Syncing your agreement…",
    stillPending: "Account sync is still pending. Your agreement is saved on this device.",
    pending: "Agreement saved on this device. Account sync pending.",
    retrying: "Retrying…",
    retryAccessibilityLabel: "Retry account consent sync",
  },
  updates: {
    downloading: "Downloading update…",
    downloadingProgress: "Downloading update {{percent}}%",
    ready: "Update ready",
    // Accessibility label for tapping outside the update-ready sheet. It does not cancel the update.
    cancelReady: "Close",
    restart: "Restart",
    whatsNew: "What's in this update",
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
