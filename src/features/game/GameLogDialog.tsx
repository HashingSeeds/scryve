import { useMemo, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { FlatList, View } from "react-native"

import { Button } from "@/components/Button"
import {
  $dialogActions,
  $dialogButton,
  DialogCard,
  type DialogOrigin,
} from "@/components/DialogCard"
import { PlayerMark } from "@/components/PlayerMark"
import { Text } from "@/components/Text"
import { relativeTime } from "@/features/connected/connectedCopy"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { gameLog, withTurnDividers, type GameLogItem } from "./LifeLog"
import { teamName } from "./teams"
import type { GameEvent, GamePlayer, TurnLogEntry } from "./types"
import type { TurnGroups } from "../../../convex/lib/turns"

export function GameLogDialog({
  players,
  events,
  turns,
  groups,
  canUndo,
  origin,
  onUndo,
  onClose,
}: {
  players: readonly Pick<GamePlayer, "id" | "name" | "life" | "color" | "shape">[]
  events: readonly GameEvent[]
  turns?: readonly TurnLogEntry[]
  groups?: TurnGroups
  canUndo: boolean
  origin?: DialogOrigin
  onUndo: () => void
  onClose: () => void
}) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const rows = useMemo(
    () => withTurnDividers(gameLog(players, events), turns ?? []),
    [players, events, turns],
  )
  const [openedAt] = useState(Date.now)
  const seats = useMemo(
    () =>
      new Map(players.map((player, index) => [player.id, { ...player, seatNumber: index + 1 }])),
    [players],
  )

  function renderRow({ item }: { item: GameLogItem }) {
    if (item.kind === "turn") {
      const holder = seats.get(item.playerId)
      const label = translate("board:turn.divider", {
        number: item.number,
        name: teamName(players, groups, item.playerId) ?? "",
      })
      return (
        <View
          testID={`game-log-turn-${item.number}`}
          accessible
          accessibilityRole="header"
          accessibilityLabel={label}
          style={themed($turnRow)}
        >
          {holder ? (
            <PlayerMark
              seatNumber={holder.seatNumber}
              color={holder.color}
              shape={holder.shape}
              size={TURN_MARK}
            />
          ) : null}
          <Text text={label} size="xxs" weight="semiBold" style={{ color: colors.textDim }} />
          <View style={[$rule, { backgroundColor: colors.separator }]} />
          <Text
            text={relativeTime(item.at, openedAt)}
            size="xxs"
            style={{ color: colors.textDim }}
          />
        </View>
      )
    }
    const seat = seats.get(item.playerId)
    const source = item.fromPlayerId ? seats.get(item.fromPlayerId) : undefined
    const name = seat?.name ?? ""
    const delta = signed(item.delta)
    const when = relativeTime(item.at, openedAt)
    return (
      <View
        testID={`game-log-row-${item.id}`}
        accessible
        accessibilityLabel={
          source === undefined
            ? translate("board:log.row", { name, delta, life: item.life })
            : translate("board:log.commanderRow", {
                name,
                delta,
                from: source.name,
                life: item.life,
              })
        }
        style={themed($row)}
      >
        {seat ? (
          <PlayerMark
            seatNumber={seat.seatNumber}
            color={seat.color}
            shape={seat.shape}
            size={MARK}
          />
        ) : null}
        <View style={$lines}>
          <View style={themed($headline)}>
            <Text text={name} weight="medium" numberOfLines={1} style={$name} />
            <Text
              text={delta}
              weight="semiBold"
              style={[$number, { color: item.delta < 0 ? colors.error : colors.success }]}
            />
            <Text text="→" style={{ color: colors.textDim }} />
            <Text text={String(item.life)} weight="semiBold" style={$number} />
          </View>
          <View style={themed($detail)}>
            {/* why: the attacker's mark with a sword is how a card shows commander damage. */}
            {source ? (
              <>
                <PlayerMark
                  seatNumber={source.seatNumber}
                  color={source.color}
                  shape={source.shape}
                  insetSwordColor={colors.background}
                  size={SOURCE_MARK}
                />
                <Text
                  text={`${translate("board:log.commanderFrom", { name: source.name })} ·`}
                  size="xxs"
                  numberOfLines={1}
                  style={[$shrink, { color: colors.textDim }]}
                />
              </>
            ) : null}
            <Text text={when} size="xxs" numberOfLines={1} style={{ color: colors.textDim }} />
          </View>
        </View>
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
          keyExtractor={(item) => (item.kind === "turn" ? `turn:${item.operationId}` : item.id)}
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

const MARK = 32
const TURN_MARK = 14
const $turnRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  minHeight: 28,
})
const $rule: ViewStyle = { flex: 1, height: 1 }
const SOURCE_MARK = 18
const $list: ViewStyle = { flexGrow: 0, flexShrink: 1 }
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  minHeight: 52,
})
const $lines: ViewStyle = { flex: 1 }
const $headline: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "baseline",
  gap: spacing.sm,
})
const $name: TextStyle = { flex: 1 }
const $detail: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xxs,
})
const $shrink: TextStyle = { flexShrink: 1 }
const $number: TextStyle = { minWidth: 32, textAlign: "right", fontVariant: ["tabular-nums"] }
