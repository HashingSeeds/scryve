import type { TextStyle, ViewStyle } from "react-native"
import { useWindowDimensions, View } from "react-native"
import QRCode from "react-native-qrcode-svg"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const QR_MAX_SIZE = 184
const QR_MIN_SIZE = 120
const QR_HEIGHT_SHARE = 0.2
const QR_QUIET_ZONE = 8
const SIDE_BY_SIDE_MAX_HEIGHT = 760

export function inviteQrSize(windowHeight: number) {
  return Math.round(Math.min(QR_MAX_SIZE, Math.max(QR_MIN_SIZE, windowHeight * QR_HEIGHT_SHARE)))
}

export function inviteCardIsSideBySide(windowHeight: number) {
  return windowHeight < SIDE_BY_SIDE_MAX_HEIGHT
}

export function InviteCard({
  qrPayload,
  manualCode,
  onShare,
}: {
  qrPayload?: string | null
  manualCode?: string
  onShare?: () => void
}) {
  const { themed } = useAppTheme()
  const { height } = useWindowDimensions()
  const qrSize = inviteQrSize(height)
  const sideBySide = inviteCardIsSideBySide(height)
  if (!qrPayload && !manualCode) return null
  return (
    <View style={[themed($card), sideBySide && themed($sideBySideCard)]}>
      {qrPayload ? (
        <View style={themed($qrTile)}>
          <QRCode
            testID="invite-qr"
            value={qrPayload}
            size={qrSize}
            quietZone={QR_QUIET_ZONE}
            color="#000000"
            backgroundColor="#FFFFFF"
            ecl="H"
          />
        </View>
      ) : null}
      <View style={[themed($details), sideBySide && themed($sideBySideDetails)]}>
        {manualCode ? (
          <View style={[themed($codeBlock), sideBySide && themed($sideBySideCodeBlock)]}>
            <Text size="xxs" style={themed($label)} text="INVITE CODE" />
            <Text
              testID="manual-code"
              preset={sideBySide ? "subheading" : "heading"}
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[themed($code), sideBySide && themed($compactCode)]}
              text={manualCode}
            />
            {sideBySide ? null : (
              <Text
                size="xs"
                style={themed($hint)}
                text={`Scan to join or enter code ${manualCode}.`}
              />
            )}
          </View>
        ) : null}
        {onShare ? (
          <Button
            testID="share-invite-button"
            text="Share invite"
            style={themed($share)}
            onPress={onShare}
          />
        ) : null}
      </View>
    </View>
  )
}

const $card: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignItems: "center",
  gap: spacing.sm,
  padding: spacing.md,
  borderRadius: spacing.md,
  borderWidth: 1,
  borderColor: colors.separator,
})
const $qrTile: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.xxs,
  borderRadius: spacing.sm,
  backgroundColor: "#FFFFFF",
})
const $codeBlock: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  gap: spacing.xxs,
})
const $sideBySideCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.md,
})
const $details: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignSelf: "stretch",
  alignItems: "center",
  gap: spacing.sm,
})
const $sideBySideDetails: ThemedStyle<ViewStyle> = () => ({ flex: 1 })
const $sideBySideCodeBlock: ThemedStyle<ViewStyle> = () => ({ alignItems: "flex-start" })
const $label: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  letterSpacing: 2,
})
const $code: ThemedStyle<TextStyle> = () => ({ letterSpacing: 4, textAlign: "center" })
const $compactCode: ThemedStyle<TextStyle> = () => ({ letterSpacing: 2, textAlign: "left" })
const $hint: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textAlign: "center",
})
const $share: ThemedStyle<ViewStyle> = () => ({ alignSelf: "stretch", minHeight: 48 })
