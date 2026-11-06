import { useCallback, useState } from "react"
import type { ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"

import { Button } from "@/components/Button"
import { ChoiceButton } from "@/components/ChoiceButton"
import { $dialogActions, $dialogButton, DialogCard } from "@/components/DialogCard"
import { PlayerMark } from "@/components/PlayerMark"
import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { captureAnalytics } from "@/utils/analytics"

import type { LocalGameRepository } from "./localPersistence"
import { CHESS_BANK_MINUTES, turnsPassed, type TurnPrefs } from "./turnTab"
import type { PlayerMarkShape } from "../../../convex/lib/appearance"
import type { Turn } from "../../../convex/lib/turns"

export interface TurnSeat {
  playerId: string
  seatNumber: number
  name: string
  color: string
  shape?: PlayerMarkShape
}

export interface TurnDialogProps {
  turn: Turn | undefined
  seats: readonly TurnSeat[]
  pick?: { canPick: (playerId: string) => boolean; onPick: (playerId: string) => void }
  onUndo?: () => void
  onBank?: (bankMs: number | undefined) => void
  onRoundClock?: () => void
  onClose: () => void
}

export function TurnDialog({
  turn,
  seats,
  pick,
  onUndo,
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
        {onBank ? (
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
  tx: "board:turn.chessBank"
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

export function useTurnPrefs(repository: LocalGameRepository) {
  const [prefs, setPrefs] = useState(() => repository.turnPrefs())
  const update = useCallback(
    (changes: Partial<TurnPrefs>) => setPrefs(repository.saveTurnPrefs(changes)),
    [repository],
  )
  return [prefs, update] as const
}

/** why: the game-end analytics event waits for the hide offer's answer, so one event carries it. */
export function reportTurnsGame(input: {
  prefs: Pick<TurnPrefs, "enabled">
  turn: Pick<Turn, "number"> | undefined
  playerCount: number
  mode: "local" | "connected"
  hideOffer: "none" | "shown" | "accepted"
}) {
  captureAnalytics("turns_game_ended", {
    turns_enabled: input.prefs.enabled,
    pass_count: turnsPassed(input.turn),
    player_count: input.playerCount,
    mode: input.mode,
    hide_offer: input.hideOffer,
  })
}

export function HideTurnsDialog({ onAnswer }: { onAnswer: (hide: boolean) => void }) {
  const { themed } = useAppTheme()
  return (
    <DialogCard
      visible
      onClose={() => onAnswer(false)}
      backdropTestID="hide-turns-backdrop"
      backdropAccessibilityLabel={translate("board:turn.hideOffer.keep")}
      dialogTestID="hide-turns-dialog"
      dialogAccessibilityRole="alert"
    >
      <Text preset="subheading" tx="board:turn.hideOffer.title" />
      <Text tx="board:turn.hideOffer.body" />
      <View style={themed($dialogActions)}>
        <Button
          testID="hide-turns-keep"
          tx="board:turn.hideOffer.keep"
          style={themed($dialogButton)}
          onPress={() => onAnswer(false)}
        />
        <Button
          testID="hide-turns-hide"
          tx="board:turn.hideOffer.hide"
          preset="primary"
          style={themed($dialogButton)}
          onPress={() => onAnswer(true)}
        />
      </View>
    </DialogCard>
  )
}
