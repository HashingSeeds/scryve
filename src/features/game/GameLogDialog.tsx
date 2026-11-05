import { useMemo } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { FlatList, View } from "react-native"

import { Button } from "@/components/Button"
import {
  $dialogActions,
  $dialogButton,
  DialogCard,
  type DialogOrigin,
} from "@/components/DialogCard"
import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { gameLog, type GameLogRow } from "./LifeLog"
import type { GameEvent, GamePlayer } from "./types"

export function GameLogDialog({
  players,
  events,
  canUndo,
  origin,
  onUndo,
  onClose,
}: {
  players: readonly Pick<GamePlayer, "id" | "name" | "life">[]
  events: readonly GameEvent[]
  canUndo: boolean
  origin?: DialogOrigin
  onUndo: () => void
  onClose: () => void
}) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const rows = useMemo(() => gameLog(players, events), [players, events])
  const names = useMemo(() => new Map(players.map(({ id, name }) => [id, name])), [players])

  function renderRow({ item }: { item: GameLogRow }) {
    const name = names.get(item.playerId) ?? ""
    const from = item.fromPlayerId && names.get(item.fromPlayerId)
    const delta = signed(item.delta)
    return (
      <View
        testID={`game-log-row-${item.id}`}
        accessible
        accessibilityLabel={
          from === undefined
            ? translate("board:log.row", { name, delta, life: item.life })
            : translate("board:log.commanderRow", { name, delta, from, life: item.life })
        }
        style={themed($row)}
      >
        <View style={themed($who)}>
          <Text text={name} weight="bold" numberOfLines={1} style={$shrink} />
          {from === undefined ? null : (
            <Text
              text={translate("board:log.commanderFrom", { name: from })}
              size="xxs"
              numberOfLines={1}
              style={[$shrink, { color: colors.textDim }]}
            />
          )}
        </View>
        <Text
          text={delta}
          weight="bold"
          style={[$number, { color: item.delta < 0 ? colors.error : colors.success }]}
        />
        <Text text={String(item.life)} style={$number} />
      </View>
    )
  }

  return (
    <DialogCard
      visible
      onClose={onClose}
      origin={origin}
      backdropTestID="game-log-backdrop"
      backdropAccessibilityLabel={translate("board:log.close")}
      dialogTestID="game-log-dialog"
      accessibilityViewIsModal
      wide
    >
      <Text tx="board:menu.log" preset="subheading" />
      {rows.length === 0 ? (
        <Text tx="board:log.empty" style={{ color: colors.textDim }} />
      ) : (
        <FlatList
          testID="game-log-list"
          data={rows}
          keyExtractor={({ id }) => id}
          renderItem={renderRow}
          style={$list}
        />
      )}
      <View style={themed($dialogActions)}>
        <Button
          testID="game-log-undo"
          tx="common:undo"
          accessibilityLabel={translate("board:log.undoLast")}
          disabled={!canUndo}
          style={themed($dialogButton)}
          onPress={onUndo}
        />
        <Button tx="common:done" style={themed($dialogButton)} onPress={onClose} />
      </View>
    </DialogCard>
  )
}

function signed(delta: number) {
  return `${delta < 0 ? "−" : "+"}${Math.abs(delta)}`
}

const $list: ViewStyle = { flexGrow: 0, flexShrink: 1 }
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "baseline",
  gap: spacing.sm,
  minHeight: 32,
  paddingVertical: spacing.xxs,
})
const $who: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  flexDirection: "row",
  alignItems: "baseline",
  gap: spacing.xs,
})
const $shrink: TextStyle = { flexShrink: 1 }
const $number: TextStyle = { minWidth: 44, textAlign: "right", fontVariant: ["tabular-nums"] }
