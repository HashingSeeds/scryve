import type { ReactNode } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { $dialogText, DialogCard } from "@/components/DialogCard"
import { Text } from "@/components/Text"
import { drawsLabel } from "@/features/game/domain"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import type { MatchBestOf } from "../../../convex/lib/matchResults"

export function MatchScoreDialog({
  bestOf,
  gameNumber,
  seats,
  draws,
  onClose,
  children,
}: {
  bestOf: MatchBestOf
  gameNumber: number
  seats: readonly { id: string; name: string; wins: number }[]
  draws: number
  onClose: () => void
  children: ReactNode
}) {
  const { themed } = useAppTheme()
  return (
    <DialogCard
      visible
      onClose={onClose}
      backdropTestID="match-backdrop"
      backdropAccessibilityLabel={translate("board:match.closeScore")}
      dialogTestID="match-dialog"
      accessibilityViewIsModal
    >
      <Text
        tx="board:match.scoreTitle"
        txOptions={{ bestOf, number: gameNumber }}
        preset="subheading"
      />
      <View style={themed($score)}>
        {seats.map((seat) => (
          <View key={seat.id} style={themed($row)}>
            <Text text={seat.name} numberOfLines={1} style={themed($name)} />
            <Text text={String(seat.wins)} weight="medium" />
          </View>
        ))}
        {draws ? <Text size="xs" text={drawsLabel(draws)} style={themed($dialogText)} /> : null}
      </View>
      {children}
    </DialogCard>
  )
}

const $score: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  gap: spacing.sm,
})
const $name: ThemedStyle<TextStyle> = () => ({ flexShrink: 1 })
