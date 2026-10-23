import { router } from "expo-router"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"

export function FeedbackUnavailable() {
  return (
    <Screen
      preset="fixed"
      safeAreaEdges={["bottom"]}
      header={{
        titleTx: "feedback:mine.title",
        leftTx: "common:back",
        onLeftPress: () => (router.canGoBack() ? router.back() : router.replace("/")),
      }}
    >
      <Text tx="feedback:unavailable" />
    </Screen>
  )
}
