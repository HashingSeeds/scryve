import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export interface HomeScreenProps {
  hasActiveGame: boolean
  onNewGame: () => void
  onResumeGame: () => void
  onHistory: () => void
  onSettings: () => void
  onConnected?: () => void
  onAccount?: () => void
  isSignedIn?: boolean
}

export function HomeScreen({
  hasActiveGame,
  onNewGame,
  onResumeGame,
  onHistory,
  onSettings,
  onConnected,
  onAccount,
  isSignedIn = false,
}: HomeScreenProps) {
  const { themed } = useAppTheme()
  return (
    <Screen preset="auto" safeAreaEdges={["top", "bottom"]} contentContainerStyle={themed($screen)}>
      <View style={themed($hero)}>
        <Text tx="localGame:appName" preset="formLabel" style={themed($eyebrow)} />
        <Text
          tx="localGame:homeTitle"
          preset="heading"
          accessibilityRole="header"
          style={themed($title)}
        />
        <Text tx="localGame:homeSubtitle" style={themed($subtitle)} />
      </View>
      <View style={themed($spacer)} />
      <View style={themed($actions)}>
        {hasActiveGame ? (
          <>
            <Button
              testID="resume-game-button"
              tx="localGame:resume"
              preset="reversed"
              style={themed($primaryButton)}
              textStyle={themed($primaryText)}
              onPress={onResumeGame}
            />
            <Text tx="localGame:activeGameHint" size="xs" style={themed($primaryHint)} />
          </>
        ) : (
          <Button
            testID="new-game-button"
            tx="localGame:newGame"
            preset="reversed"
            style={themed($primaryButton)}
            textStyle={themed($primaryText)}
            onPress={onNewGame}
          />
        )}
        <Button
          testID="connected-play-button"
          tx="localGame:connectedPlay"
          style={themed($secondaryButton)}
          textStyle={themed($secondaryText)}
          onPress={onConnected}
        />
        <View style={themed($utilityRow)}>
          <Button
            tx="localGame:history"
            style={themed($utilityButton)}
            textStyle={themed($utilityText)}
            onPress={onHistory}
          />
          <Button
            tx="localGame:settings"
            style={themed($utilityButton)}
            textStyle={themed($utilityText)}
            onPress={onSettings}
          />
        </View>
      </View>
      <View style={themed($footer)}>
        <Button
          testID="account-button"
          tx={isSignedIn ? "localGame:account" : "localGame:signUpOrLogIn"}
          style={themed($accountButton)}
          textStyle={themed($accountText)}
          pressedStyle={themed($accountPressed)}
          onPress={onAccount}
        />
        <Text tx="localGame:localPlayNote" size="xxs" style={themed($footerNote)} />
      </View>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexGrow: 1,
  width: "100%",
  maxWidth: 640,
  alignSelf: "center",
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.sm,
  paddingBottom: spacing.md,
})

const $hero: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
  alignItems: "flex-start",
  paddingTop: spacing.xl,
})

const $spacer: ThemedStyle<ViewStyle> = ({ spacing }) => ({ flex: 1, minHeight: spacing.xl })

const $eyebrow: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.brandText,
  letterSpacing: 3,
})
const $title: ThemedStyle<TextStyle> = () => ({ fontSize: 42, lineHeight: 46 })
const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  fontSize: 18,
  lineHeight: 25,
})

const $actions: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })

const $primaryButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 62,
  borderRadius: spacing.sm,
})
const $primaryText: ThemedStyle<TextStyle> = () => ({ fontSize: 18, lineHeight: 24 })
const $primaryHint: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textAlign: "center",
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 52,
  borderRadius: spacing.sm,
  borderColor: colors.tint,
})
const $secondaryText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })

const $utilityRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
})
const $utilityButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  minHeight: 46,
  borderRadius: spacing.sm,
  borderColor: colors.separator,
})
const $utilityText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 15,
  color: colors.textDim,
})

const $footer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  gap: spacing.xxs,
  paddingTop: spacing.lg,
})
const $accountButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 44,
  paddingHorizontal: spacing.md,
  borderWidth: 0,
  borderRadius: spacing.md,
  backgroundColor: colors.transparent,
})
const $accountText: ThemedStyle<TextStyle> = ({ colors }) => ({ fontSize: 15, color: colors.tint })
const $accountPressed: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.separator,
})
const $footerNote: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textAlign: "center",
})
