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
      "デッキ\n• リンクでデッキを共有できます。友だちはローカル、クラウド、近くのデバイスとの対戦ですぐに使えるほか、自分用にコピーを保存できます。\n• 新しい「プレイ」ビューと「構築」ビューで、持っていくバージョンを選んだり、最近の結果を確認したり、カード、サイドボード、パートナーの統率者を編集したりできます。\n• マッチのゲーム間でサイドボーディングできます。\n• すべてのデッキの戦績を確認できます。Proではリストの比較もできます。\n• 色でデッキを絞り込み、統率者から探せます。\n• このデバイスにはデッキを無制限に保存でき、同期するデッキも選べます。マッチはオフラインでも記録できます。\n• デッキを開かなくても、好きなカードを検索できます。スペルミスにも対応しています。\n\nゲーム\n• プレイヤーをタップして統率者ダメージを記録できます。パートナーの統率者は一緒に攻撃します。\n• 先攻を選べます。デッキの戦績には、先攻と後攻それぞれの成績が表示されます。\n• 近くのデバイスとの対戦は誰でも参加できます。コードまたはQRで参加してください。\n\nイベント\n• スマホからスイスドローや多人数卓のイベントを開催できます。インターネットのない店舗のWi-Fiでも使えます。プレイヤーは自分のスマホから報告でき、店舗のテレビに対戦表、タイマー、順位表を表示できます。\n\nフィードバック\n• アプリからフィードバックを送信して返信を確認できます。通知はオプションです。\n\nそのほか、近くのデバイスとの対戦が高速になり、多くの不具合を修正しました。",
  },
} satisfies LocaleNamespace
