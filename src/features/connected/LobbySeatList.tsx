import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native"
import { TouchableOpacity, View } from "react-native"

import { Button } from "@/components/Button"
import { FilterChips } from "@/components/FilterChips"
import { PlayerMark } from "@/components/PlayerMark"
import { Text } from "@/components/Text"
import type { RemoteValue } from "@/features/async/remoteState"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { seatDetail } from "./connectedCopy"
import { isPlayerMarkShape } from "../../../convex/lib/appearance"

export type LobbySeat = {
  playerId?: string
  seat: number
  displayName: string
  color: string
  shape?: string
  deckVersionId?: string
  controlledByMe: boolean
}

export type SeatDeck = {
  _id: string
  name: string
  versions: { _id: string; versionNumber: number; name?: string }[]
}

export type LobbyDeckState = RemoteValue<SeatDeck[]> | { status: "error"; retry: () => void }

export function LobbySeatList({
  seats,
  openSeats,
  deckState,
  versionLabel,
  selectingDeckSeats,
  onSelectVersion,
  onReport,
  onEditAppearance,
}: {
  seats: LobbySeat[]
  openSeats: number
  deckState: LobbyDeckState
  versionLabel: (version: { versionNumber: number; name?: string }) => string
  selectingDeckSeats?: ReadonlySet<number>
  onSelectVersion: (seat: number, deckVersionId: string) => void
  onReport: (seat: LobbySeat) => void
  onEditAppearance?: (seat: LobbySeat, event?: GestureResponderEvent) => void
}) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($list)}>
      {seats.map((seat) => {
        const decks = deckState.status === "ready" ? deckState.value : undefined
        const usableDecks = decks?.filter((deck) => deck.versions.length > 0) ?? []
        const chosenDeck = decks?.find((deck) =>
          deck.versions.some((version) => version._id === seat.deckVersionId),
        )
        const chosenVersion = chosenDeck?.versions.find(
          (version) => version._id === seat.deckVersionId,
        )
        const deckReady = Boolean(seat.deckVersionId)
        const selectingDeck = selectingDeckSeats?.has(seat.seat) ?? false
        return (
          <View key={seat.playerId ?? `seat-${seat.seat}`} style={themed($seat)}>
            <View style={themed($seatRow)}>
              {seat.controlledByMe && onEditAppearance ? (
                <TouchableOpacity
                  testID={`edit-appearance-seat-${seat.seat}`}
                  accessibilityRole="button"
                  accessibilityLabel="Change your color and mark"
                  activeOpacity={0.75}
                  style={themed($markButton)}
                  onPress={(event) => onEditAppearance(seat, event)}
                >
                  <PlayerMark
                    seatNumber={seat.seat}
                    shape={isPlayerMarkShape(seat.shape) ? seat.shape : undefined}
                    color={seat.color}
                    size={32}
                  />
                </TouchableOpacity>
              ) : (
                <PlayerMark
                  seatNumber={seat.seat}
                  shape={isPlayerMarkShape(seat.shape) ? seat.shape : undefined}
                  color={seat.color}
                  size={32}
                />
              )}
              <View style={themed($seatCopy)}>
                <Text weight="medium" numberOfLines={1} text={seat.displayName} />
                <Text
                  size="xxs"
                  numberOfLines={2}
                  style={themed(deckReady ? $seatDetail : $seatPending)}
                  text={seatDetail({
                    controlledByMe: seat.controlledByMe,
                    seat: seat.seat,
                    deckName: chosenDeck?.name,
                    versionName: chosenVersion ? versionLabel(chosenVersion) : undefined,
                  })}
                />
              </View>
              {!seat.controlledByMe && seat.playerId ? (
                <Button
                  testID={`lobby-report-player-seat-${seat.seat}`}
                  text="Report"
                  style={themed($report)}
                  textStyle={themed($reportText)}
                  onPress={() => onReport(seat)}
                />
              ) : null}
            </View>
            {seat.controlledByMe ? (
              <View style={themed($deckChoices)}>
                {deckState.status === "loading" ? (
                  <View
                    testID={`seat-${seat.seat}-deck-loading`}
                    accessibilityRole="progressbar"
                    accessibilityLabel="Loading decks"
                    style={themed($deckLoading)}
                  >
                    <Text size="xxs" style={themed($seatPending)} text="Loading decks…" />
                    <View style={themed($deckPlaceholderRow)}>
                      <View style={themed($deckPlaceholderWide)} />
                      <View style={themed($deckPlaceholderNarrow)} />
                    </View>
                  </View>
                ) : deckState.status === "error" ? (
                  <View testID={`seat-${seat.seat}-deck-error`} style={themed($deckMessage)}>
                    <Text
                      accessibilityRole="alert"
                      size="xxs"
                      style={themed($seatPending)}
                      text="Decks unavailable. You can play without one."
                    />
                    <Button
                      testID={`retry-seat-${seat.seat}-decks`}
                      text="Try again"
                      style={themed($deckRetry)}
                      textStyle={themed($deckRetryText)}
                      onPress={deckState.retry}
                    />
                  </View>
                ) : usableDecks.length === 0 ? (
                  <View testID={`seat-${seat.seat}-no-decks`} style={themed($deckMessage)}>
                    <Text
                      size="xxs"
                      style={themed($seatPending)}
                      text="No decks available. You can play without one."
                    />
                  </View>
                ) : (
                  <>
                    <FilterChips
                      testID={`seat-${seat.seat}-deck`}
                      accessibilityLabel="Deck"
                      chips={usableDecks.map((deck) => ({
                        id: deck._id,
                        label: deck.name,
                        disabled: selectingDeck,
                      }))}
                      selectedId={chosenDeck?._id ?? ""}
                      onSelect={(deckId) => {
                        const deck = usableDecks.find((candidate) => candidate._id === deckId)
                        const version = deck?.versions[deck.versions.length - 1]
                        if (version) onSelectVersion(seat.seat, version._id)
                      }}
                    />
                    {chosenDeck && chosenDeck.versions.length > 1 ? (
                      <FilterChips
                        testID={`seat-${seat.seat}-version`}
                        accessibilityLabel="Deck version"
                        chips={chosenDeck.versions.map((version) => ({
                          id: version._id,
                          label: versionLabel(version),
                          disabled: selectingDeck,
                        }))}
                        selectedId={seat.deckVersionId ?? ""}
                        onSelect={(versionId) => onSelectVersion(seat.seat, versionId)}
                      />
                    ) : null}
                  </>
                )}
                {selectingDeck ? (
                  <Text
                    testID={`seat-${seat.seat}-deck-selection-status`}
                    accessibilityRole="text"
                    accessibilityLiveRegion="polite"
                    size="xxs"
                    style={themed($seatPending)}
                    text="Selecting deck…"
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        )
      })}
      {Array.from({ length: openSeats }).map((_, index) => (
        <View key={`open-${index}`} testID="lobby-open-seat" style={themed($openSeat)}>
          <View style={themed($openMark)} />
          <Text size="xs" style={themed($seatPending)} text="Open seat · waiting for a player" />
        </View>
      ))}
    </View>
  )
}

const $list: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $deckChoices: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 72,
  gap: spacing.xxs,
  justifyContent: "center",
})
const $seat: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xs,
  padding: spacing.sm,
  borderRadius: spacing.sm,
  borderWidth: 1,
  borderColor: colors.separator,
})
const $seatRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})
const $seatCopy: ThemedStyle<ViewStyle> = () => ({ flex: 1, gap: 2 })
const $markButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  padding: spacing.xxs,
  borderRadius: spacing.xs,
  borderWidth: 1,
  borderColor: colors.separator,
})
const $seatDetail: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $seatPending: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $report: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 40,
  minWidth: 84,
  paddingHorizontal: spacing.sm,
})
const $reportText: ThemedStyle<TextStyle> = () => ({ fontSize: 14 })
const $deckLoading: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $deckPlaceholderRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})
const $deckPlaceholderWide: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 104,
  height: 40,
  borderRadius: 12,
  backgroundColor: colors.palette.neutral300,
})
const $deckPlaceholderNarrow: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 76,
  height: 40,
  borderRadius: 12,
  backgroundColor: colors.palette.neutral200,
})
const $deckMessage: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 56,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  gap: spacing.sm,
})
const $deckRetry: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 36,
  paddingVertical: spacing.xxs,
  paddingHorizontal: spacing.xs,
})
const $deckRetryText: ThemedStyle<TextStyle> = () => ({ fontSize: 13, lineHeight: 16 })
const $openSeat: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  padding: spacing.sm,
  borderRadius: spacing.sm,
  borderWidth: 1,
  borderStyle: "dashed",
  borderColor: colors.separator,
})
const $openMark: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 32,
  height: 32,
  borderRadius: 16,
  borderWidth: 1,
  borderStyle: "dashed",
  borderColor: colors.separator,
})
