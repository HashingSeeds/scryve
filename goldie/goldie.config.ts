/**
 * App Store asset definition for Scryve.
 *
 * Every visible choice lives here: which screens, in what order, the marketing
 * copy, the background and bezel, and the preview story. Edit this file (and the
 * flows it names in .argent/flows) rather than the studio, so changes survive.
 *
 * Copy voice is taken from the app itself (src/i18n/en.ts): plain, concrete,
 * no exclamation, no marketing inflation.
 */

import { fileURLToPath } from "node:url"

const APP_ROOT = fileURLToPath(new URL("..", import.meta.url))

const config = {
  appRoot: APP_ROOT,
  // Release simulator build: prebuild with APP_VARIANT=preview, load
  // .env.development, set EXPO_PUBLIC_CONVEX_URL to
  // https://store-assets-test.convex.cloud, and build
  // ScryvePreview with SENTRY_DISABLE_AUTO_UPLOAD=true.
  appPath: "/tmp/scryve-store-assets-dd/Build/Products/Release-iphonesimulator/ScryvePreview.app",
  bundleId: "com.sowinghope.count.preview",

  devices: ["iphone-6.9"],
  locales: ["en-US"],
  appearance: "dark",

  frame: { variant: "17-pro-silver" },

  theme: {
    background: "#0B0B0D",
    headlineColor: "#FFFFFF",
    subheadColor: "#A8A8B3",
    fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
    template: "editorial",
    layout: "classic",
  },

  store: {
    name: "Scryve",
    subtitle: { "en-US": "Local & connected life counter" },
    developer: "Sowing Hope",
    category: "Utilities",
    rating: 5,
    ratingCount: "New",
    ageRating: "4+",
    price: "Free",
    description: {
      "en-US":
        "Scryve keeps life totals for the whole table. Start a local game in seconds on one device, with no account or network.\n\nFor connected play, host a game or join one on your own device. Life totals stay in sync across the table.\n\nUp to six players share a single clear board. Every seat has its own controls, so anyone can count their own life without passing the phone around.",
    },
  },

  scenes: [
    {
      kind: "screenshot",
      id: "six-player",
      flow: "store-03-six-player",
      headline: { "en-US": "Every point. Every player." },
      subhead: { "en-US": "Up to six players on one clear board." },
    },
    {
      kind: "screenshot",
      id: "two-player",
      flow: "store-01-two-player",
      headline: { "en-US": "Life totals, without the fuss" },
      subhead: { "en-US": "Start a local game in seconds." },
    },
    {
      kind: "screenshot",
      id: "five-player",
      flow: "store-02-five-player",
      headline: { "en-US": "No account. No network." },
      subhead: { "en-US": "Local play works wherever you play." },
    },
    {
      kind: "screenshot",
      id: "controls",
      flow: "store-04-six-player-controls",
      headline: { "en-US": "Controls under your thumb" },
      subhead: { "en-US": "Undo, finish, and game options from any seat." },
    },
    {
      kind: "screenshot",
      id: "new-game",
      flow: "store-05-new-game",
      headline: { "en-US": "Local or connected" },
      subhead: { "en-US": "One device for the table, or a game across devices." },
    },
    {
      kind: "preview",
      id: "preview",
      segments: [
        { id: "open", flow: "store-preview-01-open" },
        { id: "setup", flow: "store-preview-02-setup" },
        { id: "start", flow: "store-preview-03-start" },
        { id: "play", flow: "store-preview-04-play", holdSeconds: 2 },
      ],
    },
  ],
}

export default config
