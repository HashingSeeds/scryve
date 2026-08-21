import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native"
import { TouchableOpacity, View } from "react-native"

import { Button } from "@/components/Button"
import { FilterChips } from "@/components/FilterChips"
import { PlayerMark } from "@/components/PlayerMark"
import { Text } from "@/components/Text"
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

export function LobbySeatList({
  seats,
  openSeats,
  decks,
  versionLabel,
  onSelectVersion,
  onReport,
  onEditAppearance,
}: {
  seats: LobbySeat[]
  openSeats: number
  decks?: SeatDeck[]
  versionLabel: (version: { versionNumber: number; name?: string }) => string
  onSelectVersion: (seat: number, deckVersionId: string) => void
  onReport: (seat: LobbySeat) => void
  onEditAppearance?: (seat: LobbySeat, event?: GestureResponderEvent) => void
}) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($list)}>
      {seats.map((seat) => {
        const chosenDeck = decks?.find((deck) =>
          deck.versions.some((version) => version._id === seat.deckVersionId),
        )
        const chosenVersion = chosenDeck?.versions.find(
          (version) => version._id === seat.deckVersionId,
        )
        const deckReady = Boolean(seat.deckVersionId)
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
            {seat.controlledByMe && decks?.length ? (
              <View style={themed($deckChoices)}>
                <FilterChips
                  testID={`seat-${seat.seat}-deck`}
                  accessibilityLabel="Deck"
                  chips={decks
                    .filter((deck) => deck.versions.length > 0)
                    .map((deck) => ({ id: deck._id, label: deck.name }))}
                  selectedId={chosenDeck?._id ?? ""}
                  onSelect={(deckId) => {
                    const deck = decks.find((candidate) => candidate._id === deckId)
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
                    }))}
                    selectedId={seat.deckVersionId ?? ""}
                    onSelect={(versionId) => onSelectVersion(seat.seat, versionId)}
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
const $deckChoices: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
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
