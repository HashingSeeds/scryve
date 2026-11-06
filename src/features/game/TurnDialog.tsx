import { useCallback, useState } from "react"
import type { ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"

import { Button } from "@/components/Button"
import { ChoiceButton } from "@/components/ChoiceButton"
import { $dialogActions, $dialogButton, DialogCard } from "@/components/DialogCard"
import { PlayerMark } from "@/components/PlayerMark"
import { Text } from "@/components/Text"
import type { TurnTabSeat } from "@/components/TurnTabs"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { captureAnalytics } from "@/utils/analytics"

import type { LocalGameRepository } from "./localPersistence"
import {
  CHESS_BANK_MINUTES,
  TURN_CLOCK_STYLES,
  TURN_PASS_STYLES,
  TURN_STYLES,
  turnsPassed,
  type TurnTabPrefs,
} from "./turnTab"
import type { Turn } from "../../../convex/lib/turns"

export interface TurnDialogProps {
  turn: Turn | undefined
  seats: readonly TurnTabSeat[]
  pick?: { canPick: (playerId: string) => boolean; onPick: (playerId: string) => void }
  onUndo?: () => void
  prefs: TurnTabPrefs
  onPrefs: (prefs: Partial<TurnTabPrefs>) => void
  onBank?: (bankMs: number | undefined) => void
  onRoundClock?: () => void
  onClose: () => void
}

export function TurnDialog({
  turn,
  seats,
  pick,
  onUndo,
  prefs,
  onPrefs,
  onBank,
  onRoundClock,
  onClose,
}: TurnDialogProps) {
  const { themed } = useAppTheme()
  return (
    <DialogCard
      visible
      onClose={onClose}
      backdropTestID="turn-dialog-backdrop"
      backdropAccessibilityLabel={translate("common:close")}
      dialogTestID="turn-dialog"
      accessibilityViewIsModal
      wide
    >
      <ScrollView style={$scroll} contentContainerStyle={themed($content)}>
        <Text
          preset="subheading"
          text={
            turn
              ? translate("board:turn.title", { number: turn.number })
              : translate("board:turn.noTurnTitle")
          }
        />
        {pick ? (
          <View style={themed($section)}>
            <Text
              size="xs"
              weight="medium"
              tx={turn ? "board:turn.whoseTurn" : "board:turn.whoFirstHeading"}
            />
            {seats.map((seat) => (
              <ChoiceButton
                key={seat.playerId}
                compact
                testID={`turn-pick-${seat.seatNumber}`}
                text={seat.name}
                selected={turn?.playerId === seat.playerId}
                disabled={!pick.canPick(seat.playerId)}
                accentColor={seat.color}
                Leading={() => (
                  <PlayerMark
                    seatNumber={seat.seatNumber}
                    shape={seat.shape}
                    color={seat.color}
                    size={22}
                  />
                )}
                onPress={() => pick.onPick(seat.playerId)}
              />
            ))}
          </View>
        ) : (
          <Text size="xs" tone="dim" tx="board:turn.eventPlay" />
        )}
        {onUndo ? <Button testID="turn-undo" tx="board:turn.undoPass" onPress={onUndo} /> : null}
        <Choices
          tx="board:turn.turnStyle"
          options={TURN_STYLES.map((style) => ({
            id: style,
            label: translate(`board:turn.turnStyles.${style}`),
          }))}
          selected={prefs.style}
          onSelect={(style) => onPrefs({ style })}
        />
        <Choices
          tx="board:turn.clockStyle"
          options={TURN_CLOCK_STYLES.map((style) => ({
            id: style,
            label: translate(`board:turn.clockStyles.${style}`),
          }))}
          selected={prefs.clock}
          onSelect={(clock) => onPrefs({ clock })}
        />
        {prefs.clock === "chess" && onBank ? (
          <Choices
            tx="board:turn.chessBank"
            options={[
              { id: 0, label: translate("board:turn.chessOff") },
              ...CHESS_BANK_MINUTES.map((minutes) => ({
                id: minutes,
                label: translate("board:turn.chessMinutes", { minutes }),
              })),
            ]}
            selected={turn?.bank ? turn.bank.ms / 60_000 : 0}
            onSelect={(minutes) => onBank(minutes === 0 ? undefined : minutes * 60_000)}
          />
        ) : null}
        <Choices
          tx="board:turn.passStyle"
          options={TURN_PASS_STYLES.map((style) => ({
            id: style,
            label: translate(`board:turn.passStyles.${style}`),
          }))}
          selected={prefs.pass}
          onSelect={(pass) => onPrefs({ pass })}
        />
      </ScrollView>
      <View style={themed($dialogActions)}>
        {onRoundClock ? (
          <Button
            testID="turn-round-clock"
            tx="board:turn.roundClock"
            style={themed($dialogButton)}
            onPress={onRoundClock}
          />
        ) : null}
        <Button tx="common:done" style={themed($dialogButton)} onPress={onClose} />
      </View>
    </DialogCard>
  )
}

function Choices<Id extends string | number>({
  tx,
  options,
  selected,
  onSelect,
}: {
  tx:
    | "board:turn.clockStyle"
    | "board:turn.chessBank"
    | "board:turn.passStyle"
    | "board:turn.turnStyle"
  options: readonly { id: Id; label: string }[]
  selected: Id
  onSelect: (id: Id) => void
}) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($section)}>
      <Text size="xs" weight="medium" tx={tx} />
      <View style={themed($choices)}>
        {options.map((option) => (
          <ChoiceButton
            key={option.id}
            compact
            testID={`turn-choice-${option.id}`}
            text={option.label}
            selected={option.id === selected}
            style={$choice}
            onPress={() => onSelect(option.id)}
          />
        ))}
      </View>
    </View>
  )
}

const $scroll: ViewStyle = { flexGrow: 0, flexShrink: 1 }
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $choices: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})
const $choice: ViewStyle = { flexGrow: 1 }

export function useTurnTabPrefs(repository: LocalGameRepository) {
  const [prefs, setPrefs] = useState(() => repository.turnTabPrefs())
  const update = useCallback(
    (changes: Partial<TurnTabPrefs>) => setPrefs(repository.saveTurnTabPrefs(changes)),
    [repository],
  )
  return [prefs, update] as const
}

/** why: the game-end analytics event waits for the hide offer's answer, so one event carries it. */
export function reportTurnTabGame(input: {
  prefs: Pick<TurnTabPrefs, "enabled">
  turn: Pick<Turn, "number"> | undefined
  playerCount: number
  mode: "local" | "connected"
  hideOffer: "none" | "shown" | "accepted"
}) {
  captureAnalytics("turn_tab_game_ended", {
    tab_enabled: input.prefs.enabled,
    pass_count: turnsPassed(input.turn),
    player_count: input.playerCount,
    mode: input.mode,
    hide_offer: input.hideOffer,
  })
}

export function HideTurnTabDialog({ onAnswer }: { onAnswer: (hide: boolean) => void }) {
  const { themed } = useAppTheme()
  return (
    <DialogCard
      visible
      onClose={() => onAnswer(false)}
      backdropTestID="hide-turn-tab-backdrop"
      backdropAccessibilityLabel={translate("board:turn.hideOffer.keep")}
      dialogTestID="hide-turn-tab-dialog"
      dialogAccessibilityRole="alert"
    >
      <Text preset="subheading" tx="board:turn.hideOffer.title" />
      <Text tx="board:turn.hideOffer.body" />
      <View style={themed($dialogActions)}>
        <Button
          testID="hide-turn-tab-keep"
          tx="board:turn.hideOffer.keep"
          style={themed($dialogButton)}
          onPress={() => onAnswer(false)}
        />
        <Button
          testID="hide-turn-tab-hide"
          tx="board:turn.hideOffer.hide"
          preset="primary"
          style={themed($dialogButton)}
          onPress={() => onAnswer(true)}
        />
      </View>
    </DialogCard>
  )
}
