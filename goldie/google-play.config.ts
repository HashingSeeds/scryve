import { fileURLToPath } from "node:url"

// @ts-expect-error Node loads this file directly and needs its .ts extension.
import ios from "./goldie.config.ts"

const appRoot = fileURLToPath(new URL("../", import.meta.url))
const localScenes = ios.scenes
  .filter((scene) => scene.kind === "screenshot" && scene.id !== "new-game")
  .map((scene) => ({ ...scene, flow: `play-${scene.flow}` }))

export default {
  ...ios,
  appRoot,
  devices: ["pixel-10-pro"],
  android: {
    appPath: "../android/app/build/outputs/apk/release/app-release.apk",
    applicationId: "com.sowinghope.count.preview",
  },
  theme: {
    ...ios.theme,
    template: "uniform",
    layout: "classic",
    copyHeightRatio: 0.24,
    deviceWidthRatio: 0.84,
  },
  store: {
    ...ios.store,
    subtitle: { "en-US": "TCG life totals, together" },
    description: {
      "en-US":
        "Scryve keeps life totals clear for the whole table. Start a local game in two taps, with no account or network. Up to six players share one board, with controls for every seat.\n\nFor connected play, host a game or join one from another device. Share an invite or enter a code so everyone can follow the same game.",
    },
  },
  scenes: [
    localScenes[0],
    {
      kind: "screenshot",
      id: "connected-play",
      flow: "play-store-06-connected",
      headline: { "en-US": "Connected when you want." },
      subhead: { "en-US": "Host a game. Friends join with a code." },
    },
    ...localScenes.slice(1),
  ],
}
