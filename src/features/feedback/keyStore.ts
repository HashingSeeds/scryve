import * as SecureStore from "expo-secure-store"

const NAME = "scryve.feedbackKey"

// why: the Keychain usually survives an iOS reinstall, so a player keeps their threads; MMKV would not.
export const keyStore = {
  read: () => SecureStore.getItemAsync(NAME),
  write: (value: string) => SecureStore.setItemAsync(NAME, value),
}
