import type { ComponentProps, ReactNode } from "react"
import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native"
import { ScrollView, TouchableOpacity, View } from "react-native"

import { Button } from "@/components/Button"
import { DialogCard } from "@/components/DialogCard"
import { OptionGrid } from "@/components/OptionGrid"
import { PlayerLayoutPicker } from "@/components/PlayerLayoutPicker"
import { PlayerMark } from "@/components/PlayerMark"
import { SegmentedControl } from "@/components/SegmentedControl"
import { SelectField } from "@/components/SelectField"
import { Sheet } from "@/components/Sheet"
import { $sheetScroll, $sheetScrollContent } from "@/components/sheetStyles"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { ValueField } from "@/components/ValueField"
import type { NextPageState } from "@/features/async/remoteState"
import type { ResumableGame } from "@/features/connected/connectedCopy"
import { ConnectedGameRow } from "@/features/connected/ConnectedGameRow"
import { DeviceGlyph } from "@/features/decks/DeviceGlyph"
import { MAX_PLAYER_NAME_LENGTH } from "@/features/game/domain"
import { FirstPlayerChoice, FreeMulligansChoice } from "@/features/game/FirstPlayerChoice"
import { GameTabs } from "@/features/game/GameTabs"
import { gameTypeDetail, type GameTab, type GameType } from "@/features/game/gameTypes"
import {
  CLOCK_MODES,
  VARIANT_MIN_SEATS,
  type GameDraft,
  type GameDraftPatch,
  type GameSetupView,
} from "@/features/game/newGameDraft"
import { counterHeading } from "@/features/game/playSystems"
import { ROUND_CLOCK_MINUTES } from "@/features/game/roundClock"
import { TurnsChoice } from "@/features/game/TurnsChoice"
import { ModeSetupFields, type ModeChoices } from "@/features/modes/ModeSetupFields"
import { deckChoiceId, type DeckChoice, type SelectedDeck } from "@/features/stats/deckChoices"
import { formatList, formatNumber, joinParts } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { MATCH_BEST_OF } from "../../convex/lib/matchResults"
import { nameFailsGate } from "../../convex/lib/nameFilter"
import { startingValueRange } from "../../convex/lib/systems"
import { ARCHENEMY_MIN_SEATS } from "../../convex/lib/tableModes"
import { isTeamPlayerCount } from "../../convex/lib/teamVariants"
import { isTreacheryPlayerCount } from "../../convex/lib/treachery"

const PLAYER_COUNTS = [2, 3, 4, 5, 6]
const MORE_PLAYER_COUNTS = [7, 8, 9, 10]
const LIFE_STEP_OPTIONS = [1, 5, 10, 50, 100, 500, 1000] as const

type MulligansChoice = ComponentProps<typeof FreeMulligansChoice>

export function defaultName(index: number) {
  return translate("board:playerNames.default", { number: index + 1 })
}

export function GameSetupFields({
  draft: { system, playerCount, startingLife, modeChoices },
  setup: {
    typeId,
    treachery,
    archenemy,
    teamPlay,
    twoHeadedGiant,
    lifeOptions,
    planechaseAvailable,
  },
  tabs,
  connected,
  lockedSummary,
  optionsSummary,
  seatNames,
  mulligans,
  onChooseType,
  onPlayerCount,
  onStartingLife,
  onModeChoices,
  onOpenOptions,
}: {
  draft: GameDraft
  setup: GameSetupView
  tabs: readonly GameTab[]
  connected: boolean
  lockedSummary?: string
  optionsSummary: string
  seatNames: readonly string[]
  mulligans?: MulligansChoice
  onChooseType: (type: GameType) => void
  onPlayerCount: (count: number) => void
  onStartingLife: (life: number) => void
  onModeChoices: (choices: ModeChoices) => void
  onOpenOptions: () => void
}) {
  const { themed } = useAppTheme()
  return (
    <>
      <GameTabs
        tabs={tabs}
        selectedId={typeId}
        detail={(type) =>
          gameTypeDetail(
            type,
            type.variant ? Math.max(playerCount, VARIANT_MIN_SEATS) : playerCount,
          )
        }
        onChoose={onChooseType}
      />

      {lockedSummary !== undefined ? (
        <Text size="xs" text={lockedSummary} style={themed($summaryText)} />
      ) : (
        <>
          <OptionGrid
            testID="player-count"
            label={connected ? translate("play:newGame.seats") : translate("play:newGame.players")}
            options={PLAYER_COUNTS}
            more={treachery ? undefined : MORE_PLAYER_COUNTS}
            value={playerCount}
            isDisabled={
              treachery
                ? (count) => !isTreacheryPlayerCount(count)
                : archenemy
                  ? (count) => count < ARCHENEMY_MIN_SEATS
                  : teamPlay
                    ? (count) => !isTeamPlayerCount(teamPlay, count)
                    : undefined
            }
            onSelect={onPlayerCount}
          />
          {lifeOptions.length > 0 ? (
            <OptionGrid
              testID="starting-counter"
              label={twoHeadedGiant ? translate("play:newGame.teamLife") : counterHeading(system)}
              options={lifeOptions}
              value={startingLife}
              custom={startingValueRange(system)}
              onSelect={onStartingLife}
            />
          ) : null}
          <TurnsChoice />
          <FirstPlayerChoice system={system} playerCount={playerCount} />
          {mulligans ? <FreeMulligansChoice {...mulligans} /> : null}
          {planechaseAvailable ? (
            <ModeSetupFields
              choices={modeChoices}
              archenemy={archenemy}
              seatNames={seatNames}
              onChange={onModeChoices}
            />
          ) : null}
          <View style={themed($summaryRow)}>
            <Text size="xs" text={optionsSummary} style={themed($summaryText)} />
            <Button
              testID="setup-change-button"
              tx="play:newGame.moreOptions"
              accessibilityLabel={formatList([
                translate("play:newGame.moreOptions"),
                optionsSummary,
              ])}
              style={themed($changeButton)}
              onPress={onOpenOptions}
            />
          </View>
        </>
      )}
    </>
  )
}

export function PlayerNames({
  players,
  names,
  errors,
  onOpenAppearance,
  onRename,
  onNameBlur,
  children,
}: {
  players: readonly {
    name: string
    color: string
    shape: ComponentProps<typeof PlayerMark>["shape"]
  }[]
  names: readonly string[]
  errors: readonly (string | undefined)[]
  onOpenAppearance: (seat: number, event: GestureResponderEvent) => void
  onRename: (seat: number, name: string) => void
  onNameBlur: () => void
  children: ReactNode
}) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($section)}>
      <Text tx="play:playerNames" preset="subheading" accessibilityRole="header" />
      <View style={themed($nameList)}>
        {players.map((player, index) => (
          <View key={index} style={themed($nameRow)}>
            <TouchableOpacity
              testID={`player-appearance-${index + 1}`}
              accessibilityRole="button"
              accessibilityLabel={translate("play:newGame.changeAppearance", { name: player.name })}
              activeOpacity={0.75}
              style={themed($appearanceButton)}
              onPress={(event) => onOpenAppearance(index, event)}
            >
              <PlayerMark
                seatNumber={index + 1}
                shape={player.shape}
                color={player.color}
                size={32}
              />
            </TouchableOpacity>
            <TextField
              testID={`player-name-${index + 1}`}
              value={names[index]}
              placeholder={defaultName(index)}
              accessibilityLabel={translate("play:newGame.nameForPlayer", { seat: index + 1 })}
              maxLength={MAX_PLAYER_NAME_LENGTH}
              status={errors[index] ? "error" : undefined}
              helper={
                errors[index] ??
                (nameFailsGate(names[index])
                  ? translate("play:newGame.nameGateHelper", { name: defaultName(index) })
                  : undefined)
              }
              containerStyle={themed($nameField)}
              onBlur={onNameBlur}
              onChangeText={(value) => onRename(index, value)}
            />
          </View>
        ))}
      </View>
      {children}
    </View>
  )
}

export function AccountSeat({
  seatNames,
  meSeat,
  disabled,
  onSeat,
  deckPicker,
  mulligans,
}: {
  seatNames: readonly string[]
  meSeat: number | undefined
  disabled: boolean
  onSeat: (seat: string | undefined) => void
  deckPicker?: {
    deck: SelectedDeck | undefined
    choices: readonly DeckChoice[]
    decks: readonly DeckChoice[] | "unavailable" | undefined
    disabled: boolean
    onChoose: (id: string | undefined) => void
  }
  mulligans?: MulligansChoice
}) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($accountSeat)}>
      <SelectField
        testID="me-seat"
        label={translate("play:newGame.thisIsMe")}
        field="thisIsMe"
        value={meSeat === undefined ? undefined : String(meSeat)}
        placeholder={translate("play:newGame.noSeat")}
        clearLabel={translate("play:newGame.noSeat")}
        disabled={disabled}
        options={seatNames.map((name, index) => ({ id: String(index), label: name }))}
        onSelect={onSeat}
      />
      {deckPicker ? <DeckPicker {...deckPicker} /> : null}
      {mulligans ? <FreeMulligansChoice {...mulligans} /> : null}
    </View>
  )
}

function DeckPicker({
  deck,
  choices,
  decks,
  disabled,
  onChoose,
}: NonNullable<ComponentProps<typeof AccountSeat>["deckPicker"]>) {
  return (
    <SelectField
      testID="me-deck"
      label={translate("play:newGame.yourDeck")}
      field="yourDeck"
      value={deck ? deckChoiceId(deck) : undefined}
      placeholder={
        choices.length === 0 && decks === "unavailable"
          ? translate("play:newGame.decksUnavailable")
          : choices.length === 0 && decks === undefined
            ? translate("play:newGame.loadingDecks")
            : choices.length === 0
              ? translate("play:newGame.noMatchingDecks")
              : translate("play:newGame.noDeck")
      }
      clearLabel={translate("play:newGame.noDeck")}
      disabled={disabled}
      options={[
        ...(deck && !choices.some((choice) => deckChoiceId(choice) === deckChoiceId(deck))
          ? [
              {
                id: deckChoiceId(deck)!,
                label: deck.name,
                accessory: deck.localId ? <DeviceGlyph /> : undefined,
                accessibilityLabel: deck.localId
                  ? translate("decks:stats.onDeviceLabel", { name: deck.name })
                  : undefined,
              },
            ]
          : []),
        ...choices.map((choice) => ({
          id: deckChoiceId(choice)!,
          label: joinParts([
            choice.name,
            choice.versionLabel,
            choice.sharedToken ? translate("decks:shared.tag") : undefined,
          ]),
          accessory: choice.localId ? <DeviceGlyph /> : undefined,
          accessibilityLabel: choice.localId
            ? translate("decks:stats.onDeviceLabel", { name: choice.name })
            : undefined,
        })),
      ]}
      onSelect={onChoose}
    />
  )
}

export function SetupOptionsSheet({
  visible,
  onClose,
  onDismissed,
  draft,
  setup,
  onChange: set,
  onToggleMatch,
  matchOffered,
  clockOffered,
}: {
  visible: boolean
  onClose: () => void
  onDismissed: () => void
  draft: GameDraft
  setup: GameSetupView
  onChange: (patch: GameDraftPatch) => void
  onToggleMatch: (on: boolean) => void
  matchOffered: boolean
  clockOffered: boolean
}) {
  const { themed } = useAppTheme()
  const { matchBestOf } = setup
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onDismissed={onDismissed}
      testID="setup-options-dialog"
    >
      <ScrollView
        style={themed($sheetScroll)}
        contentContainerStyle={themed([$sheetScrollContent, $sheetSections])}
      >
        {matchOffered ? (
          <View style={themed($section)}>
            <Text tx="play:newGame.match" preset="subheading" accessibilityRole="header" />
            <SegmentedControl
              testID="match-mode"
              accessibilityLabel={translate("play:newGame.match")}
              segments={[
                { id: "off", label: translate("play:newGame.singleGame") },
                { id: "on", label: translate("play:newGame.bestOf") },
              ]}
              selectedId={matchBestOf ? "on" : "off"}
              onSelect={(value) => onToggleMatch(value === "on")}
            />
            {matchBestOf ? (
              <SegmentedControl
                testID="match-best-of"
                accessibilityLabel={translate("play:newGame.bestOf")}
                segments={MATCH_BEST_OF.map((bestOf) => ({
                  id: String(bestOf),
                  label: translate("play:newGame.bestOfCount", { bestOf }),
                }))}
                selectedId={String(matchBestOf)}
                onSelect={(value) =>
                  set({ chosenBestOf: MATCH_BEST_OF.find((bestOf) => String(bestOf) === value) })
                }
              />
            ) : null}
          </View>
        ) : null}

        {clockOffered ? (
          <View style={themed($section)}>
            <Text tx="play:newGame.clock" preset="subheading" accessibilityRole="header" />
            <SegmentedControl
              testID="clock-mode"
              accessibilityLabel={translate("play:newGame.clock")}
              segments={CLOCK_MODES.map(({ id, labelTx }) => ({ id, label: translate(labelTx) }))}
              selectedId={draft.clockMode}
              onSelect={(value) => {
                const mode = CLOCK_MODES.find(({ id }) => id === value)?.id
                if (mode) set({ clockMode: mode })
              }}
            />
            {draft.clockMode === "countdown" ? (
              <ValueField
                testID="clock-minutes"
                label={translate("play:newGame.minutesLeft")}
                value={setup.clockMinutes}
                min={ROUND_CLOCK_MINUTES.min}
                max={ROUND_CLOCK_MINUTES.max}
                longStep={ROUND_CLOCK_MINUTES.step}
                onChange={(chosenClockMinutes) => set({ chosenClockMinutes })}
              />
            ) : null}
          </View>
        ) : null}

        <View style={themed($section)}>
          <SelectField
            testID="life-step"
            label={translate("play:newGame.changeBy")}
            field="changeBy"
            value={String(draft.lifeStep)}
            options={LIFE_STEP_OPTIONS.map((step) => ({
              id: String(step),
              label: formatNumber(step),
            }))}
            onSelect={(value) => {
              const next = LIFE_STEP_OPTIONS.find((step) => String(step) === value)
              if (next) set({ lifeStep: next })
            }}
          />
        </View>

        <View style={themed($section)}>
          <Text tx="play:newGame.layout" preset="subheading" accessibilityRole="header" />
          <PlayerLayoutPicker
            playerCount={draft.playerCount}
            value={setup.layout}
            onChange={(chosenLayout) => set({ chosenLayout })}
          />
        </View>
      </ScrollView>
      <Button testID="setup-options-done" tx="common:done" preset="primary" onPress={onClose} />
    </Sheet>
  )
}

export function SetupStatusDialog({
  visible,
  onClose,
  connectedMode,
  connected,
  busy,
  onResumeConnected,
  onExit,
}: {
  visible: boolean
  onClose: () => void
  connectedMode: boolean
  connected:
    | {
        ready: boolean
        access?: object
        blockedReason?: string
        error?: string
        exitError?: string
        retry?: () => void
        activeGames?: readonly ResumableGame[]
        activeGamesNextPage?: NextPageState
      }
    | undefined
  busy: boolean
  onResumeConnected?: (game: ResumableGame) => void
  onExit: (game: ResumableGame) => void
}) {
  const { themed } = useAppTheme()
  const connectedGames = connected?.activeGames ?? []
  return (
    <DialogCard
      visible={visible}
      onClose={onClose}
      dialogTestID="setup-status-dialog"
      accessibilityViewIsModal
    >
      <ScrollView
        style={themed($sheetScroll)}
        contentContainerStyle={themed([$sheetScrollContent, $sheetSections])}
      >
        {connectedMode && connected?.blockedReason ? (
          <Text accessibilityRole="alert" size="xs" text={connected.blockedReason} tone="dim" />
        ) : null}
        {connectedMode && connected?.error ? (
          <View style={themed($connectedError)}>
            <Text
              accessibilityRole="alert"
              size="xs"
              text={connected.error}
              style={themed($errorNote)}
            />
            {connected.retry ? (
              <Button
                testID="retry-connected-host-preparation"
                tx="common:tryAgain"
                style={themed($retryConnected)}
                onPress={connected.retry}
              />
            ) : null}
          </View>
        ) : null}
        {connectedMode &&
        connected &&
        !connected.ready &&
        !connected.error &&
        connected.retry &&
        connected.blockedReason &&
        !connected.access ? (
          <Button tx="play:newGame.retryConnection" onPress={connected.retry} />
        ) : null}

        {connectedGames.length ? (
          <View style={themed($section)}>
            <Text
              tx="play:newGame.yourConnectedGames"
              preset="subheading"
              accessibilityRole="header"
            />
            {connectedGames.map((game) => (
              <View key={game.publicId} style={themed($connectedGame)}>
                <ConnectedGameRow
                  game={game}
                  now={Date.now()}
                  onPress={() => onResumeConnected?.(game)}
                />
                <TouchableOpacity
                  testID={`${game.isHost ? "end" : "leave"}-connected-${game.publicId}`}
                  accessibilityRole="button"
                  disabled={busy || !connected?.ready}
                  accessibilityState={{ disabled: busy || !connected?.ready }}
                  style={themed($exitAction)}
                  onPress={() => onExit(game)}
                >
                  <Text
                    tx={
                      game.isHost
                        ? "play:newGame.endGameEllipsis"
                        : "play:newGame.leaveGameEllipsis"
                    }
                    tone="dim"
                  />
                </TouchableOpacity>
              </View>
            ))}
            {connected?.exitError ? (
              <Text
                accessibilityRole="alert"
                style={themed($errorNote)}
                text={connected.exitError}
              />
            ) : null}
            {connected?.activeGamesNextPage?.status === "available" ? (
              <Button tx="play:newGame.loadMore" onPress={connected.activeGamesNextPage.load} />
            ) : connected?.activeGamesNextPage?.status === "loading" ? (
              <Text size="xs" tone="dim" tx="play:newGame.loadingMoreGames" />
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      <Button tx="common:done" onPress={onClose} />
    </DialogCard>
  )
}

const MIN_NAME_ROW_WIDTH = 280

const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $errorNote: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
const $sheetSections: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
const $summaryRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})
const $summaryText: ThemedStyle<TextStyle> = ({ colors }) => ({
  flex: 1,
  color: colors.textDim,
})
const $changeButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 40,
  paddingVertical: spacing.xxs,
})
const $nameList: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  columnGap: spacing.md,
  rowGap: spacing.sm,
})
const $nameRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: MIN_NAME_ROW_WIDTH,
})
const $nameField: ThemedStyle<ViewStyle> = () => ({ flex: 1 })
const $appearanceButton: ThemedStyle<ViewStyle> = () => ({
  width: 44,
  height: 44,
  alignItems: "center",
  justifyContent: "center",
})
const $accountSeat: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  marginTop: spacing.xs,
})
const $connectedError: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $connectedGame: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $retryConnected: ThemedStyle<ViewStyle> = () => ({ minHeight: 40 })
const $exitAction: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  justifyContent: "center",
  alignItems: "center",
  paddingVertical: spacing.xs,
})
