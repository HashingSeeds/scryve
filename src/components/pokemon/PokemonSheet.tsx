import { useContext, useEffect, useRef, useState, type ComponentRef } from "react"
import type { TextStyle, View as ViewRef, ViewStyle } from "react-native"
import {
  AccessibilityInfo,
  ActivityIndicator,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"

import {
  moveFocus,
  parseHp,
  pokemonName,
  rotatedLayerStyle,
  type BenchClearance,
} from "./pokemonCardLayout"
import { catalogRows, hitDetail, pokemonPrintingLabel } from "./pokemonCatalogHits"
import { PokemonKeypad } from "./PokemonKeypad"
import { usePokemonCatalog, type PokemonSearchHit } from "./usePokemonCatalog"
import { usePokemonDeck, type SeatDeck } from "./usePokemonDeck"
import {
  pokemonPrizeValue,
  remainingHp,
  type PokemonCard,
  type PokemonInPlay,
  type PokemonSlot,
} from "../../../convex/lib/table"
import { useBoardKeyboardLift } from "../BoardKeyboardLift"
import { BoardPressable, TurnedBoardContext } from "../BoardPressable"
import { mixColorsInLinearLight } from "../GameMenuButtonShape"
import { overlayTint } from "../LifeControls"
import type { LifeCardContentInsets, LifeCardContentRotation } from "../playerCardTypes"
import { Text } from "../Text"
import { TextField } from "../TextField"

export type PokemonSheetMode =
  { kind: "place"; slot: PokemonSlot } | { kind: "edit"; pokemon: PokemonInPlay; slot: PokemonSlot }

export interface PokemonSheetProps {
  seatNumber: number
  /** why: only a seat on the screen's bottom edge sits under the keyboard, so only its sheet lifts the board. */
  liftsBoard?: boolean
  deck?: SeatDeck
  color: string
  rotation: LifeCardContentRotation
  cardWidth: number
  cardHeight: number
  insets: LifeCardContentInsets
  clearance: BenchClearance
  compact?: boolean
  damageStep: number
  mode: PokemonSheetMode
  onPlace: (card: PokemonCard) => boolean
  onUpdate: (pokemonId: string, card: PokemonCard) => boolean
  onDamage: (pokemonId: string, delta: number) => void
  onMakeActive: (pokemonId: string) => void
  onKnockOut: (pokemonId: string) => void
  onRemove: (pokemonId: string) => void
  onClose: () => void
}

const PRIZE_CHOICES = [1, 2, 3] as const
const KEYPAD_BESIDE_RATIO = 1.6
const FIELD_LENGTH = { query: 120, name: 100, hp: 3 } as const
type Field = keyof typeof FIELD_LENGTH
const MAX_RESULTS = 12
const DAMAGE_STEPS = [-3, -1, 1, 3, 5, 10] as const

export function PokemonSheet({
  seatNumber,
  liftsBoard = false,
  deck: seatDeck,
  color,
  rotation,
  cardWidth,
  cardHeight,
  insets,
  clearance,
  compact,
  damageStep,
  mode,
  onPlace,
  onUpdate,
  onDamage,
  onMakeActive,
  onKnockOut,
  onRemove,
  onClose,
}: PokemonSheetProps) {
  const { themed } = useAppTheme()
  const liftSeat = useBoardKeyboardLift(liftsBoard)
  // why: the system keyboard rises from the window's bottom edge, so it only reads right side up for a seat facing that edge. Web keeps the browser's keyboard.
  const turned = useContext(TurnedBoardContext)
  const onKeypad = Platform.OS !== "web" && (rotation !== 0 || turned)
  const [typingInto, setTypingInto] = useState<Field>()
  const sheetColor = mixColorsInLinearLight(color, "#000000", 0.82)
  const ink = accessibleForeground(sheetColor)
  const inkStyle = { color: ink }
  const onInk = { color: sheetColor }
  const button = { backgroundColor: overlayTint(ink, 0.14) }
  const editing = mode.kind === "edit" ? mode.pokemon : undefined
  const [draft, setDraft] = useState(() => ({
    cardId: editing?.cardId,
    name: editing?.name ?? "",
    hp: editing ? String(editing.hp) : "",
    prizes: editing?.prizes ?? 1,
    prizesChosen: Boolean(editing),
  }))
  const [query, setQuery] = useState("")
  const [lookupOpen, setLookupOpen] = useState(mode.kind === "place")
  const [picking, setPicking] = useState<string>()
  const [pickError, setPickError] = useState<string>()
  const [editError, setEditError] = useState<string>()
  // why: a lookup that resolves after the sheet was dismissed must not place anything. Set on mount as well, since Strict Mode and Fast Refresh run the cleanup and then mount again.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const firstControl = useRef<ViewRef>(null)
  const searchField = useRef<ComponentRef<typeof TextField>>(null)
  useEffect(() => moveFocus(searchField.current ?? firstControl.current), [])
  const catalog = usePokemonCatalog(lookupOpen ? query : "")
  const hp = parseHp(draft.hp)
  const card: PokemonCard | undefined = hp
    ? {
        hp,
        prizes: draft.prizes,
        ...(draft.cardId ? { cardId: draft.cardId } : {}),
        ...(draft.name.trim() ? { name: draft.name.trim() } : {}),
      }
    : undefined
  const changed =
    !!editing &&
    (editing.cardId !== card?.cardId ||
      (editing.name ?? "") !== (card?.name ?? "") ||
      editing.hp !== card?.hp ||
      editing.prizes !== card?.prizes)
  const title =
    mode.kind === "place"
      ? mode.slot === "active"
        ? "Place Active"
        : "Add to bench"
      : mode.slot === "active"
        ? "Active"
        : "Bench"

  // why: keypad taps can land before the next render, so edits build on the latest draft, not this render's.
  function setName(name: string | ((current: string) => string)) {
    setDraft((current) => {
      const next = typeof name === "string" ? name : name(current.name)
      return {
        ...current,
        name: next,
        cardId: undefined,
        prizes: current.prizesChosen ? current.prizes : pokemonPrizeValue(next),
      }
    })
  }

  function setHp(hp: string | ((current: string) => string)) {
    setEditError(undefined)
    setDraft((current) => ({ ...current, hp: typeof hp === "string" ? hp : hp(current.hp) }))
  }

  function focusField(field: Field) {
    if (onKeypad) setTypingInto(field)
    else liftSeat()
  }

  function fieldValue(field: Field) {
    return { query, name: draft.name, hp: draft.hp }[field]
  }

  // why: keypad edits land at the end, so the caret stays there instead of suggesting a spot mid-text.
  function caretAtEnd(value: string) {
    return onKeypad ? { start: value.length, end: value.length } : undefined
  }

  function editField(change: (value: string) => string) {
    const field = keypadField
    if (!field) return
    const edit = (value: string) => change(value).slice(0, FIELD_LENGTH[field])
    if (field === "query") setQuery(edit)
    else if (field === "name") setName(edit)
    else setHp(edit)
  }

  async function pickHit(hit: Pick<PokemonSearchHit, "cardId" | "name">) {
    setPicking(hit.cardId)
    setPickError(undefined)
    try {
      const picked = await catalog.pick(hit)
      if (!mounted.current) return
      const name = picked.name ?? hit.name
      if (mode.kind === "place" && picked.hp !== undefined) {
        place({ cardId: picked.cardId, name, hp: picked.hp, prizes: picked.prizes })
        return
      }
      setDraft({
        cardId: picked.cardId,
        name,
        hp: picked.hp === undefined ? "" : String(picked.hp),
        prizes: picked.prizes,
        prizesChosen: true,
      })
      setLookupOpen(false)
      setQuery("")
    } catch {
      if (!mounted.current) return
      // why: offline the catalog can't answer, but the row already names the card, so only HP is left to type.
      setDraft((current) => ({
        ...current,
        cardId: hit.cardId,
        name: hit.name,
        prizes: pokemonPrizeValue(hit.name),
        prizesChosen: false,
      }))
      setLookupOpen(false)
      setQuery("")
      setPickError("Could not load that card. Type its HP instead.")
    } finally {
      if (mounted.current) setPicking(undefined)
    }
  }

  function place(next: PokemonCard) {
    if (onPlace(next)) return
    setPickError("Could not place it. Try again.")
    setDraft({
      cardId: next.cardId,
      name: next.name ?? "",
      hp: String(next.hp),
      prizes: next.prizes,
      prizesChosen: true,
    })
    setLookupOpen(false)
  }

  function finish() {
    if (editing && changed && card) {
      if (card.hp <= editing.damage) return refuseEdit("HP must be above the damage on it.")
      if (!onUpdate(editing.id, card)) return refuseEdit("Could not save it. Try again.")
    }
    onClose()
  }

  // why: focus stays on Save, so native speaks the note; web reads it through the alert role.
  function refuseEdit(message: string) {
    setEditError(message)
    if (Platform.OS !== "web") AccessibilityInfo.announceForAccessibility(message)
  }

  const hits = catalog.hits && catalogRows(catalog.hits)
  const deck = usePokemonDeck(seatDeck)
  const showSearch = lookupOpen && catalog.available
  const wanted = query.trim().toLowerCase()
  const deckHits = lookupOpen ? deck.filter(({ name }) => name.toLowerCase().includes(wanted)) : []
  const inDeck = new Set(deckHits.map(({ cardId }) => cardId))
  const results = [
    ...deckHits.map(({ cardId, name, copies }) => ({
      cardId,
      name,
      detail: [pokemonPrintingLabel(cardId), `×${copies}`].filter(Boolean).join(" "),
    })),
    ...(hits ?? [])
      .filter(({ cardId }) => !inDeck.has(cardId))
      .map((hit) => ({ cardId: hit.cardId, name: hit.name, detail: hitDetail(hit) })),
  ]
  // why: a catalog pick closes the search field without a blur, so the keypad follows the field instead.
  const keypadField = typingInto === "query" && !showSearch ? undefined : typingInto
  // why: under the results, the keypad pushes them off a short sideways seat.
  const sideways = Math.abs(rotation) === 90
  const keypadBeside =
    (sideways ? cardHeight : cardWidth) > (sideways ? cardWidth : cardHeight) * KEYPAD_BESIDE_RATIO
  const stepLabel = (step: number) => `${step > 0 ? "+" : "−"}${Math.abs(step * damageStep)}`

  return (
    <View
      testID={`pokemon-sheet-seat-${seatNumber}`}
      accessibilityViewIsModal
      aria-modal
      style={[
        StyleSheet.absoluteFill,
        rotatedLayerStyle(rotation, cardWidth, cardHeight),
        themed(compact ? $compactSheet : $sheet),
        {
          backgroundColor: sheetColor,
          paddingTop: (compact ? 6 : 10) + insets.top + clearance.top,
          paddingBottom: (compact ? 6 : 10) + insets.bottom,
          paddingLeft: (compact ? 8 : 12) + insets.left,
          paddingRight: (compact ? 8 : 12) + insets.right,
        },
      ]}
    >
      <View style={[themed($header), { marginLeft: clearance.left, marginRight: clearance.right }]}>
        <Text text={title} weight="bold" size="xs" style={inkStyle} />
        <BoardPressable
          ref={firstControl}
          testID={`pokemon-sheet-done-seat-${seatNumber}`}
          accessibilityRole="button"
          accessibilityLabel={editing && changed ? "Save and close" : editing ? "Close" : "Cancel"}
          hitSlop={8}
          onPress={finish}
          style={themed($headerAction)}
        >
          <Text
            text={editing && changed ? "Save" : editing ? "Done" : "Cancel"}
            weight="medium"
            size="xs"
            style={inkStyle}
          />
        </BoardPressable>
      </View>

      <View style={[themed(compact ? $compactStack : $stack), keypadBeside && $beside]}>
        <View style={themed(compact ? $compactStack : $stack)}>
          {showSearch ? (
            <TextField
              ref={searchField}
              testID={`pokemon-search-seat-${seatNumber}`}
              accessibilityLabel="Search the card catalog"
              placeholder="Search cards"
              value={query}
              selection={caretAtEnd(query)}
              autoFocus
              autoCorrect={false}
              maxLength={120}
              returnKeyType="search"
              showSoftInputOnFocus={!onKeypad}
              onChangeText={setQuery}
              onFocus={() => focusField("query")}
              onBlur={() => setTypingInto(undefined)}
              inputWrapperStyle={themed($fieldWrapper)}
            />
          ) : null}

          <ScrollView
            testID={`pokemon-sheet-body-seat-${seatNumber}`}
            keyboardShouldPersistTaps="handled"
            style={$body}
            contentContainerStyle={themed(compact ? $compactBodyContent : $bodyContent)}
          >
            {deckHits.length > 0 || (showSearch && catalog.searching) ? (
              <View testID={`pokemon-results-seat-${seatNumber}`} style={themed($resultsContent)}>
                {catalog.busy ? <ActivityIndicator color={ink} /> : null}
                {catalog.error ? <Text text={catalog.error} size="xxs" style={inkStyle} /> : null}
                {hits && results.length === 0 ? (
                  <Text text="No cards found" size="xxs" style={[inkStyle, $dim]} />
                ) : null}
                {results.slice(0, MAX_RESULTS).map(({ detail, ...hit }) => {
                  return (
                    <BoardPressable
                      key={hit.cardId}
                      testID={`pokemon-result-${hit.cardId}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${hit.name}${detail ? `, ${detail}` : ""}`}
                      accessibilityState={{ busy: picking === hit.cardId }}
                      disabled={picking !== undefined}
                      onPress={() => void pickHit(hit)}
                      style={({ pressed }) => [
                        themed($result),
                        button,
                        pressed && $pressed,
                        picking === hit.cardId && $dim,
                      ]}
                    >
                      <Text text={hit.name} size="xs" numberOfLines={1} style={[$grow, inkStyle]} />
                      {detail ? (
                        <Text text={detail} size="xxs" numberOfLines={1} style={[inkStyle, $dim]} />
                      ) : null}
                    </BoardPressable>
                  )
                })}
              </View>
            ) : null}
            {pickError ? <Text text={pickError} size="xxs" style={inkStyle} /> : null}

            <View style={themed($row)}>
              <TextField
                testID={`pokemon-name-input-seat-${seatNumber}`}
                accessibilityLabel="Pokémon name"
                placeholder="Name"
                value={draft.name}
                selection={caretAtEnd(draft.name)}
                autoCorrect={false}
                maxLength={100}
                showSoftInputOnFocus={!onKeypad}
                onChangeText={setName}
                onFocus={() => focusField("name")}
                onBlur={() => setTypingInto(undefined)}
                containerStyle={$grow}
                inputWrapperStyle={themed($fieldWrapper)}
              />
              <TextField
                testID={`pokemon-hp-input-seat-${seatNumber}`}
                accessibilityLabel="HP"
                placeholder="HP"
                value={draft.hp}
                selection={caretAtEnd(draft.hp)}
                // why: React Native lets inputMode decide showSoftInputOnFocus, so "numeric" alone would raise the system pad.
                inputMode={onKeypad ? "none" : "numeric"}
                keyboardType="number-pad"
                maxLength={3}
                showSoftInputOnFocus={!onKeypad}
                onFocus={() => focusField("hp")}
                onBlur={() => setTypingInto(undefined)}
                onChangeText={setHp}
                containerStyle={$hpField}
                inputWrapperStyle={themed($fieldWrapper)}
                style={$hpInput}
              />
              {!showSearch && catalog.available ? (
                <BoardPressable
                  testID={`pokemon-lookup-seat-${seatNumber}`}
                  accessibilityRole="button"
                  accessibilityLabel="Look up in the card catalog"
                  onPress={() => {
                    setQuery(draft.name)
                    setLookupOpen(true)
                  }}
                  style={({ pressed }) => [
                    themed($ghost),
                    { borderColor: overlayTint(ink, 0.35) },
                    pressed && button,
                  ]}
                >
                  <Text text="Look up" size="xxs" weight="medium" style={inkStyle} />
                </BoardPressable>
              ) : null}
            </View>
            {editError ? (
              <Text
                testID={`pokemon-edit-error-seat-${seatNumber}`}
                accessibilityRole="alert"
                text={editError}
                size="xxs"
                style={inkStyle}
              />
            ) : null}
            {!catalog.available ? (
              <Text
                text="Catalog offline. Type the name and HP."
                size="xxs"
                style={[inkStyle, $dim]}
              />
            ) : null}

            <View style={themed($row)}>
              <Text text="Prizes" size="xxs" style={[inkStyle, $dim]} />
              {PRIZE_CHOICES.map((count) => {
                const selected = draft.prizes === count
                return (
                  <BoardPressable
                    key={count}
                    testID={`pokemon-prizes-${count}-seat-${seatNumber}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`Worth ${count} ${count === 1 ? "prize" : "prizes"}`}
                    onPress={() =>
                      setDraft((current) => ({ ...current, prizes: count, prizesChosen: true }))
                    }
                    style={[themed($prizeChoice), button, selected && { backgroundColor: ink }]}
                  >
                    <Text
                      text={String(count)}
                      size="xs"
                      weight="bold"
                      style={selected ? onInk : inkStyle}
                    />
                  </BoardPressable>
                )
              })}
              {mode.kind === "place" ? (
                <BoardPressable
                  testID={`pokemon-place-seat-${seatNumber}`}
                  accessibilityRole="button"
                  accessibilityLabel={title}
                  accessibilityState={{ disabled: !card }}
                  disabled={!card}
                  onPress={() => card && place(card)}
                  style={[themed($primary), $grow, { backgroundColor: ink }, !card && $disabled]}
                >
                  <Text text="Place" size="xs" weight="bold" style={onInk} />
                </BoardPressable>
              ) : null}
            </View>

            {editing ? (
              <>
                <View style={themed($damageReadout)}>
                  <Text
                    testID={`pokemon-sheet-damage-seat-${seatNumber}`}
                    text={String(editing.damage)}
                    accessibilityLiveRegion="polite"
                    accessibilityLabel={`${pokemonName(editing)}, ${editing.damage} damage, ${remainingHp(editing)} HP left`}
                    style={[themed(compact ? $compactBig : $big), inkStyle]}
                  />
                  <Text
                    text={`damage · ${remainingHp(editing)} left`}
                    size="xxs"
                    style={[inkStyle, $dim]}
                  />
                </View>
                <View style={themed($row)}>
                  {DAMAGE_STEPS.map((step) => (
                    <BoardPressable
                      key={step}
                      testID={`pokemon-sheet-step-${step * damageStep}-seat-${seatNumber}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${step > 0 ? "Add" : "Heal"} ${Math.abs(step * damageStep)} damage`}
                      onPress={() => onDamage(editing.id, step * damageStep)}
                      style={({ pressed }) => [themed($step), button, pressed && $pressed]}
                    >
                      <Text
                        text={stepLabel(step)}
                        size={compact ? "xs" : "sm"}
                        weight="bold"
                        style={inkStyle}
                      />
                    </BoardPressable>
                  ))}
                </View>
                <View style={themed($row)}>
                  {mode.slot === "bench" ? (
                    <BoardPressable
                      testID={`pokemon-sheet-active-seat-${seatNumber}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Make ${pokemonName(editing)} Active`}
                      onPress={() => onMakeActive(editing.id)}
                      style={[themed($action), button]}
                    >
                      <Text text="Make Active" size="xxs" weight="medium" style={inkStyle} />
                    </BoardPressable>
                  ) : null}
                  <BoardPressable
                    testID={`pokemon-sheet-ko-seat-${seatNumber}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${pokemonName(editing)} knocked out`}
                    onPress={() => onKnockOut(editing.id)}
                    style={[themed($action), button]}
                  >
                    <Text text="Knocked out" size="xxs" weight="medium" style={inkStyle} />
                  </BoardPressable>
                  <BoardPressable
                    testID={`pokemon-sheet-remove-seat-${seatNumber}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${pokemonName(editing)} from play`}
                    onPress={() => onRemove(editing.id)}
                    style={[themed($action), button]}
                  >
                    <Text text="Remove" size="xxs" weight="medium" style={inkStyle} />
                  </BoardPressable>
                </View>
              </>
            ) : null}
          </ScrollView>
        </View>
        {keypadField ? (
          <View style={keypadBeside ? $keypadBeside : undefined}>
            <PokemonKeypad
              seatNumber={seatNumber}
              ink={ink}
              digitsOnly={keypadField === "hp"}
              capitalize={fieldValue(keypadField) === ""}
              compact={compact}
              onType={(text) => editField((value) => value + text)}
              onDelete={() => editField((value) => value.slice(0, -1))}
              onDone={() => Keyboard.dismiss()}
            />
          </View>
        ) : null}
      </View>
    </View>
  )
}

const $grow: ViewStyle = { flex: 1, minWidth: 0 }
const $body: ViewStyle = { flex: 1 }
const $beside: ViewStyle = { flexDirection: "row" }
const $keypadBeside: ViewStyle = { flex: 2, justifyContent: "flex-end" }
const $dim: TextStyle = { opacity: 0.75 }
const $pressed: ViewStyle = { opacity: 0.7 }
const $disabled: ViewStyle = { opacity: 0.4 }
const $hpField: ViewStyle = { width: 84 }
// why: an input keeps its intrinsic width inside the row unless told it may shrink, which hid the typed HP.
const $hpInput: TextStyle = { textAlign: "center", minWidth: 0 }

const $sheet: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs, zIndex: 20 })
const $stack: ThemedStyle<ViewStyle> = ({ spacing }) => ({ flex: 1, minWidth: 0, gap: spacing.xs })
const $compactStack: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  minWidth: 0,
  gap: spacing.xxs,
})
const $compactSheet: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs, zIndex: 20 })
const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  gap: spacing.xs,
  minHeight: 28,
})
const $headerAction: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.xs,
  paddingVertical: spacing.xxs,
})
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xxs + 2,
})
const $fieldWrapper: ThemedStyle<ViewStyle> = () => ({ borderRadius: 10 })
const $ghost: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 40,
  borderRadius: 10,
  borderWidth: 1.5,
  paddingHorizontal: spacing.xs,
  justifyContent: "center",
})
const $bodyContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $compactBodyContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $resultsContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $result: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  minHeight: 40,
  borderRadius: 10,
  paddingHorizontal: spacing.sm,
})
const $prizeChoice: ThemedStyle<ViewStyle> = () => ({
  width: 36,
  height: 36,
  borderRadius: 10,
  alignItems: "center",
  justifyContent: "center",
})
const $primary: ThemedStyle<ViewStyle> = () => ({
  minHeight: 36,
  borderRadius: 10,
  alignItems: "center",
  justifyContent: "center",
})
const $damageReadout: ThemedStyle<ViewStyle> = () => ({ alignItems: "center" })
const $big: ThemedStyle<TextStyle> = () => ({
  fontSize: 52,
  lineHeight: 56,
  fontWeight: "700",
  fontVariant: ["tabular-nums"],
})
const $compactBig: ThemedStyle<TextStyle> = () => ({
  fontSize: 34,
  lineHeight: 38,
  fontWeight: "700",
  fontVariant: ["tabular-nums"],
})
const $step: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  minHeight: 44,
  borderRadius: 10,
  alignItems: "center",
  justifyContent: "center",
})
const $action: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  minHeight: 40,
  borderRadius: 10,
  alignItems: "center",
  justifyContent: "center",
})
