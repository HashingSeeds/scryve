import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import QRCode from "react-native-qrcode-svg"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const QR_SIZE = 184
const QR_QUIET_ZONE = 16

export function InviteCard({
  qrPayload,
  manualCode,
  seatSummary,
  onShare,
}: {
  qrPayload?: string | null
  manualCode?: string
  seatSummary: string
  onShare?: () => void
}) {
  const { themed } = useAppTheme()
  if (!qrPayload && !manualCode) return null
  return (
    <View style={themed($card)}>
      {qrPayload ? (
        <View style={themed($qrTile)}>
          <QRCode
            testID="invite-qr"
            value={qrPayload}
            size={QR_SIZE}
            quietZone={QR_QUIET_ZONE}
            color="#000000"
            backgroundColor="#FFFFFF"
            ecl="H"
          />
        </View>
      ) : null}
      {manualCode ? (
        <View style={themed($codeBlock)}>
          <Text size="xxs" style={themed($label)} text="INVITE CODE" />
          <Text testID="manual-code" preset="heading" style={themed($code)} text={manualCode} />
          <Text
            size="xs"
            style={themed($hint)}
            text={`Scan to join or enter code ${manualCode}.`}
          />
        </View>
      ) : null}
      <Text size="xs" style={themed($hint)} text={seatSummary} />
      {onShare ? (
        <Button
          testID="share-invite-button"
          text="Share invite"
          style={themed($share)}
          onPress={onShare}
        />
      ) : null}
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
const $label: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  letterSpacing: 2,
})
const $code: ThemedStyle<TextStyle> = () => ({ letterSpacing: 4, textAlign: "center" })
const $hint: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textAlign: "center",
})
const $share: ThemedStyle<ViewStyle> = () => ({ alignSelf: "stretch", minHeight: 48 })
