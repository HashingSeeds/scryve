// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  relativeTime: {
    justNow: "たった今",
    minutes: "{{minutes}}分前",
    hours: "{{hours}}時間前",
    days: "{{days}}日前",
  },
  resumeTitle: {
    hostingLobby: "ホスト中 · 開始待ち",
    hostingActive: "ホスト中 · 進行中",
    playingLobby: "参加中 · 開始待ち",
    playingActive: "参加中 · 進行中",
  },
  seatCount_other: "{{count}}席",
  allSeatsClaimed: "全席が確保済み",
  waitingForPlayers_other: "あと{{count}}人待っています",
  decksRequired: "デッキ必須",
  decksOptional: "デッキは任意",
  yourSeat: "あなたの席",
  seatNumber: "席{{seat}}",
  noDeckSelected: "デッキ未選択",
  lobbyExit: {
    abandon: {
      title: "このロビーを破棄しますか?",
      message: "全員のロビーが閉じられ、最終サマリーが保存されます。この操作は元に戻せません。",
      confirmText: "ロビーを破棄",
    },
    leave: {
      title: "このロビーから退出しますか?",
      message: "ロビーは再開リストから消えます。他のプレイヤーとその履歴は変わりません。",
      confirmText: "ロビーから退出",
    },
  },
  onlineOnly: {
    start:
      "ゲームを開始するには再接続してください。開始はオンライン専用で、キューには保存されません。",
    exit: "このロビーから退出または破棄するには再接続してください。これらの操作はオンライン専用で、キューには保存されません。",
    join: "席を確保するには再接続してください。席の確保はオンライン専用で、キューには保存されません。",
    deck: "デッキを変更するには再接続してください。デッキの選択はオンライン専用で、キューには保存されません。",
  },
} satisfies LocaleNamespace
