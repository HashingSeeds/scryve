// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  support: {
    search: "ヘルプを検索",
    yourFeedback: "あなたのフィードバック",
    newCount_other: "新着{{count}}件",
    email: "サポートにメール",
    emailDetail: "アカウントや支払いに関する質問",
    suggestFeature: "機能を提案",
    reportBug: "不具合を報告",
    noMatch: "「{{query}}」に該当する回答はありません。",
    ask: "「{{query}}」について問い合わせる",
  },
  offline: "オフラインです。接続が戻るまで下書きはここに保存されます。",
  suggest: {
    title: "フィードバックを送信",
    kind: "種類を選択",
    feature: "機能",
    bug: "バグ",
    prompt: {
      feature: "どんな機能がほしいですか?",
      bug: "何が起きましたか?",
    },
    bodyPlaceholder: {
      feature: "どんな場面で使いますか?",
      bug: "どうなると思いましたか?",
    },
    addScreenshot: "スクリーンショットを追加",
    removeScreenshot: "スクリーンショットを削除",
    selectedScreenshot: "選択したスクリーンショット",
    screenshotFailed: "スクリーンショットを追加できませんでした。別の画像をお試しください。",
    notice:
      "どの言語でも書けます。AIが読解を補助することがあります。<privacy>プライバシー</privacy>",
    includeAccount: "アカウントを含める",
    includeAccountHelper: "返信はデバイス間で同期され、ユーザー名が開発者に表示されます。",
    sendFailed: "送信できませんでした。もう一度お試しください。",
    rateLimited_other: "送信回数が多すぎます。{{count}}分後にもう一度お試しください。",
  },
  mine: {
    title: "あなたのフィードバック",
    empty: "このデバイスから送信したものはまだありません。",
    unread: "新着",
    deleteAll: "フィードバックを削除",
    deleteHint:
      "このデバイスから送信した内容と、アカウント付きで送信した内容を削除します。Sentryに送信済みの不具合の詳細は残ります。",
    deleteConfirmTitle: "フィードバックを削除しますか?",
    deleteConfirmBody:
      "このデバイスから送信した内容と、アカウント付きで送信した内容、その返信が削除されます。Sentryにすでに送信されたバグの詳細は残ります。",
    delete: "削除",
    deleteFailed:
      "フィードバックを削除できませんでした。オンラインのときにもう一度お試しください。",
  },
  thread: {
    missing: "このフィードバックは削除されました。",
    you: "あなた",
    team: "Scryve",
    replyPlaceholder: "詳細の追加や質問への回答をどうぞ",
    send: "送信",
    sending: "送信中…",
    sent: "送信済み",
    sendFailed: "送信できませんでした。もう一度お試しください。",
    linked: "アカウント付きで送信済み",
    linkedElsewhere: "別のアカウントで送信済み",
    notLinked: "アカウントなしで送信しました。",
    includeAccount: "含める",
    signInToSync: "サインインして同期",
  },
  notifyPrompt: {
    title: "返信を通知で受け取りますか?",
    body: "どちらを選んでも、返信は Scryve のここに表示されます。",
    notNow: "今はしない",
    notify: "通知する",
  },
  unavailable: "フィードバックにはScryveのクラウドが必要ですが、このビルドでは設定されていません。",
} satisfies LocaleNamespace
