// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  openPlay: "プレイへ移動",
  signIn: "サインイン",
  localGamesStay: "ローカルゲームはこのデバイスに保存されます。",
  legal: {
    heading: "法的情報",
    privacyPolicy: "プライバシーポリシー",
    termsOfUse: "利用規約",
    licenseAgreement: "使用許諾契約",
    licenseAgreementHint: "Appleの標準使用許諾契約をブラウザで開きます",
    cookiePolicy: "Cookieポリシー",
    gameContent: "第三者のゲームコンテンツ",
    licenseOpenFailed: "使用許諾契約を開けませんでした",
  },
  accountData: {
    label: "アカウントとデータ",
    accessibilityLabel: "アカウントとデータ",
    accessibilityHint: "アカウント削除とデータの詳細を開きます",
  },
  shareUsage: "Scryveに利用状況を共有",
  settings: {
    title: "設定",
    localDefaults: "ローカルゲームの初期設定",
    players: "プレイヤー",
    openScryveTo: "Scryveを開いたときに表示する画面",
    launchDestination: {
      play: "プレイ",
      decks: "デッキ",
    },
    launchDestinationHint: "プレイは進行中のゲームを再開するか、新しいボードを開きます。",
    game: "ゲーム",
    chooseGame: "新しいゲームの設定",
    closeGameChoices: "ゲームの選択肢を閉じる",
    defaultsHint: "新しいゲームを同じシステムとフォーマットで始めたい場合のみ設定してください。",
    haptics: {
      label: "触覚フィードバック",
      helper: "ライフが変わると、軽い振動で知らせます。失敗してもプレイは妨げられません。",
    },
    theme: {
      heading: "テーマ",
      system: "システム",
      light: "ライト",
      dark: "ダーク",
      hint: "「システム」はデバイスの外観設定に従います。ライトとダークは、ここで変更するまで固定されます。",
    },
    appIcon: {
      heading: "アプリアイコン",
      changeFailed: "アプリアイコンを変更できませんでした。もう一度お試しください。",
      lockedPro: "{{name}}、Scryve Pro",
      foilHeading: "Scryve Foil",
      opensPro: "Scryve Proを開きます",
      opensSignIn: "サインインを開きます",
      names: {
        Default: "デフォルト",
        Two: "ツー",
        Three: "スリー",
        Midnight: "ミッドナイト",
        Graphite: "グラファイト",
        Ink: "インク",
        Outline: "アウトライン",
        Bone: "ボーン",
        Paper: "ペーパー",
        Ash: "アッシュ",
        Pencil: "ペンシル",
        Foil: "Foil",
        Contour: "コントゥア",
        Stripes: "ストライプ",
        Neon: "ネオン",
        Blueprint: "ブループリント",
        Gilded: "ギルデッド",
        Prism: "プリズム",
        Holo: "ホロ",
      },
    },
    privacy: {
      heading: "プライバシー",
      shareUsageHelper:
        "初期設定ではオフです。アカウントに紐づかないランダムIDで利用状況を共有します。詳細はプライバシーポリシーをご覧ください。",
      saveFailed: "選択を保存できませんでした。もう一度お試しください。",
      unavailable:
        "このビルドでは利用状況の共有は利用できません。PostHogイベントは送信されません。",
    },
    accountData: {
      description:
        "Scryveアカウントに紐づくクラウドデータを管理します。ローカルゲームはこのデバイスに残ります。",
      requestDeletion: "アカウント削除をリクエスト",
      requestDeletionHint: "アカウント削除リクエストのページを開きます",
    },
    help: {
      heading: "ヘルプ",
      support: "ヘルプとサポート",
    },
    appInfo: {
      heading: "アプリ情報",
      analyticsId: "分析ID: {{id}}",
      analyticsIdHint:
        "このIDは利用データの特定に使われます。削除を依頼する場合は、IDをprivacy@sowinghope.howへメールしてください。",
      version: "バージョン: {{value}}",
      build: "ビルド: {{value}}",
      runtime: "ランタイム: {{value}}",
      update: "アップデート: {{value}}",
      channel: "チャンネル: {{value}}",
      platform: "プラットフォーム: {{value}}",
      notApplicable: "該当なし",
      unavailable: "利用不可",
      bundled: "同梱",
      development: "開発",
    },
    beta: {
      label: "ベータ版アップデート",
      helper: "未公開のアップデートを先行して入手します。不安定な場合があります。",
    },
    backToPreview: "プレビューに戻る",
    backToPreviewFailed: "プレビューに戻れませんでした。もう一度お試しください。",
    copyDebugInfo: "デバッグ情報をコピー",
    copied: "コピーしました",
    copyFailed: "コピーできませんでした。もう一度お試しください。",
  },
  support: {
    pageTitle: "Scryveヘルプ",
    pageDescription: "Scryveの始め方、よくある質問の答え、サポートへの連絡方法をご案内します。",
    title: "ヘルプ",
    subtitle:
      "ゲーム、アカウント、Scryve Proに関する回答です。お困りの際はメッセージをお送りください。",
    contactUs: "お問い合わせ",
    contactReason: "お問い合わせの種類",
    kind: {
      bug: "不具合を報告",
      help: "ヘルプを依頼",
      feedback: "フィードバックを送る",
    },
    messageLabel: {
      bug: "何が起きましたか?",
      help: "どのようなご用件ですか?",
      feedback: "ご意見をお聞かせください",
    },
    messagePlaceholder: {
      bug: "何が起きましたか?どうなると思いましたか?",
      help: "お困りの内容をお知らせください",
      feedback: "アイデア、ご要望など何でも",
    },
    emailLabel: {
      bug: "返信用メールアドレス(任意)",
      help: "返信用メールアドレス",
      feedback: "返信用メールアドレス(任意)",
    },
    emailInvalid: "有効なメールアドレスを入力してください。",
    translationNotice:
      "どの言語でも書けます。AIツールで翻訳する場合があります。詳しくは<privacy>プライバシーポリシー</privacy>をご覧ください。",
    replyTime: "通常、2営業日以内に返信します。",
    selectedScreenshot: "選択したスクリーンショット",
    removeScreenshot: "スクリーンショットを削除",
    addScreenshot: "スクリーンショットを追加",
    disclosure:
      "メッセージ、入力した場合はメールアドレス、アプリのバージョン、ビルド、プラットフォーム、追加したスクリーンショットをSentryに送信します。",
    send: "送信",
    preferEmail: "メールをご希望ですか?",
    emailSupport: "メールでサポートに連絡",
    status: {
      queued: "フィードバックを保存しました。オフラインの場合は、再接続時に送信されます。",
      saveFailed:
        "メッセージを保存できませんでした。もう一度お試しいただくか、メールでご連絡ください。",
      screenshotFailed: "そのスクリーンショットを追加できませんでした。別の画像をお試しください。",
    },
    gettingStarted: {
      heading: "はじめに",
      startGame: {
        title: "ゲームを始める",
        body: "オープンプレイを開きます。新しいボードには設定で保存した初期設定が使われます。",
      },
      choosePlay: {
        title: "プレイ方法を選ぶ",
        body: "1台のデバイスで一緒に遊ぶか、「通信対戦」を選んでそれぞれのデバイスで遊べます。",
      },
      setUpTable: {
        title: "テーブルを設定する",
        body: "プレイヤー数と初期ライフを選んで、ゲームを開始してください。",
      },
    },
    faq: {
      heading: "よくある質問",
      restorePro: {
        question: "Scryve Proを復元",
        answer:
          "Scryveを開き、アカウントからScryve Proを選んで「購入を復元」をタップしてください。最初に購入したときと同じAppleアカウントまたはGoogleアカウントを使用してください。",
      },
      manageSubscription: {
        question: "サブスクリプションの管理・解約",
        answer:
          "サブスクリプションは購入したストアで管理されます。iPhoneまたはiPadでは、設定を開き、自分の名前をタップして「サブスクリプション」を選びます。Androidでは、Google Playを開き、プロフィールをタップして「お支払いと定期購入」を選びます。",
      },
      gameTrouble: {
        question: "ゲームで問題が発生しましたか?",
        answer:
          "Scryveを再起動してもう一度お試しください。問題が続く場合は、状況を簡単に書いてここから報告してください。",
      },
      accountPrivacy: {
        question: "アカウントやプライバシーについて",
        answer:
          "アカウントはScryveのアカウント画面で管理できます。アカウントへのアクセスや削除でお困りの場合はお問い合わせください。",
      },
    },
    appVersion: "Scryve {{version}}",
  },
  profile: {
    title: "アカウント",
    signedIn: "サインイン済み",
    yourAccount: "あなたのアカウント",
    profileAndSecurity: "プロフィールとセキュリティ",
    profileHint: "プロフィール管理を開き、名前、メールアドレス、パスワードを変更します",
    profileDetails: "名前、メール、パスワード、サインイン方法。",
    independence:
      "Scryveは独立したアプリであり、ゲーム内容に関する通知に記載のゲーム発行元、権利者、データ提供元とは提携しておらず、承認も受けていません。",
    signingOut: "サインアウト中…",
    signOut: "サインアウト",
    signOutFailed: "サインアウトできませんでした。もう一度お試しください。",
    signOutFailedShort: "サインアウトできませんでした",
    signInPrompt: "プロフィールを開く前にサインインしてください。",
    reauthenticate: "再認証",
  },
  deleteAccount: {
    title: "アカウントを削除",
    eyebrow: "アカウントとデータ",
    heading: {
      needsAttention: "削除に対応が必要です",
      inProgress: "削除を処理中です",
      before: "アカウントを削除する前に",
      completed: "アカウントを削除しました",
    },
    checkingStatus: "削除の状況を確認中…",
    intro:
      "Scryveアカウントを完全に削除し、通信対戦の履歴を匿名化します。先に内容をご確認ください。",
    steps: {
      cloud: {
        title: "クラウドアカウントが削除されます",
        body: "プロフィール、アバター、サインイン情報、招待、アカウントに紐づく通信対戦データが削除されます。",
      },
      history: {
        title: "共有されたマッチ履歴は匿名化されます",
        body: "ほかのプレイヤーにはマッチ結果が残りますが、あなたの席は中立的なアバターの「削除されたプレイヤー」として関連付けが解除されます。",
      },
      local: {
        title: "ローカルゲームはこのデバイスに保存されます",
        body: "オフラインのゲーム履歴はこのデバイスにのみ保存されています。アカウントに紐づいておらず、リモートで消去されることはありません。",
      },
      signOut: {
        title: "すべてのデバイスがサインアウトされます",
        body: "このデバイスとサインイン中の他のデバイスは自動的にサインアウトされます。",
      },
    },
    subscription: {
      heading: "Scryve Proを購読していますか?",
      body: "アカウントを削除しても解約にはなりません。AppleまたはGoogle Playで解約するまで課金が続く場合があります。今すぐ削除もできますが、残りの有料期間は利用できなくなります。",
      manageApple: "Appleのサブスクリプションを管理",
      manageGoogle: "Google Playのサブスクリプションを管理",
    },
    signedInAs: "{{email}}でサインイン中",
    confirmLabel: "続行するには{{word}}と入力してください",
    submit: {
      submitting: "リクエストを送信中…",
      retry: "アカウント削除を再試行",
      delete: "アカウントを完全に削除",
    },
    footnote: {
      retry:
        "再試行すると、最後に未完了だった手順から続行されます。匿名化されたデータは復元されません。",
      first: "削除はすぐに始まり、処理が始まると元に戻せません。",
    },
    status: {
      failed:
        "Scryveは自動で完了できませんでした。このページに戻り、もう一度リクエストを送信して再試行してください。",
      identityPending:
        "通信対戦のデータは匿名化されました。現在、Scryveがサインイン情報を削除しています。",
      processing:
        "Scryveは通信対戦の履歴を匿名化し、アカウントに紐づくデータを削除しています。このページは安全に閉じられます。",
    },
    panel: {
      failed: {
        title: "削除に対応が必要です",
        body: "アカウントデータは復元されません。{{word}}と入力して再度送信すると、残りの処理を再試行します。",
      },
      completed: {
        title: "削除が完了しました",
        body: "この受領書にはアカウントの詳細は含まれません。",
      },
      received: {
        title: "削除リクエストを受け付けました",
        body: "リクエストの処理中は、新しい通信対戦のアクティビティがブロックされます。",
      },
    },
    receipt: {
      completedBody: "Scryveはサインイン用アカウントを削除し、通信対戦の履歴を匿名化しました。",
      failedBody: "Scryveは残りの削除作業を自動で完了できませんでした。",
      lastUpdated: "最終更新 {{day}} {{time}}",
      next: {
        completed: "これ以上の操作は不要です。",
        failed: "もう一度サインインし、このページに戻ってリクエストをやり直してください。",
        pending: "Scryveを閉じても問題ありません。戻ると、このページは確認を続けます。",
      },
      signInToRetry: "サインインして再試行",
      returnHome: "ホームに戻る",
    },
    route: {
      statusCheckFailed:
        "削除の状況を確認できませんでした。確認が成功するまでアカウントは削除できません。",
      signInPrompt: "Scryveアカウントの削除をリクエストするには、サインインしてください。",
      checkingReceipt: "削除の受付記録を確認中…",
      checkingAccount: "アカウントを確認中…",
      reconnect: "アカウントを削除する前に、Scryveに再接続してください。",
      submitFailed: "削除リクエストを送信できませんでした",
    },
  },
  cloud: {
    signInToContinue: "続行するにはサインインしてください。",
    chooseUsername: "プレイヤーのユーザー名を選んでください。",
    reconnect: "続行するには再接続してください。",
    chooseUsernameAction: "ユーザー名を選択",
    unavailableHeading: "通信対戦機能は利用できません",
    localPlayAvailable: "ローカルプレイは引き続き利用できます。",
    notConfigured:
      "このビルドでは通信対戦機能を利用できません。ローカルプレイは引き続き利用できます。",
    closeSignIn: "サインインを閉じる",
  },
  billing: {
    access: {
      checking: "アクセスを確認中…",
      renews: "{{date}}に更新",
      availableUntil: "{{date}}まで利用可能",
      active: "{{plan}}を利用中",
      unavailable: "状況を取得できません",
      free: "無料プラン",
    },
    loading: "Scryve Proを読み込み中",
    manage: "管理",
    manageAccessibilityLabel: "Scryve {{plan}}のサブスクリプションを管理",
    viewOptions: "オプションを見る",
    viewOptionsAccessibilityLabel: "Scryve Proのオプションを見る",
    notConfigured: "Scryve Proの購入は設定されていません。",
    missingApiKey: "RevenueCatの公開APIキーが設定されていないため、Scryve Proを購入できません。",
    errors: {
      revenueCatNotConfigured: "RevenueCatが設定されていません。",
      unexpected: "購入中に予期しないエラーが発生しました。",
      offline: "インターネットに接続して、もう一度お試しください。",
      notAllowed: "このデバイスまたはストアアカウントでは購入が許可されていません。",
      productUnavailable: "このScryve Proのオプションは現在のストアでは利用できません。",
      pending: "ストアがこの購入を処理中です。完了するとアクセスが更新されます。",
      misconfigured: "このビルドではScryve Proが正しく設定されていません。",
      failed: "購入を完了できませんでした。",
      waitForBilling: "課金がアカウントに接続されるまで待ってから、もう一度お試しください。",
      foilWebOnly: "Foilの購入はウェブでのみご利用いただけます。",
      manageBeforeFoil: "Foilに切り替える前に、現在のサブスクリプションを管理してください。",
      productNotInStore: "{{productId}}は現在のストアでは利用できません。",
      paywallFailed: "Scryve Proのペイウォールでリクエストを完了できませんでした。",
      noManagementPage: "このお客様向けのサブスクリプション管理ページはまだ利用できません。",
    },
  },
  foil: {
    pageTitle: "Scryve Foil Supporter",
    title: "Foil Supporter",
    price: "年額500米ドル",
    description: "Proと同じ機能です。Scryveへの任意のサポートです。解約するまで毎年更新されます。",
    signInPrompt: "FoilをScryveアカウントに連携するには、サインインしてください。",
    alreadyPro:
      "すでにProをご利用中です。プランを切り替える前に、現在のサブスクリプションを管理してください。",
    manageSubscription: "サブスクリプションを管理",
    openingCheckout: "チェックアウトを開いています…",
    choose: "Foil Supporterを選ぶ",
    purchasesUnavailable: "このビルドでは購入できません。",
  },
  legalConsent: {
    heading: {
      updatedPrivacy: "プライバシーポリシーを更新しました",
      updatedTerms: "利用規約を更新しました",
      beforeStart: "開始する前に",
    },
    intro: "利用規約とプライバシーポリシーをご確認ください。Scryveを使うには同意が必要です。",
    returning: {
      dated: {
        terms:
          "利用規約が{{date}}に変更されました。Scryveを引き続き使うには、更新内容をご確認ください。",
        privacy:
          "プライバシーポリシーが{{date}}に変更されました。Scryveを引き続き使うには、更新内容をご確認ください。",
        both: "利用規約とプライバシーポリシーが{{date}}に変更されました。Scryveを引き続き使うには、更新内容をご確認ください。",
      },
      undated: {
        terms: "利用規約が変更されました。Scryveを引き続き使うには、更新内容をご確認ください。",
        privacy:
          "プライバシーポリシーが変更されました。Scryveを引き続き使うには、更新内容をご確認ください。",
        both: "利用規約とプライバシーポリシーが変更されました。Scryveを引き続き使うには、更新内容をご確認ください。",
      },
    },
    acceptance: {
      dated: {
        terms: "「同意する」をタップすると、{{date}}付の利用規約に同意したことになります。",
        privacy:
          "「同意する」をタップすると、{{date}}付のプライバシーポリシーに同意したことになります。",
        both: "「同意する」をタップすると、{{date}}付の利用規約とプライバシーポリシーに同意したことになります。",
      },
      undated: {
        terms: "「同意する」をタップすると、現行の利用規約に同意したことになります。",
        privacy: "「同意する」をタップすると、現行のプライバシーポリシーに同意したことになります。",
        both: "「同意する」をタップすると、現行の利用規約とプライバシーポリシーに同意したことになります。",
      },
    },
    readTerms: "利用規約を読む",
    readPrivacy: "プライバシーポリシーを読む",
    shareUsageHelper:
      "初期設定ではオフです。共有いただくと、皆さんが求める機能の開発に役立ちます。詳細はプライバシーポリシーをご覧ください。",
    sharingSaveFailed:
      "共有設定を保存できませんでした。もう一度お試しいただくか、共有をオフにして続行してください。",
    saving: "保存中…",
    agree: "同意する",
  },
  legalDocument: {
    lastUpdated: "最終更新日 {{date}}",
  },
  consentSync: {
    syncing: "同意を同期中…",
    stillPending: "アカウントの同期はまだ保留中です。同意はこのデバイスに保存されています。",
    pending: "同意はこのデバイスに保存されました。アカウントの同期は保留中です。",
    retrying: "再試行中…",
    retryAccessibilityLabel: "アカウントの同意の同期を再試行",
  },
  updates: {
    downloading: "アップデートをダウンロード中…",
    downloadingProgress: "アップデートをダウンロード中 {{percent}}%",
    ready: "アップデート準備完了",
    cancelReady: "閉じる",
    restart: "再起動",
    whatsNew: "このアップデートの内容",
    dialogMessage: "次回Scryveを開いたときに適用されます。ゲームはどちらの場合も保存されます。",
    restartNow: "今すぐ再起動",
    later: "後で",
    channelAfterRestart: "{{running}}(再起動後は{{next}})",
    restarting: "Scryveを再起動中",
  },
  preview: {
    heading: "PRプレビュー",
    loading: "{{channel}}を読み込み中…",
    busy: "別のプレビューを読み込み中です。このリンクをもう一度開いてください。",
    missing:
      "{{channel}}には、このビルドで実行できるアップデートがありません。新しいプレビュービルドが必要な可能性があります。",
  },
  launch: {
    starting: "Scryveを起動中…",
    startingAccessibilityLabel: "Scryveを起動中",
  },
  rootError: {
    title: "問題が発生しました",
    message:
      "Scryveで予期しないエラーが発生しました。もう一度お試しください。問題が続く場合はアプリを再起動してください。",
  },
} satisfies LocaleNamespace
