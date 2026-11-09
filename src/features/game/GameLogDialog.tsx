import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { FlatList, View } from "react-native"

import { Button } from "@/components/Button"
import { TableGlyph } from "@/components/CounterChips"
import {
  $dialogActions,
  $dialogButton,
  DialogCard,
  type DialogOrigin,
} from "@/components/DialogCard"
import { PlayerMark } from "@/components/PlayerMark"
import { $sheetScroll, $sheetScrollContent } from "@/components/sheetStyles"
import { Text } from "@/components/Text"
import { relativeTime } from "@/features/connected/connectedCopy"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { counterLog, gameLog, mergedLog, withTurnDividers, type GameLogItem } from "./LifeLog"
import { tableItemLabel } from "./playSystems"
import { teamName } from "./teams"
import type { CounterLogEntry, GameEvent, GamePlayer, TurnLogEntry } from "./types"
import { customCounterNameOf } from "../../../convex/lib/table"
import type { TurnGroups } from "../../../convex/lib/turns"

export function GameLogDialog({
  players,
  events,
  turns,
  groups,
  sharedLife = false,
  counters,
  canUndo,
  undoLabel = translate("board:log.undoLast"),
  origin,
  onMore,
  positionOf,
  onUndo,
  onClose,
}: {
  players: readonly Pick<GamePlayer, "id" | "name" | "life" | "color" | "shape">[]
  events: readonly GameEvent[]
  turns?: readonly TurnLogEntry[]
  groups?: TurnGroups
  /** why: Two-Headed Giant heads share one life, so a row names the team, says which head made it, and counts the team's total. */
  sharedLife?: boolean
  counters?: readonly CounterLogEntry[]
  canUndo: boolean
  undoLabel?: string
  origin?: DialogOrigin
  /** why: a connected game's log arrives a page at a time. */
  onMore?: () => void
  /** why: a connected log places rows under turns by the authority's order, not device clocks. */
  positionOf?: (operationId: string) => number | undefined
  onUndo: () => void
  onClose: () => void
}) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const rows = useMemo(
    () =>
      withTurnDividers(
        mergedLog(
          gameLog(players, events, sharedLife ? groups : undefined),
          counterLog(counters ?? []),
          positionOf,
        ),
        turns ?? [],
        positionOf,
      ),
    [players, events, turns, groups, sharedLife, counters, positionOf],
  )
  // why: a page can hold only changes the log hides, such as a change with its undo or passes with turns hidden, which leaves no new row to scroll to, so the log reads on by itself.
  const shownRows = useRef<number | undefined>(undefined)
  const readOn = useEffectEvent(() => {
    const before = shownRows.current
    shownRows.current = rows.length
    if (rows.length === 0 || rows.length === before) onMore?.()
  })
  useEffect(() => readOn(), [events, turns])
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
    if (item.kind === "counter") {
      const seat = seats.get(item.playerId)
      const name = seat?.name ?? ""
      const custom = customCounterNameOf(item.counterId)
      const counter = custom ?? tableItemLabel({ id: item.counterId, label: item.counterId })
      const delta = signed(item.delta)
      return (
        <View
          testID={`game-log-counter-${item.id}`}
          accessible
          accessibilityLabel={translate("board:log.counterRow", {
            name,
            counter,
            delta,
            value: item.value,
          })}
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
              <Text text={delta} weight="semiBold" style={[$number, { color: colors.text }]} />
              <Text text="→" style={{ color: colors.textDim }} />
              <Text text={String(item.value)} weight="semiBold" style={$number} />
            </View>
            <View style={themed($detail)}>
              {custom === undefined ? (
                <TableGlyph id={item.counterId} size={COUNTER_GLYPH} color={colors.textDim} />
              ) : null}
              <Text
                text={`${counter} · ${relativeTime(item.at, openedAt)}`}
                size="xxs"
                numberOfLines={1}
                style={[$shrink, { color: colors.textDim }]}
              />
            </View>
          </View>
        </View>
      )
    }
    const seat = seats.get(item.playerId)
    const source = item.fromPlayerId ? seats.get(item.fromPlayerId) : undefined
    const name = (sharedLife ? teamName(players, groups, item.playerId) : seat?.name) ?? ""
    const head = sharedLife && !source ? seat : undefined
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
            ) : head ? (
              <Text
                text={`${translate("board:log.by", { name: head.name })} ·`}
                size="xxs"
                numberOfLines={1}
                style={[$shrink, { color: colors.textDim }]}
              />
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
          keyExtractor={(item) =>
            item.kind === "turn"
              ? `turn:${item.operationId}`
              : item.kind === "counter"
                ? `counter:${item.id}`
                : item.id
          }
          renderItem={renderRow}
          onEndReached={onMore}
          style={themed($sheetScroll)}
          contentContainerStyle={themed($sheetScrollContent)}
        />
      )}
      <View style={themed($dialogActions)}>
        <Button
          testID="game-log-undo"
          tx="common:undo"
          accessibilityLabel={undoLabel}
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
const COUNTER_GLYPH = 12
const TURN_MARK = 14
const $turnRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  minHeight: 28,
})
const $rule: ViewStyle = { flex: 1, height: 1 }
const SOURCE_MARK = 18
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
