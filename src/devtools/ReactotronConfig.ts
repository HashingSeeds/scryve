import { Platform, NativeModules } from "react-native"
import { ReactotronReactNative } from "reactotron-react-native"
import mmkvPlugin from "reactotron-react-native-mmkv"

import { storage } from "@/utils/storage"

import { Reactotron } from "./ReactotronClient"

const reactotron = Reactotron.configure({
  name: require("../../package.json").name,
  onConnect: () => {
    Reactotron.clear()
  },
})

reactotron.use(mmkvPlugin<ReactotronReactNative>({ storage }))

if (Platform.OS !== "web") {
  reactotron.useReactNative({
    networking: {
      ignoreUrls: /symbolicate/,
    },
  })
}

/**
 * Reactotron allows you to define custom commands that you can run
 * from Reactotron itself, and they will run in your app.
 *
 * Define them in the section below with `onCustomCommand`. Use your
 * creativity -- this is great for development to quickly and easily
 * get your app into the state you want.
 *
 * NOTE: If you edit this file while running the app, you will need to do a full refresh
 * or else your custom commands won't be registered correctly.
 */
reactotron.onCustomCommand({
  title: "Show Dev Menu",
  description: "Opens the React Native dev menu",
  command: "showDevMenu",
  handler: () => {
    Reactotron.log("Showing React Native dev menu")
    NativeModules.DevMenu.show()
  },
})

console.tron = reactotron

declare global {
  interface Console {
    tron: typeof reactotron
  }
}

reactotron.connect()
