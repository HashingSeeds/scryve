import { Platform, Share } from "react-native"
import { File, Paths } from "expo-file-system"

/** why: React Native's Android share sheet takes text only, so sharing an image there needs a native module this binary lacks. */
export const canShareImage = Platform.OS === "ios"

export async function shareImage(base64: string, fileName: string) {
  const file = new File(Paths.cache, fileName)
  await file.write(base64, { encoding: "base64" })
  await Share.share({ url: file.uri })
}
