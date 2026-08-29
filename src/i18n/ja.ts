import en, { type Translations } from "./en"

const ja: Translations = {
  game: en.game,
  common: {
    ok: "OK",
    cancel: "キャンセル",
    back: "戻る",
  },
  landingScreen: {
    eyebrow: "ライフカウンター",
    title: "すべての点を、すべてのプレイヤーを、ひとつの見やすい盤面に。",
    subtitle: "1台の端末ですぐに始め、オンラインプレイ対応後はテーブル全体をつなげられます。",
    quickLocalGame: "クイックローカルゲーム",
    quickLocalGameHint: "アカウントもネット接続も不要です。",
    quickLocalGameAccessibilityHint:
      "この端末でゲームを開始します。次の製品フェーズで利用できます。",
    joinConnectedGame: "接続ゲームに参加",
    joinConnectedGameAccessibilityHint: "複数端末で共有するゲームに参加します。近日公開予定です。",
    signIn: "サインイン",
    signInAccessibilityHint: "接続プレイのためにサインインします。近日公開予定です。",
    status: "製品基盤の準備が整いました。ゲーム設定と接続プレイは次に実装されます。",
    comingSoonTitle: "近日公開",
    comingSoonMessage: "この入口はScryveの次の実装フェーズに向けて準備済みです。",
    dismissComingSoon: "了解",
  },
  errorScreen: {
    title: "問題が発生しました",
    friendlySubtitle:
      "Scryveで予期しないエラーが発生しました。アプリをリセットして正常な状態に戻してください。問題が続く場合は開発クライアントを再起動してください。",
    reset: "アプリをリセット",
  },
  emptyStateComponent: {
    generic: {
      heading: "まだ何もありません",
      content: "データが見つかりません。更新または再読み込みしてください。",
      button: "もう一度試す",
    },
  },
}

export default ja
