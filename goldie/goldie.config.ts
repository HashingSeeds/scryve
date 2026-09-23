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

const APP_ROOT = "/Users/mcc/code/scryve"

const config = {
  appRoot: APP_ROOT,
  // Release simulator build produced by:
  //   xcodebuild -workspace ios/Scryve.xcworkspace -scheme Scryve \
  //     -configuration Release -sdk iphonesimulator -derivedDataPath /tmp/scryve-dd
  appPath: "/tmp/scryve-dd/Build/Products/Release-iphonesimulator/Scryve.app",
  bundleId: "com.sowinghope.count",

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
    subtitle: { "en-US": "Life counter for TCG tables" },
    developer: "Sowing Hope",
    category: "Utilities",
    rating: 5,
    ratingCount: "New",
    ageRating: "4+",
    price: "Free",
    description: {
      "en-US":
        "Scryve keeps life totals for the whole table on one device. Start a local game in two taps, with no account and no network.\n\nUp to six players share a single clear board. Every seat has its own controls, so anyone can count their own life without passing the phone around.",
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
      subhead: { "en-US": "Start a local game in two taps." },
    },
    {
      kind: "screenshot",
      id: "new-game",
      flow: "store-05-new-game",
      headline: { "en-US": "Set up once, play all night" },
      subhead: { "en-US": "Player count, starting life, names, and colors." },
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
      id: "five-player",
      flow: "store-02-five-player",
      headline: { "en-US": "No account. No network." },
      subhead: { "en-US": "Local play works wherever you play." },
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
