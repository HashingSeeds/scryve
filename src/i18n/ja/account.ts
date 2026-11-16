// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  openPlay: "プレイへ移動",
  signIn: "サインイン",
  localGamesStay: "ローカルゲームはこのデバイスに残ります。",
  legal: {
    heading: "法的情報",
    privacyPolicy: "プライバシーポリシー",
    termsOfUse: "利用規約",
    licenseAgreement: "使用許諾契約",
    licenseAgreementHint: "Appleの標準使用許諾契約をブラウザで開きます",
    cookiePolicy: "クッキーポリシー",
    gameContent: "第三者のゲームコンテンツ",
    licenseOpenFailed: "使用許諾契約を開けませんでした",
  },
  accountData: {
    label: "アカウントとデータ",
    accessibilityLabel: "アカウントとデータ",
    accessibilityHint: "アカウントの削除とデータの詳細を開きます",
  },
  shareUsage: "Scryveと利用状況を共有",
  settings: {
    title: "設定",
    localDefaults: "ローカルゲームの初期設定",
    general: "一般",
    appearance: "外観",
    about: "情報",
    version: "バージョン",
    players: "プレイヤー数",
    openScryveTo: "Scryve起動時の表示",
    launchDestination: {
      play: "プレイ",
      decks: "デッキ",
    },
    game: "ゲーム",
    chooseGame: "新しいゲームの初期設定",
    closeGameChoices: "ゲームの選択を閉じる",
    haptics: {
      label: "触覚フィードバック",
    },
    theme: {
      heading: "テーマ",
      system: "システム",
      light: "ライト",
      dark: "ダーク",
    },
    appIcon: {
      heading: "アプリアイコン",
      changeFailed: "アプリアイコンを変更できませんでした。もう一度お試しください。",
      lockedPro: "{{name}}、Scryve Pro",
      foilHeading: "Scryve Foil",
      opensPro: "Scryve Proを開きます",
      proFailed: "Scryve Proを確認できなかったため、Proアイコンはロックされています。",
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
        Contour: "コンターン",
        Stripes: "ストライプ",
        Neon: "ネオン",
        Blueprint: "ブループリント",
        Gilded: "ギルデッド",
        Prism: "プリズム",
        Holo: "ホロ",
      },
    },
    notifications: {
      heading: "通知",
      feedbackReplies: "フィードバックへの返信",
      feedbackRepliesHelper: "返信は常に「送信したフィードバック」に表示されます",
      renewalReminders: "更新のリマインダー",
      renewalRemindersHelper_other: "サブスクリプションの更新の{{count}}日前",
      channel: "返信とリマインダー",
      feedbackReplyPreview: "フィードバックに新しい返信があります",
      blockedTitle: "通知がオフです",
      blockedBody: "設定でScryveの通知をオンにしてください。",
      openSettings: "設定を開く",
    },
    privacy: {
      heading: "プライバシー",
      shareUsageHelper:
        "初期設定はオフです。アカウントに紐づかないランダムなIDで利用状況を共有します。詳細はプライバシーポリシーをご覧ください。",
      saveFailed: "選択を保存できませんでした。もう一度お試しください。",
      unavailable: "このビルドでは利用状況の共有は使えません。PostHogのイベントは送信されません。",
    },
    appInfo: {
      heading: "アプリ情報",
      analyticsId: "分析ID：{{id}}",
      analyticsIdHint:
        "このIDは利用状況データの特定に使われます。データの削除を依頼する場合は、このIDをprivacy@sowinghope.howにメールでお送りください。",
      version: "バージョン：{{value}}",
      build: "ビルド：{{value}}",
      runtime: "ランタイム：{{value}}",
      update: "アップデート：{{value}}",
      channel: "チャンネル：{{value}}",
      platform: "プラットフォーム：{{value}}",
      notApplicable: "該当なし",
      unavailable: "利用不可",
      bundled: "組み込み",
      development: "開発",
    },
    beta: {
      label: "ベータ版アップデート",
      helper: "未公開のアップデートをいち早く受け取れます。動作が不安定な場合があります。",
    },
    backToPreview: "プレビューに戻る",
    backToPreviewFailed: "プレビューに戻れませんでした。もう一度お試しください。",
    copyDebugInfo: "デバッグ情報をコピー",
    copied: "コピーしました",
    copyFailed: "コピーできませんでした。もう一度お試しください。",
    turns: {
      label: "ターン",
      helper: "誰のターンかを表示します。ターン表示をタップするとパスします。",
    },
    syncStats: {
      label: "マニア向け統計",
      helper:
        "オンライン対戦や近くのデバイスとの対戦で、変更が各デバイスに届くまでの時間と、カードスキャナーがカードを見つける仕組みを表示します。",
    },
  },
  support: {
    pageTitle: "Scryveのサポート",
    pageDescription:
      "よくある質問の回答を探したり、機能の提案、不具合の報告、サポートへの問い合わせができます。",
    title: "サポート",
    faq: {
      heading: "よくある質問",
      restorePro: {
        question: "Scryve Proを復元",
        answer:
          "Scryveを開き、アカウントからScryve Proを選び、「購入を復元」をタップします。最初の購入に使ったAppleまたはGoogleのアカウントを使用してください。",
      },
      manageSubscription: {
        question: "サブスクリプションの管理と解約",
        answer:
          "サブスクリプションは、購入したストアで管理します。iPhoneまたはiPadでは、設定を開き、自分の名前、サブスクリプションの順にタップします。Androidでは、Google Playを開き、プロフィール、お支払いと定期購入の順にタップします。",
      },
      gameTrouble: {
        question: "ゲームで問題が起きましたか？",
        answer:
          "Scryveを再起動して、もう一度お試しください。問題が続く場合は、起きたことを簡単に書いて、ここから報告してください。",
      },
      accountPrivacy: {
        question: "アカウントとプライバシーについて",
        answer:
          "アカウントはScryveのアカウント画面から管理できます。アカウントにアクセスできない場合や削除したい場合は、サポートにメールしてください。",
      },
    },
  },
  profile: {
    title: "アカウント",
    signedIn: "サインイン済み",
    yourAccount: "自分のアカウント",
    profileAndSecurity: "プロフィールとセキュリティ",
    profileHint: "プロフィール管理を開き、名前、メールアドレス、パスワードを変更します",
    profileDetails: "名前、メールアドレス、パスワード、サインイン方法。",
    independence:
      "Scryveは独立したサービスであり、ゲームコンテンツに関する注意書きに記載されたゲームの発売元、権利者、データ提供元とは提携しておらず、承認も受けていません。",
    signingOut: "サインアウトしています…",
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
      inProgress: "削除を処理しています",
      before: "アカウントを削除する前に",
      completed: "アカウントを削除しました",
    },
    checkingStatus: "削除の状況を確認しています…",
    intro:
      "Scryveのアカウントを完全に削除し、通信対戦の履歴を匿名化します。まず内容を確認してください。",
    steps: {
      cloud: {
        title: "クラウドのアカウントが削除されます",
        body: "プロフィール、アバター、サインイン、招待、アカウントに紐づく通信対戦のデータが削除されます。",
      },
      history: {
        title: "共有された対戦履歴は匿名化されます",
        body: "ほかのプレイヤーにはマッチの結果が残りますが、自分の席は標準アバターの「削除されたプレイヤー」になり、アカウントとのつながりは解除されます。",
      },
      local: {
        title: "ローカルゲームはこのデバイスに残ります",
        body: "オフラインのゲーム履歴はこのデバイスにのみ保存されています。アカウントには紐づいておらず、遠隔で消去されることもありません。",
      },
      feedback: {
        title: "アカウントなしで送信したフィードバックは残ります",
        body: "アカウントを含めて送信したフィードバックは削除されます。アカウントなしで送信したものは、送信したデバイスに残ります。削除するには、サポート、送信したフィードバックの順に開き、「フィードバックを削除」をタップしてください。",
      },
      signOut: {
        title: "すべてのデバイスがサインアウトされます",
        body: "このデバイスと、サインイン中のほかのデバイスは自動的にサインアウトされます。",
      },
    },
    subscription: {
      heading: "Scryve Proのサブスクリプションをお持ちですか？",
      body: "アカウントを削除しても、サブスクリプションは解約されません。登録したストアで解約するまで、請求が続く場合があります。このまま削除することもできますが、残っている有料期間は利用できなくなります。",
      manageApple: "Appleのサブスクリプションを管理",
      manageGoogle: "Google Playのサブスクリプションを管理",
      web: "Webでサブスクリプションを購入した場合は、カスタマーポータルで解約してください。Scryve Proの請求メールにはすべてポータルへのリンクがあります。",
      manageWeb: "Webのサブスクリプションを管理",
    },
    signedInAs: "{{email}}でサインイン中",
    confirmLabel: "続けるには{{word}}と入力してください",
    submit: {
      submitting: "リクエストを送信しています…",
      retry: "アカウントの削除を再試行",
      delete: "アカウントを完全に削除",
    },
    footnote: {
      retry:
        "再試行すると、最後に完了していない手順から続行されます。匿名化されたデータは復元されません。",
      first: "削除はすぐに始まり、処理が始まると元に戻せません。",
    },
    status: {
      failed:
        "Scryveは自動的に完了できませんでした。このページに戻って、もう一度リクエストを送信して再試行してください。",
      identityPending:
        "通信対戦のデータは匿名化されました。現在、Scryveがサインイン情報を削除しています。",
      processing:
        "Scryveが通信対戦の履歴を匿名化し、アカウントに紐づくデータを削除しています。このページは閉じても問題ありません。",
    },
    panel: {
      failed: {
        title: "削除に対応が必要です",
        body: "アカウントのデータは復元されません。残りの処理を再試行するには、{{word}}と入力してもう一度送信してください。",
      },
      completed: {
        title: "削除が完了しました",
        body: "この受領書にアカウントの情報は含まれていません。",
      },
      received: {
        title: "削除リクエストを受け付けました",
        body: "リクエストの処理中は、通信対戦での新しい操作がブロックされます。",
      },
    },
    receipt: {
      completedBody: "Scryveはサインイン用のアカウントを削除し、通信対戦の履歴を匿名化しました。",
      failedBody: "Scryveは残りの削除処理を自動的に完了できませんでした。",
      lastUpdated: "最終更新：{{day}} {{time}}",
      next: {
        completed: "これ以上の対応は必要ありません。",
        failed: "もう一度サインインし、このページに戻ってリクエストを再試行してください。",
        pending: "Scryveは閉じても問題ありません。戻ると、このページで引き続き確認します。",
      },
      signInToRetry: "サインインして再試行",
      returnHome: "ホームに戻る",
    },
    route: {
      statusCheckFailed:
        "Scryveは削除の状況を確認できませんでした。確認に成功するまで、アカウントの削除は利用できません。",
      signInPrompt: "Scryveのアカウントの削除をリクエストするには、サインインしてください。",
      checkingReceipt: "削除の受領書を確認しています…",
      checkingAccount: "アカウントを確認しています…",
      reconnect: "アカウントを削除する前に、Scryveに再接続してください。",
      submitFailed: "削除リクエストを送信できませんでした",
    },
  },
  cloud: {
    signInToContinue: "続けるにはサインインしてください。",
    chooseUsername: "プレイヤーのユーザー名を選んでください。",
    reconnect: "続けるには再接続してください。",
    chooseUsernameAction: "ユーザー名を選ぶ",
    unavailableHeading: "通信機能は利用できません",
    localPlayAvailable: "ローカルゲームは引き続き利用できます。",
    notConfigured: "このビルドでは通信機能は利用できません。ローカルゲームは引き続き利用できます。",
  },
  billing: {
    proNeedsAccount:
      "Scryve Proはアカウントに紐づいています。Proを購入する、または購入済みのProを使うにはサインインしてください。",
    renewalPrompt: {
      title: "更新前にお知らせしますか？",
      body_other: "次の年額課金の{{count}}日前に通知を受け取れます。",
      notNow: "今はしない",
      remind: "通知する",
    },
    access: {
      checking: "利用状況を確認しています…",
      renews: "{{date}}に更新",
      availableUntil: "{{date}}まで利用可能",
      active: "{{plan}}を利用中",
      unavailable: "状況を取得できません",
      free: "無料プラン",
    },
    loading: "Scryve Proを読み込んでいます",
    manage: "管理",
    manageAccessibilityLabel: "Scryve {{plan}}のサブスクリプションを管理",
    viewOptions: "プランを見る",
    viewOptionsAccessibilityLabel: "Scryve Proのプランを見る",
    paywallFailedTitle: "Scryve Proを開けませんでした",
    notConfigured: "Scryve Proの購入は設定されていません。",
    missingApiKey: "RevenueCatの公開APIキーが設定されていないため、Scryve Proは購入できません。",
    errors: {
      revenueCatNotConfigured: "RevenueCatが設定されていません。",
      unexpected: "購入中に予期しないエラーが発生しました。",
      offline: "インターネットに接続して、もう一度お試しください。",
      notAllowed: "このデバイスまたはストアアカウントでは購入できません。",
      productUnavailable: "このScryve Proのオプションは、現在のストアでは利用できません。",
      pending: "ストアで購入を処理中です。完了すると利用権限が更新されます。",
      misconfigured: "このビルドではScryve Proが正しく設定されていません。",
      failed: "購入を完了できませんでした。",
      waitForBilling: "課金がアカウントに接続されるまでお待ちのうえ、もう一度お試しください。",
      foilWebOnly: "FoilはWebでのみ購入できます。",
      manageBeforeFoil: "Foilに切り替える前に、現在のサブスクリプションを管理してください。",
      productNotInStore: "{{productId}}は現在のストアでは利用できません。",
      paywallFailed: "Scryve Proのペイウォールでリクエストを完了できませんでした。",
      noManagementPage: "このカスタマーのサブスクリプション管理ページはまだ利用できません。",
    },
  },
  foil: {
    pageTitle: "Scryve Foilサポーター",
    title: "Foilサポーター",
    price: "年額US${{amount}}",
    description:
      "Proと同じ機能です。Scryveを応援できる任意のプランです。解約するまで毎年自動更新されます。",
    signInPrompt: "FoilをScryveのアカウントに連携するには、サインインしてください。",
    alreadyPro:
      "すでにProをご利用中です。プランを切り替える前に、現在のサブスクリプションを管理してください。",
    manageSubscription: "サブスクリプションを管理",
    openingCheckout: "チェックアウトを開いています…",
    choose: "Foilサポーターを選ぶ",
    purchasesUnavailable: "このビルドでは購入できません。",
  },
  legalDocument: {
    lastUpdated: "最終更新日：{{date}}",
  },
  updates: {
    downloading: "アップデートをダウンロード中…",
    downloadingProgress: "アップデートをダウンロード中 {{progress, percent}}",
    ready: "アップデートの準備ができました",
    cancelReady: "閉じる",
    restart: "再起動",
    whatsNew: "このアップデートの内容",
    dialogMessage: "次回Scryveを開いたときに適用されます。ゲームはどちらの場合も保存されます。",
    restartNow: "今すぐ再起動",
    later: "後で",
    channelAfterRestart: "{{running}}（再起動後は{{next}}）",
    restarting: "Scryveを再起動しています",
  },
  preview: {
    heading: "PRプレビュー",
    loading: "{{channel}}を読み込み中…",
    busy: "別のプレビューを読み込み中です。このリンクをもう一度開いてください。",
    missing:
      "{{channel}}には、このビルドで実行できるアップデートがありません。新しいプレビュービルドが必要な場合があります。",
  },
  launch: {
    starting: "Scryveを起動しています…",
    startingAccessibilityLabel: "Scryveを起動しています",
  },
  rootError: {
    title: "問題が発生しました",
    message:
      "Scryveで予期しないエラーが発生しました。もう一度お試しください。問題が続く場合は、アプリを再起動してください。",
  },
} satisfies LocaleNamespace
