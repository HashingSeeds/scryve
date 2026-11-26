// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  paywall: {
    title: "Scryve Pro",
    perks: {
      decks: "最大{{proDecks}}個のデッキを同期（無料は{{freeDecks}}個）",
      versions: "デッキごとに{{proVersions}}バージョンを保存（無料は{{freeVersions}}バージョン）",
      compare: "リストを並べて比較",
      seatMark: "共有ゲームで自分の席にProマークを表示",
      appIcons: "Pro限定のアプリアイコン",
    },
    save: "{{ product.relative_discount }}お得",
    perMonth: "月々{{ product.price_per_month }}のみ",
    billedAt: "{{ product.price_per_period_abbreviated }}で請求されます。",
    continue: "続ける",
    restore: "購入を復元",
    terms: "利用規約",
    privacy: "プライバシー",
  },
  listing: {
    appStoreName: "Scryve TCGライフカウンター＆戦績管理",
    playTitle: "Scryve TCGライフカウンター＆戦績管理",
    subtitle: "ダメカン・デッキ管理・勝率分析",
    shortDescription: "スマホ1台でライフとダメカンを管理。デッキごとの勝率や戦績も記録できます。",
    gameName: {
      mtg: "マジック：ザ・ギャザリング",
      ygo: "遊戯王OCG",
      pokemon: "ポケモンカードゲーム",
      lorcana: "ディズニー・ロルカナ",
      fab: "フレッシュ＆ブラッド",
      riftbound: "リフトバウンド",
    },
    description: {
      players:
        "最大{{maxPlayers}}人までのライフカウンター。コマンダー（EDH）の統率者ダメージや、ポケモンカードゲームのダメカンにも対応しています。",
      play: "スマホ1台を共有したり、同じWi-Fiのスマホをつないでライフを共有したり、サインインしてどこからでも対戦したりできます。",
      games: "{{games}}に対応しています。",
      decks: "デッキを保存して、勝率やマッチの戦績を記録できます。",
      events:
        "スマホからスイスドローや多人数卓のイベントを開催できます。インターネットのない店舗のWi-Fiでも使えます。プレイヤーは自分のスマホで結果を報告でき、店舗のテレビに対戦表、タイマー、順位表を表示できます。",
      noAccount:
        "1台のスマホでの対戦やWi-Fi対戦にアカウントは不要で、1台のスマホでの対戦はオフラインでも使えます。",
      proHeading: "【Scryve Pro】",
      pro: "同期できるデッキが{{freeDecks}}個から{{proDecks}}個に増え、デッキごとに最大{{proVersions}}個のバージョンを保存できます。バージョンごとの勝率を比べて変更の効果を確認したり、リストを並べて比較したりできます。さらに、共有ゲームの席にProマークが付き、Pro限定のアプリアイコンも使えます。",
      appleBilling_other:
        "Scryve Proは自動更新のサブスクリプションです。購入の確認時に、お支払いがApple アカウントに請求されます。現在の期間が終了する{{count}}時間前までに解約しない限り、サブスクリプションは自動的に更新されます。管理や解約は、Apple アカウントの設定から行えます。",
      googleBilling:
        "Scryve Proは、Google Playアカウントに請求される自動更新のサブスクリプションです。解約するまで自動的に更新されます。管理や解約は、Google Playの「お支払いと定期購入」からいつでも行えます。",
      eula: "利用許諾契約（EULA）：{{url}}",
      terms: "サービス利用規約：{{url}}",
      privacy: "プライバシーポリシー：{{url}}",
    },
    whatsNew:
      "• サインインせずにスマホからProを購入できます。\n• 接続が切れてもProのロックは解除されたままです。\n• ボードの角がスマホの丸い画面に沿うようになりました。\n• 権限の確認画面がお使いの言語で表示されます。\n• ルール検索が高速化しました。\n\nそのほか多数の修正を行いました。",
  },
} satisfies LocaleNamespace
