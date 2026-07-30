import type { ViewStyle } from "react-native"

import { EmptyState } from "@/components/EmptyState"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export function ActiveGameGuardScreen({
  onBack,
  onResume,
}: {
  onBack: () => void
  onResume: () => void
}) {
  const { themed } = useAppTheme()
  return (
    <Screen preset="auto" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <Header titleTx="localGame:newGame" leftTx="common:back" onLeftPress={onBack} />
      <EmptyState
        imageSource={null}
        headingTx="localGame:activeGameTitle"
        contentTx="localGame:activeGameContent"
        buttonTx="localGame:resume"
        buttonOnPress={onResume}
        ButtonProps={{ testID: "guard-resume-game-button" }}
      />
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 640,
  alignSelf: "center",
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl,
})
