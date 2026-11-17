// why: copy shown outside the app, in RevenueCat's paywall and the store listings. The app never loads it; `pnpm i18n:paywall` fills RevenueCat's CSV from it.
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
}

export default storefront
