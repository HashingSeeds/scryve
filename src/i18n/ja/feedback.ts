// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  support: {
    search: "ヘルプを検索",
    yourFeedback: "送信したフィードバック",
    newCount_other: "新着{{count}}件",
    email: "メールでサポートに問い合わせる",
    emailDetail: "アカウントや請求に関するご質問",
    suggestFeature: "機能を提案",
    reportBug: "不具合を報告",
    noMatch: "「{{query}}」に該当する回答はありません。",
    ask: "「{{query}}」について問い合わせる",
  },
  offline: "オフラインです。下書きはオンラインに戻るまでここに残ります。",
  suggest: {
    title: "フィードバックを送信",
    kind: "種類を選んでください",
    feature: "機能",
    bug: "不具合",
    prompt: {
      feature: "どんな機能がほしいですか？",
      bug: "何が起きましたか？",
    },
    bodyPlaceholder: {
      feature: "どんな場面で使いますか？",
      bug: "どうなる想定でしたか？",
    },
    addScreenshot: "スクリーンショットを追加",
    removeScreenshot: "スクリーンショットを削除",
    selectedScreenshot: "選択したスクリーンショット",
    screenshotFailed: "スクリーンショットを追加できませんでした。別の画像をお試しください。",
    notice:
      "どの言語でも送れます。内容の読み取りにAIを使うことがあります。<privacy>プライバシー</privacy>",
    includeAccount: "アカウントを含める",
    includeAccountHelper: "返信がデバイス間で同期され、ユーザー名がチームに伝わります。",
    sendFailed: "送信できませんでした。もう一度お試しください。",
    rateLimited_other: "送信回数が多すぎます。{{count}}分後にもう一度お試しください。",
  },
  mine: {
    title: "送信したフィードバック",
    empty: "このデバイスから送信したフィードバックはまだありません。",
    unread: "新着",
    deleteAll: "フィードバックを削除",
    deleteHint:
      "このデバイスから送信した内容と、アカウントで送信した内容を削除します。Sentryにすでに送信された不具合の詳細は残ります。",
    deleteConfirmTitle: "フィードバックを削除しますか？",
    deleteConfirmBody:
      "このデバイスから送信した内容とアカウントで送信した内容が、返信も含めてすべて削除されます。Sentryにすでに送信された不具合の詳細は残ります。",
    delete: "削除",
    deleteFailed:
      "フィードバックを削除できませんでした。オンラインのときにもう一度お試しください。",
  },
  thread: {
    missing: "このフィードバックは削除されました。",
    you: "自分",
    team: "Scryve",
    replyPlaceholder: "詳細の追加や質問への回答",
    send: "送信",
    sending: "送信中…",
    sent: "送信済み",
    sendFailed: "送信できませんでした。もう一度お試しください。",
    linked: "アカウントを含めて送信済み",
    linkedElsewhere: "別のアカウントで送信済み",
    notLinked: "アカウントなしで送信されました。",
    includeAccount: "含める",
    signInToSync: "サインインして同期",
  },
  notifyPrompt: {
    title: "返信を通知で受け取りますか？",
    body: "通知の有無にかかわらず、返信はScryveのここに表示されます。",
    notNow: "今はしない",
    notify: "通知する",
  },
  unavailable: "フィードバックにはScryveのクラウドが必要ですが、このビルドでは設定されていません。",
} satisfies LocaleNamespace
