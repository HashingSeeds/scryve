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
  // Captions on the App Store screenshots, one pair per screenshot: a headline in large type and a subhead under it. Write them the way top apps in your language caption their screenshots. Keep each headline as short as the English, at most about 18 Latin letters wide, and each subhead to one short line, so each fits on one line.
  screenshots: {
    // A game started on one phone can be shared with friends' phones by a code.
    connected: {
      headline: "Local or connected",
      subhead: "Starts on your phone. Connect with a code.",
    },
    // One phone in the middle of the table, each player's life total turned to face them.
    tenPlayers: {
      headline: "Up to {{maxPlayers}} players",
      subhead: "Every seat faces its player.",
    },
    commanderDamage: {
      headline: "Commander damage",
      subhead: "Track each opponent on their own card.",
    },
    // Two-Headed Giant is a Magic format where two teams of two each share one life total.
    twoHeadedGiant: { headline: "Two-Headed Giant", subhead: "Teammates share one life total." },
    // A chess clock gives each player their own time, which runs only during their turn.
    chessClock: {
      headline: "Turns and clocks",
      subhead: "One tap passes the turn and the clock.",
    },
    // A match is several games against the same opponent; the first to win two of three takes it.
    bestOf: { headline: "Best of three", subhead: "Game wins add up, with a round clock." },
    // Pokémon: HP is a Pokémon's hit points. The Active is the Pokémon in play, in front of the bench.
    pokemon: { headline: "HP, card by card", subhead: "Pick your Active. HP stays up front." },
    rules: { headline: "Rules at the table", subhead: "Search the official rules mid-game." },
    // A deck's win rate: the share of games played with that deck that the player won.
    decks: {
      headline: "Win rates per deck",
      subhead: "Every game you play counts toward its deck.",
    },
    history: { headline: "Every game saved", subhead: "Local and connected games, one history." },
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
    // The App Store's release notes for this version. Keep the • bullets and the line breaks. "Your language" means whichever language the player's phone uses, so don't name a language.
    whatsNew:
      "• Buy Pro on your phone without signing in first.\n• Pro stays unlocked when your connection drops.\n• The board's corners follow your phone's rounded screen.\n• Permission prompts appear in your language.\n• Faster rules search.\n\nPlus many fixes.",
  },
}

export default storefront
