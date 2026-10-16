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
} satisfies LocaleNamespace
