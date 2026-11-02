import type { GoldieConfig } from "goldie"
import { fileURLToPath } from "node:url"

const APP_ROOT = fileURLToPath(new URL("..", import.meta.url))

/**
 * One-time setup per iOS simulator, kept in its keychain and settings across captures: sign in as
 * riley+clerk_test@sow.care (store-sign-in signs in on Android and on a 6.9" iPhone, but Clerk's
 * sheet sits elsewhere on other screens), and accept "Open in Scryve (Preview)?" the first time
 * the shared deck link opens. Run `node goldie/seed.cjs` after `pnpm preview:up`.
 */
const config: GoldieConfig = {
  appRoot: APP_ROOT,
  // why: preview EAS builds pointed at this branch's Convex preview (pnpm preview:up), seeded by goldie/seed.cjs, so captures never read staging or production.
  appPath: "../build/goldie-ios/ScryvePreview.app",
  bundleId: "com.sowinghope.count.preview",
  android: {
    appPath: "../build/goldie-android.apk",
    applicationId: "com.sowinghope.count.preview",
  },

  devices: ["iphone-6.9", "ipad-13", "pixel-10-pro"],
  locales: ["en-US"],
  appearance: "dark",

  frame: { variant: { "iphone-6.9": "17-pro-silver", "ipad-13": "ipad-pro-13-silver" } },

  theme: {
    background: "radial-gradient(120% 80% at 50% 0%, #3C2A24 0%, #191015 45%, #000000 100%)",
    headlineColor: "#F4F2F1",
    subheadColor: "#B6ACA6",
    fontFamily: "Rubik",
    fontFiles: [
      {
        family: "Rubik",
        files: {
          400: "../assets/fonts/Rubik-Regular.ttf",
          600: "../assets/fonts/Rubik-SemiBold.ttf",
          700: "../assets/fonts/Rubik-Bold.ttf",
        },
      },
    ],
    copyHeightRatio: 0.24,
    deviceWidthRatio: 0.84,
    // why: every line of copy fits on one line, so a band sized for one-line copy keeps the
    // device close to it. Both keys need the mchisolm0/goldie fork; published goldie ignores them.
    copyBand: 0.16,
    copyScale: 0.95,
    // why: two player boards put an upside-down seat on top, so their tiles show the whole device or its bottom half.
    template: ["hero", "trio", "classic", "tilt", "offset", "copy-below", "tilt-right"],
  },

  store: {
    name: "Scryve",
    subtitle: { "en-US": "Life counter for card games" },
    developer: "Sowing Hope",
    category: "Games",
    rating: 4.8,
    ratingCount: "120 Ratings",
    ageRating: "4+",
    price: "Free",
    description: {
      "en-US":
        "The life counter for Magic, Yu-Gi-Oh!, and Pokémon. Tap to change a total.\n\nTwo to six players, commander damage per opponent, and Pokémon down to the bench. A local game needs no account, and the app needs no signal.\n\nShare a code and the whole table is on every phone. Share a deck by link and friends can play it right away. Local and connected games land in one history, with a win rate for every deck.",
    },
  },

  scenes: [
    {
      kind: "screenshot",
      id: "connected",
      flow: "store-01-connected",
      headline: { "en-US": "Local or connected" },
      subhead: { "en-US": "Starts on your phone. Connect with a code." },
    },
    {
      kind: "screenshot",
      id: "games",
      flow: "store-game-mtg",
      // why: trio is a three device layout in the mchisolm0/goldie fork; Magic sits in front.
      layout: "trio",
      secondScene: "game-ygo",
      thirdScene: "game-pokemon",
      headline: { "en-US": "Your game, covered" },
      subhead: { "en-US": "Pick your game. More on the way." },
    },
    {
      kind: "screenshot",
      id: "shared-deck",
      flow: "store-02-shared-deck",
      headline: { "en-US": "Play a friend's deck" },
      subhead: { "en-US": "Open their link and play. Keep a copy." },
    },
    {
      kind: "screenshot",
      id: "decks",
      flow: "store-03-decks",
      headline: { "en-US": "Win rates per deck" },
      subhead: { "en-US": "Every game you play counts toward its deck." },
    },
    {
      kind: "screenshot",
      id: "commander-damage",
      flow: "store-04-commander-damage",
      headline: { "en-US": "Commander damage" },
      subhead: { "en-US": "Track each opponent on their own card." },
    },
    {
      kind: "screenshot",
      id: "history",
      flow: "store-05-history",
      headline: { "en-US": "Every game saved" },
      subhead: { "en-US": "Local and connected games, one history." },
    },
    // why: these boards recolor seats 1 and 2, which carries over; six-players restores them.
    { kind: "capture", id: "game-ygo", flow: "store-game-ygo" },
    { kind: "capture", id: "game-pokemon", flow: "store-game-pokemon" },
    {
      kind: "screenshot",
      id: "six-players",
      flow: "store-06-six-players",
      headline: { "en-US": "Two to six players" },
      subhead: { "en-US": "Pick the layout that matches how you sit." },
    },
    {
      kind: "preview",
      id: "preview",
      // why: published goldie ignores this key; the mchisolm0/goldie fork runs it off camera.
      prepare: "store-preview-00-ready",
      segments: [
        { id: "connect", flow: "store-preview-01-connect" },
        { id: "join", flow: "store-preview-02-join" },
        { id: "play", flow: "store-preview-03-play", holdSeconds: 1.5 },
      ],
    },
  ],
}

export default config
