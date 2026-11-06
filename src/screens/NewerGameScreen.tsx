import { useState } from "react"
import { View, type ViewStyle } from "react-native"

import { Button } from "@/components/Button"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

type UpdateCheck = "none" | "failed" | "restarting"

interface NewerGameScreenProps {
  onCheckForUpdates: () => Promise<UpdateCheck>
  onSupport: () => void
  onDeleteGame: () => void
}

export function NewerGameScreen({
  onCheckForUpdates,
  onSupport,
  onDeleteGame,
}: NewerGameScreenProps) {
  const { themed, theme } = useAppTheme()
  const [check, setCheck] = useState<UpdateCheck | "checking">()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const checking = check === "checking" || check === "restarting"
  return (
    <Screen
      preset="auto"
      safeAreaEdges={["top", "bottom"]}
      backgroundColor={theme.colors.surface}
      contentContainerStyle={themed($screen)}
    >
      <View style={themed($copy)}>
        <Text tx="play:launch.updateTitle" preset="heading" accessibilityRole="header" />
        <Text tx="play:launch.updateMessage" />
        {check === "none" || check === "failed" ? (
          <Text
            tx={check === "none" ? "play:launch.noUpdate" : "play:launch.updateCheckFailed"}
            tone="dim"
            accessibilityLiveRegion="polite"
          />
        ) : null}
      </View>
      <View style={themed($actions)}>
        <Button
          tx={checking ? "play:launch.checkingForUpdates" : "play:launch.checkForUpdates"}
          preset="primary"
          style={themed($primaryAction)}
          disabled={checking}
          onPress={() => {
            setCheck("checking")
            void onCheckForUpdates().then(setCheck)
          }}
        />
        <Button
          tx="play:launch.contactSupport"
          style={themed($secondaryAction)}
          onPress={onSupport}
        />
        <Button
          tx="play:launch.deleteGame"
          style={themed($secondaryAction)}
          onPress={() => setConfirmingDelete(true)}
        />
      </View>
      <ConfirmDialog
        visible={confirmingDelete}
        title={translate("play:launch.deleteGameTitle")}
        message={translate("play:launch.deleteGameMessage")}
        confirmText={translate("play:launch.deleteGame")}
        cancelText={translate("play:launch.keepGame")}
        backdropAccessibilityLabel={translate("play:launch.keepGame")}
        destructive
        confirmTestID="newer-game-delete-confirm"
        cancelTestID="newer-game-delete-cancel"
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => {
          setConfirmingDelete(false)
          onDeleteGame()
        }}
      />
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexGrow: 1,
  width: "100%",
  maxWidth: 480,
  alignSelf: "center",
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.lg,
})

const $copy: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexGrow: 1,
  justifyContent: "center",
  gap: spacing.sm,
})

const $actions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $primaryAction: ThemedStyle<ViewStyle> = ({ radius }) => ({
  borderRadius: radius.xl,
})

const $secondaryAction: ThemedStyle<ViewStyle> = ({ radius }) => ({
  borderRadius: radius.xl,
  borderWidth: 2,
})
