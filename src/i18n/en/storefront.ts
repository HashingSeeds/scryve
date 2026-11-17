// why: copy shown outside the app. The app never loads it; `pnpm i18n:paywall` fills RevenueCat's CSV and `pnpm store:play` and `pnpm store:apple` send the listings.
const storefront = {
  // The screen where a player buys Scryve Pro, the paid plan. Free is the plan without Pro.
  paywall: {
    title: "Scryve Pro",
    perks: {
      decks: "Sync up to {{proDecks}} decks (free syncs {{freeDecks}})",
      versions: "Keep {{proVersions}} versions of each deck (free keeps {{freeVersions}})",
      // Compare two versions of a deck's card list.
      compare: "Compare your lists side by side",
      // A small Pro badge next to the player's name on their seat in connected games.
      seatMark: "A Pro mark on your seat in shared games",
      // Extra icons for the app on the home screen.
      appIcons: "Pro app icons",
    },
    // A badge on the yearly plan. The variable becomes a percentage such as 17%. Keep {{ product.relative_discount }} exactly as written.
    save: "Save {{ product.relative_discount }}",
    // The yearly price shown per month. Abbreviate "per month" the way prices do in your language. Keep {{ product.price_per_month }} exactly as written.
    perMonth: "Only {{ product.price_per_month }}/mo",
    // Fine print under the plans. The variable becomes a price with its period, such as $9.99/yr. Keep {{ product.price_per_period_abbreviated }} exactly as written.
    billedAt: "Billed at {{ product.price_per_period_abbreviated }}.",
    // The button that starts the purchase.
    continue: "Continue",
    // The button that brings back a past purchase.
    restore: "Restore Purchases",
    // A short link to the Terms of Use, next to the Privacy link at the bottom.
    terms: "Terms",
    // A short link to the Privacy Policy, next to the Terms link at the bottom.
    privacy: "Privacy",
  },
  // The app's page on the App Store and Google Play. Write store copy that sells, the way top apps in your language do.
  listing: {
    // The app's name on the App Store. At most 30 characters.
    // ja: Use exactly: Scryve TCGライフカウンター＆戦績管理
    // fr: Use exactly: Scryve : compteur de vie JCC
    // ar: Use exactly: Scryve: عداد نقاط الحياة
    appStoreName: "Scryve: TCG Life Tracker",
    // The app's name on Google Play. At most 30 characters.
    // ja: Use exactly: Scryve TCGライフカウンター＆戦績管理
    // fr: Use exactly: Scryve : compteur de vie JCC
    // ar: Use exactly: Scryve: عداد نقاط الحياة
    playTitle: "Scryve: TCG Life Counter",
    // The line under the app's name on the App Store. At most 30 characters. The App Store already searches the words in the app's name, so use none of them here.
    // ja: Use exactly: ダメカン・デッキ管理・勝率分析
    // es: Use exactly: Mazos, estadísticas y torneos
    // ko: Use exactly: 카운터 · 덱 · 통계 · 대회
    // ar: Separate the items with · instead of و, so each word stands alone in search.
    subtitle: "Counter, decks, stats & events",
    // Google Play's one-line summary. At most 80 characters.
    // ja: Use: スマホ1台でライフとダメカンを管理。デッキごとの勝率や戦績も記録できます。
    shortDescription: "Life counter for TCGs and Commander, with deck stats and tournaments.",
    // Each game's full official name in your language, as its publisher prints it.
    gameName: {
      mtg: "Magic: The Gathering",
      ygo: "Yu-Gi-Oh!",
      pokemon: "Pokémon TCG",
      lorcana: "Disney Lorcana",
      fab: "Flesh and Blood",
      riftbound: "Riftbound",
    },
    // Paragraphs of the store description, in order.
    description: {
      // Commander (EDH) is a Magic format. Keep EDH in Latin letters.
      // ja: Life and damage counters: ライフやダメカン.
      players:
        "A life counter for up to {{maxPlayers}} players, with commander damage for Commander (EDH) and damage counters for Pokémon.",
      play: "Share one phone, connect phones on the same Wi-Fi to share life totals, or sign in to play from anywhere.",
      // {{games}} is a list of full game names, already translated.
      // ko: Use exactly: {{games}} 지원.
      games: "Works with {{games}}.",
      decks: "Save your decks and track win rates and match records.",
      // A store TV is a TV in a game store showing the event to everyone.
      events:
        "Run Swiss or pod events from your phone, even over store Wi-Fi without internet. Players report results from their phones, and a store TV can show pairings, the clock and standings.",
      noAccount:
        "No account needed for one-phone or Wi-Fi games, and one-phone games work offline.",
      // A heading on its own line.
      // ja: 【Scryve Pro】
      proHeading: "Scryve Pro",
      pro: "Sync up to {{proDecks}} decks instead of {{freeDecks}}, and keep up to {{proVersions}} versions of each deck. Compare win rates by version to see how your changes play out, and compare lists side by side. Pro also puts a Pro mark on your seat in shared games and unlocks Pro app icons.",
      // Apple's required subscription terms. Apple Account is Apple's name for the account; write it the way Apple does in your language.
      appleBilling_one:
        "Scryve Pro is an auto-renewing subscription. Payment is charged to your Apple Account at confirmation of purchase. The subscription renews automatically unless canceled at least {{count}} hour before the end of the current period. Manage or cancel in your Apple Account settings.",
      appleBilling_other:
        "Scryve Pro is an auto-renewing subscription. Payment is charged to your Apple Account at confirmation of purchase. The subscription renews automatically unless canceled at least {{count}} hours before the end of the current period. Manage or cancel in your Apple Account settings.",
      // Google Play's subscription terms.
      googleBilling:
        "Scryve Pro is an auto-renewing subscription charged to your Google Play account. It renews automatically until you cancel. Manage or cancel anytime in your Google Play subscriptions.",
      // Apple's standard license agreement.
      // ja: 利用許諾契約（EULA）: {{url}}
      eula: "Terms of Use (EULA): {{url}}",
      // ja: サービス利用規約: {{url}}
      terms: "Terms of Service: {{url}}",
      privacy: "Privacy Policy: {{url}}",
    },
    // The App Store's release notes for this version. Keep the section headings, the • bullets and the line breaks.
    whatsNew:
      "Decks\n• Share any deck with a link. Friends can play it right away in local, cloud, or nearby games, or save their own copy.\n• New Play and Build views: choose the version you bring, see recent results, and edit cards, sideboard, and partner commanders.\n• Sideboard between games of a match.\n• Stats for every deck, with list comparison in Pro.\n• Filter decks by color and find them by commander.\n• Keep unlimited decks on this device and choose which ones sync. Record matches offline.\n• Look up any card without opening a deck. Search handles misspellings.\n\nGames\n• Tap a player to deal commander damage. Partner commanders attack together.\n• Pick who goes first. Deck stats show your record going first and second.\n• Nearby games are open to everyone. Join with a code or QR.\n\nEvents\n• Run Swiss or pod events from your phone, even over store Wi-Fi without internet. Players report from their phones, and a store TV can show pairings, the clock, and standings.\n\nFeedback\n• Send feedback in the app and see replies, with optional notifications.\n\nPlus faster nearby play and many fixes.",
  },
}

export default storefront
