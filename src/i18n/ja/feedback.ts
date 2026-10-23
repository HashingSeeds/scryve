// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  support: {
    search: "ヘルプを検索",
    yourFeedback: "あなたのフィードバック",
    newCount_other: "新着{{count}}件",
    email: "サポートにメール",
    emailDetail: "アカウントや支払いに関する質問",
    suggest: "機能の提案・バグの報告",
    noMatch: "「{{query}}」に該当する回答はありません。",
    ask: "「{{query}}」について問い合わせる",
  },
  offline: "オフラインです。接続が戻るまで、下書きはここに残ります。",
  suggest: {
    title: "フィードバックを送信",
    kind: "種類を選択",
    feature: "機能",
    bug: "バグ",
    bodyLabel: "メッセージ",
    bodyPlaceholder: {
      feature: "どんな機能がほしいですか?どんなときに使いますか?",
      bug: "何が起きましたか?どうなると思っていましたか?",
    },
    addScreenshot: "スクリーンショットを追加",
    removeScreenshot: "スクリーンショットを削除",
    selectedScreenshot: "選択したスクリーンショット",
    screenshotFailed: "スクリーンショットを追加できませんでした。別の画像をお試しください。",
    bugDisclosure: "バグ報告では、デバイスの情報とスクリーンショットもSentryに送信されます。",
    translationNotice:
      "どの言語でも書けます。翻訳にAIツールを使うことがあります。<privacy>プライバシーポリシー</privacy>をご覧ください。",
    includeAccount: "アカウントを含める",
    includeAccountHelper:
      "返信はサインインしているすべてのデバイスに届き、ユーザー名が運営に表示されます。",
    anonymous:
      "アカウントなしで送信されます。返信はこのデバイスに表示され、再インストールすると失われることがあります。",
    signInToKeep: "サインインして保持",
    send: "送信",
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
    replyLabel: "返信",
    replyPlaceholder: "詳細の追加や質問への回答をどうぞ",
    send: "送信",
    sendFailed: "送信できませんでした。もう一度お試しください。",
    includeAccount: "アカウントを含める",
    includeAccountHelper:
      "ユーザー名が運営に表示され、このスレッドがすべてのデバイスで保持されます。",
    linked: "アカウント付きで送信済み",
    linkedElsewhere: "別のアカウントで送信済み",
    signInToKeep: "再インストールしてもこのスレッドを残すにはサインインしてください",
  },
  unavailable: "フィードバックにはScryveのクラウドが必要ですが、このビルドでは設定されていません。",
} satisfies LocaleNamespace
