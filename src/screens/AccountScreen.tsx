import type { ReactNode } from "react"
import type { ImageStyle, TextStyle, ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"
import { Image } from "expo-image"

import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { ListItem } from "@/components/ListItem"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export interface AccountScreenProps {
  name?: string
  email?: string
  avatarUrl?: string
  isSigningOut?: boolean
  error?: string
  accountControls?: ReactNode
  onBack?: () => void
  onManageProfile: () => void
  onSignOut: () => void
}

export function AccountScreen({
  name,
  email,
  avatarUrl,
  isSigningOut,
  error,
  accountControls,
  onBack,
  onManageProfile,
  onSignOut,
}: AccountScreenProps) {
  const { themed } = useAppTheme()
  const primaryLabel = name || email || "Signed in"

  return (
    <View style={$fill}>
      <Header title="Account" leftTx="common:back" onLeftPress={onBack} />
      <ScrollView contentContainerStyle={themed($content)}>
        <View style={themed($identity)}>
          <Avatar name={name} email={email} avatarUrl={avatarUrl} />
          <View style={$identityText}>
            <Text text={primaryLabel} preset="subheading" numberOfLines={1} />
            {email && email !== primaryLabel ? (
              <Text text={email} size="xs" style={themed($muted)} numberOfLines={1} />
            ) : null}
          </View>
        </View>

        <View style={themed($section)}>
          <Text text="Your account" preset="formLabel" accessibilityRole="header" />
          <ListItem
            testID="manage-profile-item"
            text="Profile and security"
            accessibilityHint="Opens the profile manager to change your name, email addresses, and password"
            rightIcon="caretRight"
            topSeparator
            bottomSeparator={!accountControls}
            onPress={onManageProfile}
          />
          {accountControls}
        </View>

        <View style={themed($signOut)}>
          {error ? (
            <Text accessibilityRole="alert" text={error} size="xs" style={themed($error)} />
          ) : null}
          <Button
            testID="sign-out-button"
            text={isSigningOut ? "Signing out…" : "Sign out"}
            disabled={isSigningOut}
            style={themed($signOutButton)}
            textStyle={themed($signOutText)}
            onPress={onSignOut}
          />
          <Text text="Local games stay on this device." size="xxs" style={themed($muted)} />
        </View>
      </ScrollView>
    </View>
  )
}

function Avatar({
  name,
  email,
  avatarUrl,
}: Pick<AccountScreenProps, "name" | "email" | "avatarUrl">) {
  const { themed } = useAppTheme()
  if (avatarUrl)
    return (
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri: avatarUrl }}
        style={themed($avatar)}
        contentFit="cover"
      />
    )
  return (
    <View style={[themed($avatar), themed($avatarFallback)]}>
      <Text text={initial(name || email)} preset="subheading" style={themed($avatarInitial)} />
    </View>
  )
}

function initial(label?: string) {
  return label?.trim().charAt(0).toUpperCase() || "?"
}

const AVATAR_SIZE = 64

const $fill: ViewStyle = { flex: 1 }
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 580,
  alignSelf: "center",
  gap: spacing.xl,
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.lg,
  paddingBottom: spacing.xl,
})
const $identity: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.md,
  paddingTop: spacing.sm,
  paddingBottom: spacing.xl,
  borderBottomWidth: 1,
  borderColor: colors.separator,
})
const $identityText: ViewStyle = { flex: 1 }
const $avatar: ThemedStyle<ImageStyle> = ({ colors }) => ({
  width: AVATAR_SIZE,
  height: AVATAR_SIZE,
  borderRadius: AVATAR_SIZE / 2,
  backgroundColor: colors.palette.neutral300,
})
const $avatarFallback: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: colors.tintInactive,
})
const $avatarInitial: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.text })
const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $signOut: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
  paddingTop: spacing.lg,
})
const $signOutButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 50,
  borderRadius: spacing.sm,
  borderColor: colors.error,
  backgroundColor: colors.transparent,
})
const $signOutText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $error: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
