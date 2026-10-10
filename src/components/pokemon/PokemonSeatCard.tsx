import { memo, useEffect, useRef, useState } from "react"
import type { LayoutChangeEvent, StyleProp, TextStyle, ViewStyle } from "react-native"
import { AccessibilityInfo, Platform, StyleSheet, View } from "react-native"

import type { TableKnockout, TableRuntime } from "@/features/game/tableRuntime"
import type { LifeDelta } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { structurallyEqual } from "@/utils/structurallyEqual"
import { useElapsedSince } from "@/utils/useElapsedSince"

import {
  benchMenuClearance,
  contentInsetsFor,
  heroFontSize,
  knockoutMessage,
  pokemonName,
  prizeWord,
  rotatedLayerStyle,
} from "./pokemonCardLayout"
import { PokemonSheet, type PokemonSheetMode } from "./PokemonSheet"
import type { PlayerMarkShape } from "../../../convex/lib/appearance"
import {
  findPokemon,
  pokemonBoardOf,
  remainingHp,
  type PokemonInPlay,
} from "../../../convex/lib/table"
import { BoardPressable } from "../BoardPressable"
import { overlayTint, useRecentDelta } from "../LifeControls"
import {
  COMPACT_PLAYER_MARK_SIZE,
  getLifeLineHeight,
  PLAYER_MARK_MUTED_OPACITY,
  PLAYER_MARK_SIZE,
  type LifeCardContentInsets,
  type LifeCardContentRotation,
  type LifeCardMenuCorner,
  type LifeCardMenuEdge,
} from "../playerCardTypes"
import { PlayerMark } from "../PlayerMark"
import { Text } from "../Text"

export interface PokemonSeatCardProps {
  playerId: string
  playerName: string
  seatNumber: number
  shape?: PlayerMarkShape
  /** why: Prize cards are the seat's main counter, so this is the player's life total. */
  prizes: number
  color: string
  compact?: boolean
  contentRotation?: LifeCardContentRotation
  contentInsets?: LifeCardContentInsets
  menuCorner?: LifeCardMenuCorner
  menuEdgeCenter?: LifeCardMenuEdge
  disabled?: boolean
  ownership?: "owned" | "unowned" | "disabled"
  staleSince?: number
  /** why: the sole opponent takes prizes on a knockout; with more seats the card asks who did. */
  opponents: readonly { id: string; name: string }[]
  table: TableRuntime
  onChangePrizes: (delta: LifeDelta) => void
  style?: StyleProp<ViewStyle>
}

const KNOCKOUT_TOAST_MS = 6_000
const STANDARD_PRIZES = 6
const BENCH_HEIGHT = 56
const COMPACT_BENCH_HEIGHT = 44
const BOTTOM_ROW_HEIGHT = 44
const COMPACT_BOTTOM_ROW_HEIGHT = 36
const HERO_CAPTION_HEIGHT = 40
const COMPACT_HERO_CAPTION_HEIGHT = 20
// why: a sideways seat on a four-player phone board has under 200px of content height, which the compact flag (five seats and up) does not cover.
const CRAMPED_CONTENT_HEIGHT = 260
const LONG_PRESS_MS = 450
// why: ask bars and the knockout toast sit on the seat color, so they darken a light-inked seat and lighten a dark-inked one.
const BAR_ON_DARK = "rgba(0,0,0,0.62)"
const BAR_ON_LIGHT = "rgba(255,255,255,0.78)"

type Sheet = { kind: "place"; slot: "active" | "bench" } | { kind: "edit"; pokemonId: string }
type TakerAsk = { pokemonId: string; delta?: number }

/**
 * why: Pokémon seats put the Active Pokémon's remaining HP where life goes, since that is the number both players watch. Prizes shrink to pips, the bench sits on the inner edge, and the whole seat turns as one layer so every rotation lays out the same way.
 */
export const PokemonSeatCard = memo(function PokemonSeatCard({
  playerId,
  playerName,
  seatNumber,
  shape,
  prizes,
  color,
  compact,
  contentRotation = 0,
  contentInsets,
  menuCorner,
  menuEdgeCenter,
  disabled,
  ownership,
  staleSince,
  opponents,
  table,
  onChangePrizes,
  style,
}: PokemonSeatCardProps) {
  const {
    themed,
    theme: { spacing },
  } = useAppTheme()
  const ink = accessibleForeground(color)
  const board = pokemonBoardOf(table.table, playerId)
  const rules = table.tableRules.pokemon ?? { benchSize: 5, damageStep: 10 }
  const readOnly = ownership === "unowned"
  const frozen = Boolean(disabled) || ownership === "disabled"
  const canEdit = !readOnly && !frozen
  const displayName = playerName.trim() || "unnamed player"
  const identity = `Seat ${seatNumber}, ${displayName}`
  const padding = compact ? spacing.xxs : spacing.xs
  const insets = contentInsetsFor(contentRotation, contentInsets)
  const clearance = benchMenuClearance(contentRotation, menuCorner, menuEdgeCenter)
  const sideways = Math.abs(contentRotation) === 90
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 })
  const layer = sideways
    ? { width: cardSize.height, height: cardSize.width }
    : { width: cardSize.width, height: cardSize.height }
  const cramped = Boolean(compact) || (layer.height > 0 && layer.height < CRAMPED_CONTENT_HEIGHT)
  const benchHeight = cramped ? COMPACT_BENCH_HEIGHT : BENCH_HEIGHT
  const bottomRowHeight = cramped ? COMPACT_BOTTOM_ROW_HEIGHT : BOTTOM_ROW_HEIGHT
  const markSize = cramped ? COMPACT_PLAYER_MARK_SIZE : PLAYER_MARK_SIZE
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [switchAsk, setSwitchAsk] = useState<string | null>(null)
  const [takerAsk, setTakerAsk] = useState<TakerAsk | null>(null)
  const [knockout, setKnockout] = useState<TableKnockout | null>(null)
  // why: web and Android read a live region, iOS gets a spoken announcement; both hear knockouts and undos.
  const [announcement, setAnnouncement] = useState("")
  const elapsed = useElapsedSince(staleSince)

  const editing = sheet?.kind === "edit" ? findPokemon(board, sheet.pokemonId) : undefined
  const sheetMode: PokemonSheetMode | null =
    sheet?.kind === "place"
      ? sheet
      : editing
        ? { kind: "edit", pokemon: editing.pokemon, slot: editing.slot }
        : null
  const switching = switchAsk ? board.bench.find(({ id }) => id === switchAsk) : undefined
  const asking = takerAsk ? findPokemon(board, takerAsk.pokemonId)?.pokemon : undefined
  // why: the sheet covers the seat, so the controls under it stop rendering as targets rather than staying reachable by keyboard or screen reader.
  const controlsLive = canEdit && !sheetMode

  useEffect(() => {
    if (!canEdit) {
      setSheet(null)
      setSwitchAsk(null)
      setTakerAsk(null)
    }
  }, [canEdit])

  // why: the toast lasts a moment and only while this knockout is still the one the board can undo.
  const undoable = knockout && board.lastKnockout?.operationId === knockout.operationId
  // why: undoing puts the Pokémon back where it was, or on the bench if a new Active took its spot; neither lands when that spot is full.
  const undoLands =
    !!knockout &&
    ((knockout.slot === "active" && !board.active) || board.bench.length < rules.benchSize)
  useEffect(() => {
    if (!knockout) return
    announce(toastMessage(knockout))
    const timer = setTimeout(() => setKnockout(null), KNOCKOUT_TOAST_MS)
    return () => clearTimeout(timer)
  }, [knockout]) // eslint-disable-line react-hooks/exhaustive-deps

  function announce(message: string) {
    setAnnouncement(message)
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(message)
  }

  function undo(ko: TableKnockout) {
    const restoredTo = ko.slot === "active" && !board.active ? "Active" : "the bench"
    const takerName = opponents.find(({ id }) => id === ko.takerPlayerId)?.name
    table.undoKnockout(playerId, ko.operationId)
    setKnockout(null)
    announce(
      `Undo. ${pokemonName(ko.pokemon)} returns to ${restoredTo}${
        takerName && ko.prizesTaken > 0
          ? `, ${takerName} gives back ${prizeWord(ko.prizesTaken)}`
          : ""
      }.`,
    )
  }

  function toastMessage(ko: TableKnockout) {
    return knockoutMessage({
      pokemon: ko.pokemon,
      takerName: opponents.find(({ id }) => id === ko.takerPlayerId)?.name,
      prizesTaken: ko.prizesTaken,
    })
  }

  function measureCard(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout
    setCardSize((current) =>
      current.width === width && current.height === height ? current : { width, height },
    )
  }

  function landKnockout(ko: TableKnockout | null) {
    if (!ko) return
    setKnockout(ko)
    setSheet(null)
    setTakerAsk(null)
  }

  function damage(pokemonId: string, delta: number, takerPlayerId?: string) {
    const found = findPokemon(board, pokemonId)
    const lethal = found && delta > 0 && found.pokemon.damage + delta >= found.pokemon.hp
    if (lethal && opponents.length > 1 && takerPlayerId === undefined) {
      setSheet(null)
      setTakerAsk({ pokemonId, delta })
      return
    }
    landKnockout(table.adjustPokemonDamage(playerId, pokemonId, delta, takerPlayerId))
  }

  function knockOut(pokemonId: string, takerPlayerId?: string) {
    if (opponents.length > 1 && takerPlayerId === undefined) {
      setSheet(null)
      setTakerAsk({ pokemonId })
      return
    }
    landKnockout(table.knockOut(playerId, pokemonId, takerPlayerId))
  }

  function resolveTaker(takerPlayerId: string) {
    if (!takerAsk) return
    if (takerAsk.delta === undefined) knockOut(takerAsk.pokemonId, takerPlayerId)
    else damage(takerAsk.pokemonId, takerAsk.delta, takerPlayerId)
  }

  function pressBench(pokemon: PokemonInPlay) {
    if (!canEdit) return
    if (board.active) setSwitchAsk(pokemon.id)
    else table.switchActive(playerId, pokemon.id)
  }

  const ownershipLabel =
    ownership === "owned"
      ? "Your seat"
      : ownership === "unowned"
        ? "View only"
        : ownership === "disabled"
          ? "Controls unavailable"
          : undefined
  const heroDigits = board.active ? String(remainingHp(board.active)).length : 1
  const fontSize = heroFontSize({
    width: layer.width - padding * 2 - insets.left - insets.right,
    height:
      layer.height -
      padding * 2 -
      insets.top -
      insets.bottom -
      clearance -
      benchHeight -
      bottomRowHeight -
      (cramped ? COMPACT_HERO_CAPTION_HEIGHT : HERO_CAPTION_HEIGHT),
    digits: heroDigits,
    fontScale: 1,
  })
  const prizePips = Math.max(STANDARD_PRIZES, prizes)
  const tint = (alpha: number) => overlayTint(ink, alpha)
  // why: bars sit above the prize row so the pips stay visible while a knockout toast or a question is up.
  const bar = [
    themed($bar),
    {
      backgroundColor: ink === "#FFFFFF" ? BAR_ON_DARK : BAR_ON_LIGHT,
      bottom: padding + insets.bottom + bottomRowHeight,
    },
  ]
  const barInk = ink
  const onBarInk = accessibleForeground(barInk)
  const readyToLayout = !sideways || (cardSize.width > 0 && cardSize.height > 0)

  return (
    <View
      testID={`pokemon-card-seat-${seatNumber}`}
      accessibilityLabel={`${identity}${ownershipLabel ? `, ${ownershipLabel}` : ""}`}
      onLayout={measureCard}
      style={[
        themed($card),
        compact && themed($compactCard),
        ownership === "disabled" && themed($disabledCard),
        staleSince !== undefined && themed($staleCard),
        { backgroundColor: color },
        style,
      ]}
    >
      <Text
        testID={`pokemon-announcement-seat-${seatNumber}`}
        accessibilityLiveRegion="polite"
        text={announcement}
        style={$liveRegion}
      />
      <View
        testID={`pokemon-layer-seat-${seatNumber}`}
        pointerEvents={sheetMode ? "none" : "box-none"}
        accessibilityElementsHidden={!!sheetMode}
        importantForAccessibility={sheetMode ? "no-hide-descendants" : "auto"}
        style={[
          StyleSheet.absoluteFill,
          rotatedLayerStyle(contentRotation, cardSize.width, cardSize.height),
          {
            paddingTop: padding + insets.top + clearance,
            paddingBottom: padding + insets.bottom,
            paddingLeft: padding + insets.left,
            paddingRight: padding + insets.right,
          },
          !readyToLayout && $hidden,
        ]}
      >
        <View
          testID={`pokemon-bench-seat-${seatNumber}`}
          accessibilityLabel={`${identity}, bench, ${board.bench.length} of ${rules.benchSize}`}
          style={[themed($bench), { height: benchHeight }]}
        >
          {board.bench.map((pokemon) => (
            <BenchChip
              key={pokemon.id}
              pokemon={pokemon}
              ink={ink}
              compact={cramped}
              interactive={controlsLive}
              promotes={!board.active}
              onPress={() => pressBench(pokemon)}
              onLongPress={() => setSheet({ kind: "edit", pokemonId: pokemon.id })}
            />
          ))}
          {controlsLive && board.bench.length < rules.benchSize ? (
            <BoardPressable
              testID={`pokemon-bench-add-seat-${seatNumber}`}
              accessibilityRole="button"
              accessibilityLabel={`${identity}, add a bench Pokémon`}
              onPress={() => setSheet({ kind: "place", slot: "bench" })}
              style={({ pressed }) => [
                themed($chip),
                themed($addChip),
                { borderColor: tint(0.3) },
                pressed && { backgroundColor: tint(0.14) },
              ]}
            >
              <Text text="+" size="lg" weight="medium" style={[{ color: ink }, $dim80]} />
            </BoardPressable>
          ) : null}
        </View>

        {board.active ? (
          <ActiveHero
            key={board.active.id}
            identity={identity}
            seatNumber={seatNumber}
            pokemon={board.active}
            ink={ink}
            fontSize={fontSize}
            compact={cramped}
            step={rules.damageStep}
            interactive={controlsLive}
            onDamage={(delta) => damage(board.active!.id, delta)}
            onEdit={() => setSheet({ kind: "edit", pokemonId: board.active!.id })}
          />
        ) : (
          <BoardPressable
            testID={`pokemon-place-active-seat-${seatNumber}`}
            accessibilityRole={controlsLive ? "button" : undefined}
            accessibilityLabel={`${identity}, no Active Pokémon`}
            accessibilityHint={
              canEdit
                ? board.bench.length
                  ? "Tap a bench Pokémon to make it Active, or tap here to place one"
                  : "Tap to place an Active Pokémon"
                : undefined
            }
            disabled={!controlsLive}
            onPress={() => setSheet({ kind: "place", slot: "active" })}
            style={({ pressed }) => [themed($hero), pressed && { opacity: 0.7 }]}
          >
            <Text
              text="No Active"
              size={compact ? "md" : "lg"}
              weight="medium"
              style={[{ color: ink }, $dim80]}
            />
            {canEdit ? (
              <Text
                text={board.bench.length ? "Tap a bench Pokémon or + to place" : "Tap to place"}
                size="xxs"
                style={[{ color: ink }, $dim70]}
              />
            ) : null}
          </BoardPressable>
        )}

        {/* why: the seat mark sits behind the content in the content-space corner, as on the life card, so it costs the cramped seats no room. */}
        <PlayerMark
          seatNumber={seatNumber}
          shape={shape}
          color={ink}
          spinning={ownership === "owned"}
          size={markSize}
          style={[
            themed($mark),
            { right: padding + insets.right, bottom: padding + insets.bottom },
          ]}
        />
        <View style={[themed($bottomRow), { height: bottomRowHeight }]}>
          <View style={themed($prizeGroup)}>
            <BoardPressable
              testID={`pokemon-prizes-seat-${seatNumber}`}
              accessibilityRole={controlsLive ? "button" : undefined}
              accessibilityLabel={`${identity}, ${prizes} Prize ${prizes === 1 ? "card" : "cards"}`}
              accessibilityHint={
                controlsLive ? "Tap to take a prize. Long press to put one back." : undefined
              }
              disabled={!controlsLive}
              delayLongPress={LONG_PRESS_MS}
              onPress={() => onChangePrizes(-1)}
              onLongPress={() => onChangePrizes(1)}
              style={({ pressed }) => [themed($prizes), pressed && { backgroundColor: tint(0.14) }]}
            >
              <View style={themed($pipRow)}>
                <Text
                  testID={`pokemon-prize-count-seat-${seatNumber}`}
                  text={String(prizes)}
                  weight="bold"
                  size="xs"
                  style={{ color: ink }}
                />
                <View
                  style={themed($pips)}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  {Array.from({ length: prizePips }, (_, index) => (
                    <View
                      key={index}
                      style={[themed($pip), { backgroundColor: ink }, index >= prizes && $pipGone]}
                    />
                  ))}
                </View>
              </View>
              <Text
                testID={`player-name-seat-${seatNumber}`}
                text={`${displayName} · prizes`}
                size="xxs"
                numberOfLines={1}
                style={[{ color: ink }, $dim75]}
              />
              {elapsed ? (
                <Text
                  text={`Updated ${elapsed} ago`}
                  size="xxs"
                  weight="bold"
                  numberOfLines={1}
                  style={{ color: ink }}
                />
              ) : null}
            </BoardPressable>
            {controlsLive ? (
              <BoardPressable
                testID={`pokemon-prize-back-seat-${seatNumber}`}
                accessibilityRole="button"
                accessibilityLabel={`${identity}, put a prize back`}
                hitSlop={6}
                onPress={() => onChangePrizes(1)}
                style={({ pressed }) => [themed($inlineAction), pressed && $pressed]}
              >
                <Text text="+1" size="xxs" weight="medium" style={[{ color: ink }, $dim70]} />
              </BoardPressable>
            ) : null}
          </View>
        </View>

        {switching && board.active ? (
          <View
            testID={`pokemon-switch-ask-seat-${seatNumber}`}
            accessibilityLiveRegion="polite"
            style={bar}
          >
            <Text size="xs" style={{ color: barInk }}>
              Retreat{" "}
              <Text
                weight="bold"
                size="xs"
                style={{ color: barInk }}
                text={pokemonName(board.active)}
              />
              .{" "}
              <Text
                weight="bold"
                size="xs"
                style={{ color: barInk }}
                text={pokemonName(switching)}
              />{" "}
              becomes Active.
            </Text>
            <View style={themed($barActions)}>
              <BoardPressable
                testID={`pokemon-switch-confirm-seat-${seatNumber}`}
                accessibilityRole="button"
                accessibilityLabel={`Switch, ${pokemonName(switching)} becomes Active`}
                onPress={() => {
                  table.switchActive(playerId, switching.id)
                  setSwitchAsk(null)
                }}
                style={[themed($barButton), { backgroundColor: barInk }]}
              >
                <Text text="Switch" size="xs" weight="bold" style={{ color: onBarInk }} />
              </BoardPressable>
              <BoardPressable
                testID={`pokemon-switch-edit-seat-${seatNumber}`}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${pokemonName(switching)}`}
                onPress={() => {
                  setSwitchAsk(null)
                  setSheet({ kind: "edit", pokemonId: switching.id })
                }}
                style={[
                  themed($barButton),
                  themed($ghostButton),
                  { borderColor: overlayTint(barInk, 0.4) },
                ]}
              >
                <Text text="Edit" size="xs" style={{ color: barInk }} />
              </BoardPressable>
              <BoardPressable
                testID={`pokemon-switch-cancel-seat-${seatNumber}`}
                accessibilityRole="button"
                accessibilityLabel="Cancel switch"
                onPress={() => setSwitchAsk(null)}
                style={[
                  themed($barButton),
                  themed($ghostButton),
                  { borderColor: overlayTint(barInk, 0.4) },
                ]}
              >
                <Text text="Cancel" size="xs" style={{ color: barInk }} />
              </BoardPressable>
            </View>
          </View>
        ) : null}

        {asking ? (
          <View
            testID={`pokemon-taker-ask-seat-${seatNumber}`}
            accessibilityLiveRegion="polite"
            style={bar}
          >
            <Text
              text={`${pokemonName(asking)} knocked out. Who takes ${prizeWord(asking.prizes)}?`}
              size="xs"
              style={{ color: barInk }}
            />
            <View style={themed($barActions)}>
              {opponents.map((opponent) => (
                <BoardPressable
                  key={opponent.id}
                  testID={`pokemon-taker-${opponent.id}-seat-${seatNumber}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${opponent.name} takes the prizes`}
                  onPress={() => resolveTaker(opponent.id)}
                  style={[themed($barButton), { backgroundColor: overlayTint(barInk, 0.16) }]}
                >
                  <Text
                    text={opponent.name}
                    size="xs"
                    weight="medium"
                    numberOfLines={1}
                    style={{ color: barInk }}
                  />
                </BoardPressable>
              ))}
              <BoardPressable
                testID={`pokemon-taker-cancel-seat-${seatNumber}`}
                accessibilityRole="button"
                accessibilityLabel="Cancel knockout"
                onPress={() => setTakerAsk(null)}
                style={[
                  themed($barButton),
                  themed($ghostButton),
                  { borderColor: overlayTint(barInk, 0.4) },
                ]}
              >
                <Text text="Cancel" size="xs" style={{ color: barInk }} />
              </BoardPressable>
            </View>
          </View>
        ) : null}

        {undoable ? (
          <View
            testID={`pokemon-knockout-toast-seat-${seatNumber}`}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[bar, themed($toastRow)]}
          >
            <Text
              testID={`pokemon-knockout-message-seat-${seatNumber}`}
              text={toastMessage(knockout)}
              size="xs"
              style={[$grow, { color: barInk }]}
            />
            {undoLands ? (
              <BoardPressable
                testID={`pokemon-knockout-undo-seat-${seatNumber}`}
                accessibilityRole="button"
                accessibilityLabel={`Undo, ${pokemonName(knockout.pokemon)} returns`}
                onPress={() => undo(knockout)}
                style={[themed($barButton), $noGrow, { backgroundColor: barInk }]}
              >
                <Text text="Undo" size="xs" weight="bold" style={{ color: onBarInk }} />
              </BoardPressable>
            ) : (
              <Text
                testID={`pokemon-knockout-no-undo-seat-${seatNumber}`}
                text="No room to undo"
                size="xxs"
                style={[{ color: barInk }, $dim75]}
              />
            )}
          </View>
        ) : null}
      </View>

      {sheetMode && canEdit ? (
        <PokemonSheet
          seatNumber={seatNumber}
          color={color}
          rotation={contentRotation}
          cardWidth={cardSize.width}
          cardHeight={cardSize.height}
          insets={insets}
          topClearance={clearance}
          compact={compact}
          damageStep={rules.damageStep}
          mode={sheetMode}
          onPlace={(card) => {
            if (sheetMode.kind !== "place") return false
            if (table.placePokemon(playerId, sheetMode.slot, card) === null) return false
            setSheet(null)
            return true
          }}
          onUpdate={(pokemonId, card) => table.updatePokemon(playerId, pokemonId, card)}
          onDamage={damage}
          onMakeActive={(pokemonId) => {
            table.switchActive(playerId, pokemonId)
            setSheet(null)
          }}
          onKnockOut={(pokemonId) => {
            setSheet(null)
            knockOut(pokemonId)
          }}
          onRemove={(pokemonId) => {
            table.removePokemon(playerId, pokemonId)
            setSheet(null)
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </View>
  )
}, structurallyEqual)

function ActiveHero({
  identity,
  seatNumber,
  pokemon,
  ink,
  fontSize,
  compact,
  step,
  interactive,
  onDamage,
  onEdit,
}: {
  identity: string
  seatNumber: number
  pokemon: PokemonInPlay
  ink: string
  fontSize: number
  compact?: boolean
  step: number
  interactive: boolean
  onDamage: (delta: number) => void
  onEdit: () => void
}) {
  const { themed } = useAppTheme()
  const remaining = remainingHp(pokemon)
  const name = pokemonName(pokemon)
  const recentDelta = useRecentDeltaValue(pokemon.damage)
  const longPressHandled = useRef<number | null>(null)
  const previous = useRef(remaining)
  useEffect(() => {
    if (previous.current === remaining) return
    previous.current = remaining
    if (Platform.OS === "ios")
      AccessibilityInfo.announceForAccessibility(`${name}, ${remaining} HP left`)
  }, [name, remaining])
  const zones = [
    { direction: -1, glyph: "−", align: "flex-start" as const },
    { direction: 1, glyph: "+", align: "flex-end" as const },
  ]
  return (
    <View testID={`pokemon-hero-seat-${seatNumber}`} style={themed($hero)}>
      {interactive ? (
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, themed($zones)]}>
          {zones.map(({ direction, glyph, align }) => {
            const delta = direction * step
            const feedback =
              direction * recentDelta > 0
                ? `${recentDelta > 0 ? "+" : "-"}${Math.abs(recentDelta)}`
                : glyph
            return (
              <BoardPressable
                key={delta}
                testID={`pokemon-damage-seat-${seatNumber}-${delta}`}
                accessibilityRole="button"
                accessibilityLabel={`${identity}, ${name}, ${delta > 0 ? `add ${delta} damage` : `heal ${Math.abs(delta)}`}`}
                accessibilityHint={`Long press to edit ${name}`}
                accessibilityActions={[{ name: "longpress", label: `Edit ${name}` }]}
                delayLongPress={LONG_PRESS_MS}
                onPressIn={() => {
                  longPressHandled.current = null
                }}
                onLongPress={() => {
                  longPressHandled.current = direction
                  onEdit()
                }}
                onAccessibilityAction={({ nativeEvent }) => {
                  if (nativeEvent.actionName === "longpress") onEdit()
                }}
                onPress={() => {
                  if (longPressHandled.current === direction) {
                    longPressHandled.current = null
                    return
                  }
                  onDamage(delta)
                }}
                style={({ pressed }) => [
                  themed($zone),
                  { alignItems: align },
                  pressed && { backgroundColor: overlayTint(ink, 0.14) },
                ]}
              >
                <Text
                  text={feedback}
                  maxFontSizeMultiplier={1.3}
                  numberOfLines={1}
                  style={[themed(compact ? $compactGlyph : $glyph), { color: ink }]}
                />
              </BoardPressable>
            )
          })}
        </View>
      ) : null}
      <View pointerEvents="box-none" style={themed($heroReadout)}>
        <Text
          testID={`pokemon-hp-seat-${seatNumber}`}
          text={String(remaining)}
          accessible
          accessibilityLabel={`${identity}, ${name}, ${remaining} HP left of ${pokemon.hp}, ${pokemon.damage} damage`}
          accessibilityLiveRegion="polite"
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
          style={[themed($hp), { fontSize, lineHeight: getLifeLineHeight(fontSize), color: ink }]}
        />
        <View style={themed($captionRow)} pointerEvents="box-none">
          <Text
            testID={`pokemon-active-name-seat-${seatNumber}`}
            text={name}
            size={compact ? "xxs" : "xs"}
            weight="medium"
            numberOfLines={1}
            style={[$shrink, { color: ink }]}
          />
          <Text
            text={compact ? `${pokemon.damage} dmg` : `${pokemon.damage} damage · ${pokemon.hp} HP`}
            size="xxs"
            numberOfLines={1}
            style={[{ color: ink }, $dim75]}
          />
          {interactive ? (
            <BoardPressable
              testID={`pokemon-edit-active-seat-${seatNumber}`}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${name}`}
              hitSlop={8}
              onPress={onEdit}
              style={({ pressed }) => [themed($inlineAction), pressed && $pressed]}
            >
              <Text text="Edit" size="xxs" weight="medium" style={[{ color: ink }, $dim75]} />
            </BoardPressable>
          ) : null}
        </View>
      </View>
    </View>
  )
}

/** why: the life zones' bubble store is reused so taps add up into one "+30" the same way life does. */
function useRecentDeltaValue(damage: number) {
  const store = useRecentDelta(damage)
  const [value, setValue] = useState(store.get)
  useEffect(() => store.subscribe(() => setValue(store.get())), [store])
  return value
}

function BenchChip({
  pokemon,
  ink,
  compact,
  interactive,
  promotes,
  onPress,
  onLongPress,
}: {
  pokemon: PokemonInPlay
  ink: string
  compact?: boolean
  interactive: boolean
  promotes: boolean
  onPress: () => void
  onLongPress: () => void
}) {
  const { themed } = useAppTheme()
  const name = pokemonName(pokemon)
  const longPressHandled = useRef(false)
  return (
    <BoardPressable
      testID={`pokemon-bench-${pokemon.id}`}
      accessibilityRole={interactive ? "button" : undefined}
      accessibilityLabel={`Bench, ${name}, ${remainingHp(pokemon)} of ${pokemon.hp} HP, ${pokemon.damage} damage`}
      accessibilityHint={
        interactive
          ? `${promotes ? "Tap to make Active" : "Tap to switch in"}. Long press to edit.`
          : undefined
      }
      accessibilityActions={
        interactive ? [{ name: "longpress", label: `Edit ${name}` }] : undefined
      }
      disabled={!interactive}
      delayLongPress={LONG_PRESS_MS}
      onPressIn={() => {
        longPressHandled.current = false
      }}
      onLongPress={() => {
        longPressHandled.current = true
        onLongPress()
      }}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === "longpress") onLongPress()
      }}
      onPress={() => {
        if (longPressHandled.current) {
          longPressHandled.current = false
          return
        }
        onPress()
      }}
      style={({ pressed }) => [
        themed($chip),
        { borderColor: overlayTint(ink, 0.3) },
        pressed && { backgroundColor: overlayTint(ink, 0.14) },
      ]}
    >
      <Text text={name} size="xxs" numberOfLines={1} style={[{ color: ink }, $dim85]} />
      <Text
        testID={`pokemon-bench-hp-${pokemon.id}`}
        text={String(remainingHp(pokemon))}
        weight="bold"
        numberOfLines={1}
        style={[themed(compact ? $compactChipHp : $chipHp), { color: ink }]}
      />
      <Text text={`/${pokemon.hp}`} size="xxs" numberOfLines={1} style={[{ color: ink }, $dim70]} />
    </BoardPressable>
  )
}

const $grow: ViewStyle = { flex: 1, minWidth: 0 }
const $noGrow: ViewStyle = { flex: 0 }
const $hidden: ViewStyle = { opacity: 0 }
const $dim70: TextStyle = { opacity: 0.7 }
const $dim75: TextStyle = { opacity: 0.75 }
const $dim80: TextStyle = { opacity: 0.8 }
const $dim85: TextStyle = { opacity: 0.85 }
const $pipGone: ViewStyle = { opacity: 0.25 }
const $pressed: ViewStyle = { opacity: 0.6 }
const $shrink: ViewStyle = { flexShrink: 1 }
const $liveRegion: TextStyle = { position: "absolute", width: 1, height: 1, opacity: 0 }

const $card: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  overflow: "hidden",
  padding: spacing.xs,
  borderRadius: spacing.lg,
})
const $compactCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.xxs,
  borderRadius: spacing.md,
})
const $disabledCard: ThemedStyle<ViewStyle> = () => ({ opacity: 0.6 })
const $staleCard: ThemedStyle<ViewStyle> = () => ({ opacity: 0.85 })
const $bench: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xxs,
  alignItems: "stretch",
})
// why: chips are text on the seat color with a hairline edge; a fill only shows while pressed.
const $chip: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  minWidth: 0,
  maxWidth: 180,
  borderRadius: 10,
  borderWidth: StyleSheet.hairlineWidth,
  paddingHorizontal: spacing.xxs,
  alignItems: "center",
  justifyContent: "center",
})
const $addChip: ThemedStyle<ViewStyle> = () => ({ flex: 0, width: 36 })
const $chipHp: ThemedStyle<TextStyle> = () => ({
  fontSize: 22,
  lineHeight: 24,
  fontVariant: ["tabular-nums"],
})
const $compactChipHp: ThemedStyle<TextStyle> = () => ({
  fontSize: 17,
  lineHeight: 19,
  fontVariant: ["tabular-nums"],
})
const $hero: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
})
const $heroReadout: ThemedStyle<ViewStyle> = () => ({ alignItems: "center", maxWidth: "100%" })
const $captionRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  flexWrap: "wrap",
  columnGap: spacing.xs,
  maxWidth: "100%",
})
const $mark: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  zIndex: 0,
  opacity: PLAYER_MARK_MUTED_OPACITY,
})
const $inlineAction: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.xxs,
  minHeight: 24,
  justifyContent: "center",
})
const $hp: ThemedStyle<TextStyle> = () => ({
  textAlign: "center",
  fontVariant: ["tabular-nums"],
})
const $zones: ThemedStyle<ViewStyle> = () => ({ flexDirection: "row" })
const $zone: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  justifyContent: "center",
  paddingHorizontal: spacing.xs,
  borderRadius: 12,
})
const $glyph: ThemedStyle<TextStyle> = () => ({ fontSize: 44, lineHeight: 50, opacity: 0.6 })
const $compactGlyph: ThemedStyle<TextStyle> = () => ({ fontSize: 30, lineHeight: 34, opacity: 0.6 })
const $bottomRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "flex-end",
  justifyContent: "space-between",
})
const $prizeGroup: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "flex-start",
  gap: spacing.xxs,
})
const $prizes: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xxxs,
  paddingHorizontal: spacing.xs,
  paddingVertical: spacing.xxs,
  borderRadius: 10,
  marginLeft: -spacing.xs,
  marginBottom: -spacing.xxs,
})
const $pipRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xxs + 2,
})
const $pips: ThemedStyle<ViewStyle> = () => ({ flexDirection: "row", gap: 3 })
const $pip: ThemedStyle<ViewStyle> = () => ({ width: 8, height: 12, borderRadius: 2 })
const $bar: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  left: spacing.xs,
  right: spacing.xs,
  bottom: spacing.xs,
  borderRadius: 14,
  padding: spacing.xs,
  gap: spacing.xs,
  zIndex: 15,
})
const $toastRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})
const $barActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xxs + 2,
  flexWrap: "wrap",
})
const $barButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  minHeight: 36,
  minWidth: 72,
  borderRadius: 10,
  paddingHorizontal: spacing.sm,
  alignItems: "center",
  justifyContent: "center",
})
const $ghostButton: ThemedStyle<ViewStyle> = () => ({ borderWidth: 1.5 })
