import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"

import { AlertNote } from "@/components/AlertNote"
import { BottomActionBar } from "@/components/BottomActionBar"
import { Button, PlusAccessory } from "@/components/Button"
import { Header, HeaderBack } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { SelectField } from "@/components/SelectField"
import { Text } from "@/components/Text"
import { TextAction } from "@/components/TextAction"
import { TextField } from "@/components/TextField"
import { useGuestDecks } from "@/features/decks/guestDeck"
import type { DeckChoices } from "@/features/decks/LocalDeckChoicesSource"
import { loadSharedDecks } from "@/features/decks/sharedDecks"
import { MAX_PLAYER_NAME_LENGTH, MAX_PLAYERS, MIN_PLAYERS } from "@/features/game/domain"
import { buildLoggedGame, type LoggedGameDraft } from "@/features/game/loggedGame"
import {
  isPlaySystemId,
  NO_PLAY_SYSTEM,
  playFormatOptions,
  playSystemFormat,
} from "@/features/game/playSystems"
import { playSystemChoices } from "@/features/game/systemVisibility"
import type { LocalGame } from "@/features/game/types"
import {
  deckChoiceId,
  localDeckChoices,
  pinDeckChoice,
  sharedDeckChoices,
  type SelectedDeck,
} from "@/features/stats/deckChoices"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { AccountSeat, defaultName } from "./NewGameSections"
import { attachesDecks } from "../../convex/lib/systems"

const DRAW = "draw"
const ISO_DATE_PLACEHOLDER = "YYYY-MM-DD"

type LogGameScreenProps = {
  initialDraft: LoggedGameDraft
  account?: { ownerId: string; decks: DeckChoices }
  onBack: () => void
  onSave: (game: LocalGame) => void
}

export function LogGameScreen({ initialDraft, account, onBack, onSave }: LogGameScreenProps) {
  const { themed, theme } = useAppTheme()
  const [draft, setDraft] = useState(initialDraft)
  const [meSeat, setMeSeat] = useState<number | undefined>(0)
  const [deck, setDeck] = useState<SelectedDeck>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const guestDecks = useGuestDecks()
  const [sharedDecks] = useState(loadSharedDecks)
  const seatNames = draft.names.map((name, seat) => name.trim() || defaultName(seat))
  const decks = account?.decks
  const deckChoices = [
    ...(decks === undefined || decks === "unavailable" ? [] : decks),
    ...localDeckChoices(guestDecks),
    ...sharedDeckChoices(sharedDecks),
  ].filter((choice) => choice.system === draft.system && choice.format === draft.format)
  const showsDecks = account && meSeat !== undefined && attachesDecks(draft.system)

  function chooseSystem(id: string | undefined) {
    const system = isPlaySystemId(id) ? id : undefined
    setDraft({ ...draft, system, format: system ? playSystemFormat(system) : undefined })
    setDeck(undefined)
  }

  function rename(seat: number, name: string) {
    setDraft({
      ...draft,
      names: draft.names.map((current, index) => (index === seat ? name : current)),
    })
  }

  function removeSeat(seat: number) {
    const shift = (index: number | undefined) =>
      index === undefined || index < seat ? index : index === seat ? undefined : index - 1
    setDraft({
      ...draft,
      names: draft.names.filter((_, index) => index !== seat),
      winnerSeat: draft.winnerSeat === DRAW ? DRAW : shift(draft.winnerSeat),
    })
    setMeSeat(shift(meSeat))
  }

  async function save() {
    setError(undefined)
    setBusy(true)
    try {
      const pinned = account && showsDecks && deck ? await pinDeckChoice(deck, account.ownerId) : {}
      const built = buildLoggedGame(
        { ...draft, names: seatNames },
        account ? { ownerId: account.ownerId, meSeat, ...pinned } : undefined,
      )
      if (!built.ok) {
        setError(built.error)
        setBusy(false)
        return
      }
      onSave(built.game)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate("play:recordMatch.saveFailed"))
      setBusy(false)
    }
  }

  return (
    <Screen
      preset="fixed"
      safeAreaEdges={["bottom"]}
      backgroundColor={theme.colors.surface}
      contentContainerStyle={$screen}
    >
      <Header
        titleTx="play:logGame.title"
        backgroundColor={theme.colors.surface}
        LeftActionComponent={<HeaderBack testID="header-back" onPress={onBack} />}
      />
      <ScrollView
        contentContainerStyle={themed($content)}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={themed($row)}>
          <View style={$flex}>
            <SelectField
              testID="log-system"
              label={translate("decks:shelf.system")}
              field="system"
              options={playSystemChoices()}
              value={draft.system ?? NO_PLAY_SYSTEM}
              disabled={busy}
              onSelect={chooseSystem}
            />
          </View>
          {draft.system ? (
            <View style={$flex}>
              <SelectField
                testID="log-format"
                label={translate("decks:shelf.format")}
                field="format"
                options={playFormatOptions(draft.system)}
                value={draft.format}
                disabled={busy}
                onSelect={(format) => {
                  setDraft({ ...draft, format: format ?? playSystemFormat(draft.system) })
                  setDeck(undefined)
                }}
              />
            </View>
          ) : null}
        </View>
        <View style={themed($field)}>
          <Text preset="formLabel" size="xs" tx="play:newGame.players" />
          {draft.names.map((name, seat) => (
            <View key={seat} style={themed($row)}>
              <TextField
                testID={`log-player-name-${seat + 1}`}
                value={name}
                placeholder={defaultName(seat)}
                accessibilityLabel={translate("play:newGame.nameForPlayer", { seat: seat + 1 })}
                maxLength={MAX_PLAYER_NAME_LENGTH}
                editable={!busy}
                containerStyle={$flex}
                onChangeText={(value) => rename(seat, value)}
              />
              {draft.names.length > MIN_PLAYERS ? (
                <TextAction
                  testID={`log-remove-player-${seat + 1}`}
                  tx="common:remove"
                  disabled={busy}
                  onPress={() => removeSeat(seat)}
                />
              ) : null}
            </View>
          ))}
          {draft.names.length < MAX_PLAYERS ? (
            <Button
              testID="log-add-player"
              tx="play:logGame.addPlayer"
              LeftAccessory={PlusAccessory}
              disabled={busy}
              onPress={() => setDraft({ ...draft, names: [...draft.names, ""] })}
            />
          ) : null}
        </View>
        {account ? (
          <AccountSeat
            seatNames={seatNames}
            meSeat={meSeat}
            disabled={busy}
            onSeat={(seat) => {
              setMeSeat(seat === undefined ? undefined : Number(seat))
              if (seat === undefined) setDeck(undefined)
            }}
            deckPicker={
              showsDecks
                ? {
                    deck,
                    choices: deckChoices,
                    decks,
                    disabled: busy,
                    onChoose: (id) =>
                      setDeck(deckChoices.find((choice) => deckChoiceId(choice) === id)),
                  }
                : undefined
            }
          />
        ) : null}
        <SelectField
          testID="log-winner"
          label={translate("play:summary.outcome.win")}
          field="winner"
          options={[
            ...seatNames.map((label, seat) => ({ id: String(seat), label })),
            { id: DRAW, label: translate("play:history.outcome.draw") },
          ]}
          value={draft.winnerSeat === undefined ? undefined : String(draft.winnerSeat)}
          disabled={busy}
          onSelect={(id) =>
            setDraft({
              ...draft,
              winnerSeat: id === DRAW ? DRAW : id === undefined ? undefined : Number(id),
            })
          }
        />
        <View style={themed($row)}>
          <TextField
            testID="log-date"
            style={$shrinkInput}
            labelTx="play:recordMatch.date"
            value={draft.date}
            placeholder={ISO_DATE_PLACEHOLDER}
            maxLength={10}
            editable={!busy}
            containerStyle={$flex}
            onChangeText={(date) => setDraft({ ...draft, date })}
          />
          <TextField
            testID="log-minutes"
            style={$shrinkInput}
            labelTx="play:logGame.minutes"
            optional
            value={draft.minutes}
            keyboardType="number-pad"
            maxLength={4}
            editable={!busy}
            containerStyle={$flex}
            onChangeText={(minutes) => setDraft({ ...draft, minutes })}
          />
        </View>
      </ScrollView>
      <BottomActionBar>
        {error ? <AlertNote text={error} /> : null}
        <Button
          testID="log-save"
          tx="play:logGame.save"
          preset="primary"
          disabled={busy}
          onPress={save}
        />
      </BottomActionBar>
    </Screen>
  )
}

const $screen: ViewStyle = { flex: 1 }
const $flex: ViewStyle = { flex: 1 }
const $shrinkInput: TextStyle = { minWidth: 0 }
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
  paddingHorizontal: spacing.md,
  paddingTop: spacing.sm,
  paddingBottom: spacing.lg,
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
})
const $field: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
  alignItems: "flex-end",
})
