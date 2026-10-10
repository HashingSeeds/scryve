import { useEffect, useRef, useState } from "react"
import type { TextStyle, View as ViewRef, ViewStyle } from "react-native"
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native"

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
import { usePokemonCatalog, type PokemonSearchHit } from "./usePokemonCatalog"
import {
  pokemonPrizeValue,
  remainingHp,
  type PokemonCard,
  type PokemonInPlay,
  type PokemonSlot,
} from "../../../convex/lib/table"
import { BoardPressable } from "../BoardPressable"
import { mixColorsInLinearLight } from "../GameMenuButtonShape"
import { overlayTint } from "../LifeControls"
import type { LifeCardContentInsets, LifeCardContentRotation } from "../playerCardTypes"
import { Text } from "../Text"
import { TextField } from "../TextField"

export type PokemonSheetMode =
  { kind: "place"; slot: PokemonSlot } | { kind: "edit"; pokemon: PokemonInPlay; slot: PokemonSlot }

export interface PokemonSheetProps {
  seatNumber: number
  color: string
  rotation: LifeCardContentRotation
  cardWidth: number
  cardHeight: number
  /** why: already mapped into content space by the seat card. */
  insets: LifeCardContentInsets
  /** why: the game menu button overlaps the inner edge; the header keeps clear of it the same way the bench does. */
  clearance: BenchClearance
  compact?: boolean
  damageStep: number
  mode: PokemonSheetMode
  /** why: returns false when the board refused the placement, so the sheet stays open with the draft. */
  onPlace: (card: PokemonCard) => boolean
  onUpdate: (pokemonId: string, card: PokemonCard) => void
  onDamage: (pokemonId: string, delta: number) => void
  onMakeActive: (pokemonId: string) => void
  onKnockOut: (pokemonId: string) => void
  onRemove: (pokemonId: string) => void
  onClose: () => void
}

const PRIZE_CHOICES = [1, 2, 3] as const
const MAX_RESULTS = 12
const DAMAGE_STEPS = [-3, -1, 1, 3, 5, 10] as const

/** why: the same Pokémon has many printings with different HP, so the set and number tell them apart. */
function hitDetail(hit: PokemonSearchHit): string | undefined {
  if (hit.setCode) return `${hit.setCode.toUpperCase()} ${hit.collectorNumber ?? ""}`.trim()
  if (hit.collectorNumber) return `#${hit.collectorNumber}`
  return hit.typeLabel
}

/**
 * why: one overlay places a new Pokémon or edits one in play. Both start from the card catalog so HP and prize value come from the printed card, and both accept typed values when the catalog is out of reach.
 */
export function PokemonSheet({
  seatNumber,
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
  // why: a lookup that resolves after the sheet was dismissed must not place anything. Set on mount as well, since Strict Mode and Fast Refresh run the cleanup and then mount again.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const firstControl = useRef<ViewRef>(null)
  useEffect(() => moveFocus(firstControl.current), [])
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

  function setName(name: string) {
    // why: a typed name drops the catalog link and guesses the prize value until the player sets it.
    setDraft((current) => ({
      ...current,
      name,
      cardId: undefined,
      prizes: current.prizesChosen ? current.prizes : pokemonPrizeValue(name),
    }))
  }

  async function pickHit(hit: PokemonSearchHit) {
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
      if (mounted.current) setPickError("Could not load that card. Type its HP instead.")
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
    if (editing && changed && card) onUpdate(editing.id, card)
    onClose()
  }

  const hits = catalog.hits
  const showSearch = lookupOpen && catalog.available
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

      {showSearch ? (
        <TextField
          testID={`pokemon-search-seat-${seatNumber}`}
          accessibilityLabel="Search the card catalog"
          placeholder="Search cards"
          value={query}
          autoFocus={mode.kind === "place"}
          autoCorrect={false}
          maxLength={120}
          returnKeyType="search"
          onChangeText={setQuery}
          inputWrapperStyle={themed($fieldWrapper)}
        />
      ) : null}

      <ScrollView
        testID={`pokemon-sheet-body-seat-${seatNumber}`}
        keyboardShouldPersistTaps="handled"
        style={$body}
        contentContainerStyle={themed(compact ? $compactBodyContent : $bodyContent)}
      >
        {showSearch && catalog.searching ? (
          <View testID={`pokemon-results-seat-${seatNumber}`} style={themed($resultsContent)}>
            {catalog.busy ? <ActivityIndicator color={ink} /> : null}
            {catalog.error ? <Text text={catalog.error} size="xxs" style={inkStyle} /> : null}
            {hits && hits.length === 0 ? (
              <Text text="No cards found" size="xxs" style={[inkStyle, $dim]} />
            ) : null}
            {hits?.slice(0, MAX_RESULTS).map((hit) => {
              const detail = hitDetail(hit)
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
            autoCorrect={false}
            maxLength={100}
            onChangeText={setName}
            containerStyle={$grow}
            inputWrapperStyle={themed($fieldWrapper)}
          />
          <TextField
            testID={`pokemon-hp-input-seat-${seatNumber}`}
            accessibilityLabel="HP"
            placeholder="HP"
            value={draft.hp}
            inputMode="numeric"
            keyboardType="number-pad"
            maxLength={3}
            onChangeText={(hp) => setDraft((current) => ({ ...current, hp }))}
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
        {!catalog.available ? (
          <Text text="Catalog offline. Type the name and HP." size="xxs" style={[inkStyle, $dim]} />
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
  )
}

const $grow: ViewStyle = { flex: 1, minWidth: 0 }
const $body: ViewStyle = { flex: 1 }
const $dim: TextStyle = { opacity: 0.75 }
const $pressed: ViewStyle = { opacity: 0.7 }
const $disabled: ViewStyle = { opacity: 0.4 }
const $hpField: ViewStyle = { width: 84 }
// why: an input keeps its intrinsic width inside the row unless told it may shrink, which hid the typed HP.
const $hpInput: TextStyle = { textAlign: "center", minWidth: 0 }

const $sheet: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs, zIndex: 20 })
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
