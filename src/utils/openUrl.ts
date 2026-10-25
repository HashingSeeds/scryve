import { Alert, Linking } from "react-native"
import * as Clipboard from "expo-clipboard"

import { translate } from "@/i18n/translate"

export async function openUrl(url: string) {
  try {
    await Linking.openURL(url)
  } catch {
    const email = url.startsWith("mailto:")
      ? decodeURIComponent(url.slice("mailto:".length).split("?")[0])
      : undefined
    const shown = email ?? url
    Alert.alert(translate(email ? "common:openUrl.noMailApp" : "common:openUrl.failed"), shown, [
      { text: translate("common:close"), style: "cancel" },
      {
        text: translate("common:openUrl.copy"),
        onPress: () => void Clipboard.setStringAsync(shown).catch(() => undefined),
      },
    ])
  }
}
