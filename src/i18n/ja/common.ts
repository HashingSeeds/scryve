// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  back: "戻る",
  cancel: "キャンセル",
  close: "閉じる",
  delete: "削除",
  done: "完了",
  edit: "編集",
  remove: "外す",
  retry: "再試行",
  save: "保存",
  tryAgain: "もう一度試す",
  undo: "元に戻す",
  emptyState: {
    heading: "まだ何もありません",
    content: "データが見つかりません。更新するか、アプリを再読み込みしてください。",
  },
  appMenu: {
    more: "その他",
    moreUpdateReady: "その他、アップデートあり",
    settings: "設定",
    settingsUpdateReady: "設定、アップデートあり",
    account: "アカウント",
    signIn: "ログイン",
    closeMenu: "ユーティリティメニューを閉じる",
  },
  appNavigation: {
    decks: "デッキ",
    returnToGame: "ゲームに戻る",
    play: "プレイ",
    backToLobby: "ロビーに戻る",
  },
  confirmDialog: {
    cancelAction: "{{action}}をキャンセル",
  },
  retryableError: {
    retryingIn: "{{seconds}}秒後に再試行",
  },
  selectField: {
    none: "なし",
    triggerLabel: "{{label}}、{{value}}",
    openHint: "{{label}}の選択肢を開く",
    closeLabel: "{{label}}の選択肢を閉じる",
  },
  valueField: {
    readoutLabel: "{{label}}、{{value}}",
    decrease: "{{label}}を{{step}}減らす",
    increase: "{{label}}を{{step}}増やす",
    longPressHint: "長押しで{{step}}ずつ変更できます。",
  },
} satisfies LocaleNamespace
