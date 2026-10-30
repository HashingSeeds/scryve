import type { ReactNode } from "react"
import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native"
import { TouchableOpacity, View } from "react-native"

import { Button } from "@/components/Button"
import { FilterChips } from "@/components/FilterChips"
import { PlayerMark } from "@/components/PlayerMark"
import { Text } from "@/components/Text"
import { TextAction } from "@/components/TextAction"
import type { RemoteValue } from "@/features/async/remoteState"
import { CloudGlyph } from "@/features/decks/CloudGlyph"
import { cardCountLabel } from "@/features/decks/deckCopy"
import { DeviceGlyph } from "@/features/decks/DeviceGlyph"
import { NO_PLAY_SYSTEM } from "@/features/game/playSystems"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { shownMarkShape } from "../../../convex/lib/appearance"
import { DEFAULT_DECK_GAME } from "../../../convex/lib/deckGames"

export type LobbySeat = {
  open?: boolean
  playerId?: string
  seat: number
  displayName: string
  color: string
  shape?: string
  proShape?: string
  foil?: boolean
  deckVersionId?: string
  controlledByMe: boolean
  away?: boolean
}

export type SeatDeck = {
  game?: string
  format?: string
  _id: string
  deckKey?: string
  name: string
  cardQuantity?: number
  versions: { _id: string; versionNumber: number; name?: string }[]
}

export type LobbyDeckState = RemoteValue<SeatDeck[]> | { status: "error"; retry: () => void }

export type LobbyDeviceDeck = {
  localId: string
  deckKey: string
  game?: string
  format?: string
  name: string
  cardQuantity: number
  syncBlockedReason?: string
  error?: string
}

export type LobbyDeviceDecks = {
  decks: readonly LobbyDeviceDeck[]
  syncingLocalId?: string
  onSyncAndUse: (seat: number, localId: string) => void
}

const NO_DECK_ID = "no-deck"

const cardsLabel = (quantity?: number) =>
  quantity === undefined
    ? undefined
    : quantity > 0
      ? cardCountLabel(quantity)
      : translate("decks:shelf.emptyList")

function DeckOption({
  testID,
  name,
  detail,
  glyph,
  accessibilityLabel,
  selected = false,
  disabled = false,
  dimmed = false,
  action,
  onPress,
}: {
  testID: string
  name: string
  detail?: string
  glyph?: ReactNode
  accessibilityLabel?: string
  selected?: boolean
  disabled?: boolean
  dimmed?: boolean
  action?: ReactNode
  onPress?: () => void
}) {
  const { themed } = useAppTheme()
  const radio = (
    <View style={themed([$radio, selected && $radioOn])}>
      {selected ? <View style={themed($radioDot)} /> : null}
    </View>
  )
  const copy = (accessible: boolean) => (
    <View
      accessible={accessible}
      accessibilityLabel={accessible ? [accessibilityLabel ?? name, detail].join(", ") : undefined}
      style={$optionCopy}
    >
      <View style={$optionName}>
        <Text size="sm" weight="medium" numberOfLines={1} style={$shrink} text={name} />
        {glyph}
      </View>
      {detail ? <Text size="xxs" tone="dim" numberOfLines={2} text={detail} /> : null}
    </View>
  )
  if (!onPress)
    return (
      <View testID={testID} style={[themed($option), dimmed && $dimmed]}>
        {radio}
        {copy(true)}
        {action}
      </View>
    )
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel ?? name}
      accessibilityState={{ checked: selected, disabled }}
      aria-checked={selected}
      disabled={disabled}
      activeOpacity={0.75}
      style={[themed($option), disabled && $dimmed]}
      onPress={onPress}
    >
      {radio}
      {copy(false)}
    </TouchableOpacity>
  )
}

export function LobbySeatList({
  seats,
  openSeats,
  totalSeats,
  deckState,
  deviceDecks,
  versionLabel,
  selectingDeckSeats,
  deckRequired,
  system,
  format,
  onSelectVersion,
  onReport,
  onEditAppearance,
  onManageDecks,
}: {
  seats: LobbySeat[]
  openSeats: number
  totalSeats?: number
  deckState?: LobbyDeckState
  deviceDecks?: LobbyDeviceDecks
  versionLabel: (
    version: { versionNumber: number; name?: string },
    latestVersionNumber: number,
  ) => string
  selectingDeckSeats?: ReadonlySet<number>
  deckRequired?: boolean
  system?: string
  format?: string
  onSelectVersion?: (seat: number, deckVersionId?: string) => void
  onReport?: (seat: LobbySeat) => void
  onManageDecks?: () => void
  onEditAppearance?: (seat: LobbySeat, event?: GestureResponderEvent) => void
}) {
  const { themed, theme } = useAppTheme()
  const rows: LobbySeat[] = totalSeats
    ? Array.from({ length: totalSeats }, (_, index) => {
        const seat = index + 1
        return (
          seats.find((candidate) => candidate.seat === seat) ?? {
            seat,
            open: true,
            displayName: translate("connected:seats.openSeat"),
            color: "",
            controlledByMe: false,
          }
        )
      })
    : [
        ...seats,
        ...Array.from({ length: openSeats }, (_, index) => ({
          seat: seats.length + index + 1,
          open: true,
          displayName: translate("connected:seats.openSeat"),
          color: "",
          controlledByMe: false,
        })),
      ]
  return (
    <View style={themed($list)}>
      {rows.map((seat) => {
        if (seat.open)
          return (
            <View key={`open-${seat.seat}`} testID="lobby-open-seat" style={themed($openSeat)}>
              <View style={themed($openMark)} />
              <Text size="xs" style={themed($seatPending)} tx="connected:seats.openSeat" />
              <Text size="xxs" style={themed($seatPending)} tx="connected:seats.waiting" />
            </View>
          )
        const decks = deckState?.status === "ready" ? deckState.value : undefined
        const fitsLobby = (deck: { game?: string; format?: string }) =>
          (!system || (deck.game ?? DEFAULT_DECK_GAME) === system) &&
          (!format || deck.format === format)
        const usableDecks =
          decks?.filter((deck) => deck.versions.length > 0 && fitsLobby(deck)) ?? []
        // why: a device deck whose sync already landed is listed once, as the account deck.
        const syncedKeys = new Set(decks?.map((deck) => deck.deckKey))
        const usableDeviceDecks = decks
          ? (deviceDecks?.decks.filter(
              (deck) => fitsLobby(deck) && !syncedKeys.has(deck.deckKey),
            ) ?? [])
          : []
        const noDecks = usableDecks.length === 0 && usableDeviceDecks.length === 0
        const chosenDeck = usableDecks.find((deck) =>
          deck.versions.some((version) => version._id === seat.deckVersionId),
        )
        const chosenVersion = chosenDeck?.versions.find(
          (version) => version._id === seat.deckVersionId,
        )
        const latestVersionNumber = Math.max(
          ...(chosenDeck?.versions.map((version) => version.versionNumber) ?? []),
        )
        const deckReady = Boolean(seat.deckVersionId)
        const ready = !seat.away && (!deckRequired || deckReady)
        const selectingDeck = selectingDeckSeats?.has(seat.seat) ?? false
        const showManageDecks = Boolean(
          seat.controlledByMe && onManageDecks && system !== NO_PLAY_SYSTEM,
        )
        const offerNewDeck = deckState?.status === "ready" && noDecks && showManageDecks
        return (
          <View key={seat.playerId ?? `seat-${seat.seat}`} style={themed($seat)}>
            <View style={themed($seatRow)}>
              {seat.controlledByMe && onEditAppearance ? (
                <TouchableOpacity
                  testID={`edit-appearance-seat-${seat.seat}`}
                  accessibilityRole="button"
                  accessibilityLabel={translate("connected:seats.changeAppearance")}
                  activeOpacity={0.75}
                  style={themed($markButton)}
                  onPress={(event) => onEditAppearance(seat, event)}
                >
                  <PlayerMark
                    seatNumber={seat.seat}
                    shape={shownMarkShape(seat)}
                    foil={seat.foil}
                    foilBackdrop={theme.colors.background}
                    color={seat.color}
                    size={32}
                  />
                </TouchableOpacity>
              ) : (
                <PlayerMark
                  seatNumber={seat.seat}
                  shape={shownMarkShape(seat)}
                  foil={seat.foil}
                  foilBackdrop={theme.colors.background}
                  color={seat.color}
                  size={32}
                />
              )}
              <View style={themed($seatCopy)}>
                <Text weight="medium" numberOfLines={1} text={seat.displayName} />
                {seat.controlledByMe || deckReady ? (
                  <Text
                    size="xxs"
                    numberOfLines={2}
                    style={themed(deckReady ? $seatDetail : $seatPending)}
                    text={
                      [
                        seat.controlledByMe ? translate("connected:seats.you") : undefined,
                        chosenDeck?.name,
                        chosenVersion
                          ? versionLabel(chosenVersion, latestVersionNumber)
                          : undefined,
                      ]
                        .filter(Boolean)
                        .join(" · ") ||
                      translate(
                        deckReady ? "connected:seats.deckSelected" : "connected:seats.noDeck",
                      )
                    }
                  />
                ) : null}
                <Text
                  testID={`seat-${seat.seat}-readiness`}
                  size="xxs"
                  weight="medium"
                  style={themed(ready ? $seatReady : $seatPending)}
                  tx={
                    ready
                      ? "connected:seats.ready"
                      : seat.away
                        ? "connected:nearby.away"
                        : seat.controlledByMe
                          ? "connected:seats.chooseDeck"
                          : "connected:seats.needsDeck"
                  }
                />
              </View>
              {showManageDecks && !offerNewDeck ? (
                <Button
                  testID={`manage-seat-${seat.seat}-decks`}
                  tx="connected:seats.manageDecks"
                  style={themed($rowAction)}
                  textStyle={themed($rowActionText)}
                  onPress={onManageDecks}
                />
              ) : null}
              {onReport && !seat.controlledByMe && seat.playerId ? (
                <Button
                  testID={`lobby-report-player-seat-${seat.seat}`}
                  accessibilityLabel={translate("connected:playerActions.reportPlayer", {
                    name: seat.displayName,
                  })}
                  text="•••"
                  style={themed($report)}
                  textStyle={themed($reportText)}
                  onPress={() => onReport(seat)}
                />
              ) : null}
            </View>
            {deckState && onSelectVersion && seat.controlledByMe ? (
              <View style={themed($deckChoices)}>
                {system === NO_PLAY_SYSTEM ? (
                  <Text size="xxs" style={themed($seatPending)} tx="connected:seats.decksNotUsed" />
                ) : deckState.status === "loading" ? (
                  <View
                    testID={`seat-${seat.seat}-deck-loading`}
                    accessibilityRole="progressbar"
                    accessibilityLabel={translate("connected:seats.loadingDecksLabel")}
                    style={themed($deckLoading)}
                  >
                    <Text
                      size="xxs"
                      style={themed($seatPending)}
                      tx="connected:seats.loadingDecks"
                    />
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
                      tx={
                        deckRequired
                          ? "connected:seats.decksUnavailableRequired"
                          : "connected:seats.decksUnavailableOptional"
                      }
                    />
                    <Button
                      testID={`retry-seat-${seat.seat}-decks`}
                      tx="common:tryAgain"
                      style={themed($deckRetry)}
                      textStyle={themed($deckRetryText)}
                      onPress={deckState.retry}
                    />
                  </View>
                ) : noDecks ? (
                  <View testID={`seat-${seat.seat}-no-decks`} style={themed($deckMessage)}>
                    {offerNewDeck ? (
                      <TextAction
                        testID={`manage-seat-${seat.seat}-decks`}
                        tx="connected:seats.newDeck"
                        onPress={onManageDecks}
                      />
                    ) : (
                      <Text
                        size="xxs"
                        tone="dim"
                        tx={
                          deckRequired
                            ? "connected:seats.addDeckToJoin"
                            : "connected:seats.noDecksYet"
                        }
                      />
                    )}
                  </View>
                ) : (
                  <View
                    testID={`seat-${seat.seat}-deck`}
                    accessibilityRole="radiogroup"
                    accessibilityLabel={translate("connected:seats.deck")}
                  >
                    {deckRequired ? null : (
                      <DeckOption
                        testID={`seat-${seat.seat}-deck-${NO_DECK_ID}`}
                        name={translate("connected:seats.noDeck")}
                        selected={!chosenDeck}
                        disabled={selectingDeck}
                        onPress={() => onSelectVersion(seat.seat)}
                      />
                    )}
                    {usableDecks.length > 0 ? (
                      <Text
                        size="xxs"
                        weight="medium"
                        tone="dim"
                        style={themed($section)}
                        tx="connected:seats.account"
                      />
                    ) : null}
                    {usableDecks.map((deck) => (
                      <DeckOption
                        key={deck._id}
                        testID={`seat-${seat.seat}-deck-${deck._id}`}
                        name={deck.name}
                        detail={cardsLabel(deck.cardQuantity)}
                        glyph={<CloudGlyph />}
                        accessibilityLabel={translate("connected:seats.accountDeckLabel", {
                          name: deck.name,
                        })}
                        selected={chosenDeck?._id === deck._id}
                        disabled={selectingDeck}
                        onPress={() => {
                          const version = deck.versions[deck.versions.length - 1]
                          if (version) onSelectVersion(seat.seat, version._id)
                        }}
                      />
                    ))}
                    {chosenDeck && chosenDeck.versions.length > 1 ? (
                      <FilterChips
                        testID={`seat-${seat.seat}-version`}
                        accessibilityLabel={translate("connected:seats.deckVersion")}
                        chips={chosenDeck.versions.map((version) => ({
                          id: version._id,
                          label: versionLabel(version, latestVersionNumber),
                          disabled: selectingDeck,
                        }))}
                        selectedId={seat.deckVersionId ?? ""}
                        onSelect={(versionId) => onSelectVersion(seat.seat, versionId)}
                      />
                    ) : null}
                    {usableDeviceDecks.length > 0 ? (
                      <Text
                        size="xxs"
                        weight="medium"
                        tone="dim"
                        style={themed($section)}
                        tx="connected:seats.onDevice"
                      />
                    ) : null}
                    {usableDeviceDecks.map((deck) => {
                      const syncing = deviceDecks?.syncingLocalId === deck.localId
                      const empty = deck.cardQuantity === 0
                      return (
                        <DeckOption
                          key={deck.localId}
                          testID={`seat-${seat.seat}-device-deck-${deck.localId}`}
                          name={deck.name}
                          detail={
                            deck.syncBlockedReason ?? deck.error ?? cardsLabel(deck.cardQuantity)
                          }
                          glyph={<DeviceGlyph />}
                          accessibilityLabel={translate("decks:stats.onDeviceLabel", {
                            name: deck.name,
                          })}
                          dimmed={empty}
                          action={
                            empty ? undefined : (
                              <TextAction
                                testID={`seat-${seat.seat}-sync-and-use-${deck.localId}`}
                                tx={
                                  syncing ? "connected:seats.syncing" : "connected:seats.syncAndUse"
                                }
                                accessibilityLabel={translate("connected:seats.syncAndUseLabel", {
                                  name: deck.name,
                                })}
                                disabled={
                                  Boolean(deck.syncBlockedReason) ||
                                  deviceDecks?.syncingLocalId !== undefined ||
                                  selectingDeck
                                }
                                onPress={() => deviceDecks?.onSyncAndUse(seat.seat, deck.localId)}
                              />
                            )
                          }
                        />
                      )
                    })}
                  </View>
                )}
                {!deckRequired && seat.deckVersionId && noDecks ? (
                  <Button
                    tx="connected:seats.noDeck"
                    disabled={selectingDeck}
                    onPress={() => onSelectVersion(seat.seat)}
                  />
                ) : null}
                {selectingDeck ? (
                  <Text
                    testID={`seat-${seat.seat}-deck-selection-status`}
                    accessibilityRole="text"
                    accessibilityLiveRegion="polite"
                    size="xxs"
                    style={themed($seatPending)}
                    tx="connected:seats.selectingDeck"
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

const $list: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $section: ThemedStyle<TextStyle> = ({ spacing }) => ({
  paddingTop: spacing.xs,
  textTransform: "uppercase",
  letterSpacing: 0.8,
})
const $option: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 48,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})
const $radio: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: 20,
  height: 20,
  borderRadius: radius.full,
  borderWidth: 1.6,
  borderColor: colors.border,
  alignItems: "center",
  justifyContent: "center",
})
const $radioOn: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderColor: colors.tint })
const $radioDot: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: 10,
  height: 10,
  borderRadius: radius.full,
  backgroundColor: colors.tint,
})
const $optionCopy: ViewStyle = { flex: 1, minWidth: 0 }
const $optionName: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 6 }
const $shrink: TextStyle = { flexShrink: 1 }
const $dimmed: ViewStyle = { opacity: 0.5 }
const $deckChoices: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 72,
  gap: spacing.xxs,
  justifyContent: "center",
})
const $seat: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xs,
  paddingVertical: spacing.xs,
  borderBottomWidth: 1,
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
const $seatReady: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.success })
const $report: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 40,
  minWidth: 44,
  paddingHorizontal: spacing.xs,
})
const $reportText: ThemedStyle<TextStyle> = () => ({ fontSize: 14 })
const $rowAction: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  paddingVertical: spacing.xxs,
  paddingHorizontal: spacing.sm,
})
const $rowActionText: ThemedStyle<TextStyle> = () => ({ fontSize: 14, lineHeight: 18 })
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
  paddingVertical: spacing.xs,
  borderBottomWidth: 1,
  borderTopWidth: 0,
  borderLeftWidth: 0,
  borderRightWidth: 0,
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
