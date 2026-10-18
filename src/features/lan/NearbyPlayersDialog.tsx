import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { DialogCard, type DialogOrigin } from "@/components/DialogCard"
import { PlayerMark } from "@/components/PlayerMark"
import { Text } from "@/components/Text"
import type { ReportablePlayer } from "@/features/connected/PlayerActionsDialog"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export function NearbyPlayersDialog({
  players,
  awayPlayerIds,
  origin,
  onClose,
  onRole,
}: {
  players: readonly ReportablePlayer[]
  awayPlayerIds: readonly string[]
  origin?: DialogOrigin
  onClose: () => void
  onRole?: () => void
}) {
  const { themed } = useAppTheme()
  return (
    <DialogCard
      visible
      onClose={onClose}
      origin={origin}
      backdropTestID="nearby-players-backdrop"
      backdropAccessibilityLabel={translate("connected:playerActions.close")}
      dialogTestID="nearby-players-dialog"
      style={themed($dialog)}
    >
      <Text preset="subheading" tx="connected:playerActions.title" />
      {onRole ? (
        <Button
          testID="role-from-players-button"
          tx="connected:playerActions.yourRole"
          onPress={onRole}
        />
      ) : null}
      {players.map((player) => (
        <View key={player.playerId} style={themed($row)}>
          <PlayerMark
            seatNumber={player.seat}
            shape={player.shape}
            color={player.color}
            size={28}
          />
          <Text
            numberOfLines={1}
            style={themed($name)}
            weight={player.controlledByMe ? "semiBold" : "normal"}
            text={
              player.controlledByMe
                ? translate("connected:nearby.you", { name: player.displayName })
                : player.displayName
            }
          />
          {awayPlayerIds.includes(player.playerId) ? (
            <Text
              testID={`nearby-away-seat-${player.seat}`}
              size="xs"
              style={themed($muted)}
              tx="connected:nearby.away"
            />
          ) : null}
        </View>
      ))}
      <Button tx="common:close" onPress={onClose} />
    </DialogCard>
  )
}

const $dialog: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})
const $name: ThemedStyle<TextStyle> = () => ({ flex: 1 })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
