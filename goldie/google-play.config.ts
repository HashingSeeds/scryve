import { fileURLToPath } from "node:url"

// @ts-expect-error Node loads this file directly and needs its .ts extension.
import ios from "./goldie.config.ts"

const appRoot = fileURLToPath(new URL("../", import.meta.url))

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
  scenes: ios.scenes
    .filter((scene) => scene.kind === "screenshot")
    .map((scene) => ({ ...scene, flow: `play-${scene.flow}` })),
}
