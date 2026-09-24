// @ts-expect-error Node loads this file directly and needs its .ts extension.
import play from "../google-play.config.ts"

export default {
  ...play,
  android: {
    ...play.android,
    appPath: "../../android/app/build/outputs/apk/release/app-release.apk",
  },
  scenes: [
    {
      kind: "screenshot",
      id: "six-player",
      flow: "play-store-03-six-player",
      headline: { "en-US": "Every point. Every player." },
      subhead: { "en-US": "Up to six players on one clear board." },
    },
    {
      kind: "screenshot",
      id: "connected-play",
      flow: "play-store-06-connected",
      headline: { "en-US": "Connected when you want." },
      subhead: { "en-US": "Host a game. Friends join with a code." },
    },
    {
      kind: "screenshot",
      id: "two-player",
      flow: "play-store-01-two-player",
      headline: { "en-US": "Life totals, without the fuss" },
      subhead: { "en-US": "Start a local game in seconds." },
    },
    {
      kind: "screenshot",
      id: "five-player",
      flow: "play-store-02-five-player",
      headline: { "en-US": "Room for the whole table" },
      subhead: { "en-US": "Keep every seat in view." },
    },
    {
      kind: "screenshot",
      id: "new-game",
      flow: "play-store-05-new-game",
      headline: { "en-US": "Set up your game" },
      subhead: { "en-US": "Choose players, life totals, and format." },
    },
  ],
}
