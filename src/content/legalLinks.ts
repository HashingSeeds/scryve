import { Alert, Linking } from "react-native"
import * as WebBrowser from "expo-web-browser"

import { translate } from "@/i18n/translate"

export const APPLE_STANDARD_EULA_URL =
  "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"

// why: iOS can refuse Linking.openURL for this page, leaving the link dead (SCRYVE-B).
export async function openAppleStandardEula() {
  try {
    await WebBrowser.openBrowserAsync(APPLE_STANDARD_EULA_URL)
  } catch {
    await Linking.openURL(APPLE_STANDARD_EULA_URL).catch(() =>
      Alert.alert(translate("account:legal.licenseOpenFailed"), APPLE_STANDARD_EULA_URL),
    )
  }
}
