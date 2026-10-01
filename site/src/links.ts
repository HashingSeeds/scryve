export const STORE_LINKS = {
  appStore: "https://apps.apple.com/us/app/scryve/id6798955244",
  googlePlay: "https://play.google.com/store/apps/details?id=com.sowinghope.count",
} as const

export const APP_STORE_ID = "6798955244"

// The Expo web app is served under /play/. Linking to it directly skips the legacy-path redirects.
export const APP_LINKS = {
  play: "/play/",
  account: "/play/account",
  support: "/play/support",
  privacy: "/play/privacy",
  terms: "/play/terms",
  cookies: "/play/cookie-policy",
  deleteAccount: "/play/delete-account",
  gameContentNotices: "/play/game-content-notices",
} as const
