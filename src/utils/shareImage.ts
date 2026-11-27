import { Platform, Share } from "react-native"
import { requireOptionalNativeModule } from "expo"
import { File, Paths } from "expo-file-system"

// why: updates reach binaries built before expo-sharing; they lack its native module, and its JS throws on import there.
const hasExpoSharing = requireOptionalNativeModule("ExpoSharing") !== null

export const canShareImage = hasExpoSharing || Platform.OS === "ios"

export async function shareImage(base64: string, fileName: string) {
  const file = new File(Paths.cache, fileName)
  await file.write(base64, { encoding: "base64" })
  if (!hasExpoSharing) {
    await Share.share({ url: file.uri })
    return
  }
  const { shareAsync } = await import("expo-sharing")
  await shareAsync(file.uri, { mimeType: "image/png", UTI: "public.png" })
}
