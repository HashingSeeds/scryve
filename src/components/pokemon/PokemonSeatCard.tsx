import { memo, useEffect, useRef, useState } from "react"
import type { LayoutChangeEvent, StyleProp, TextStyle, ViewStyle } from "react-native"
import { AccessibilityInfo, Platform, StyleSheet, View } from "react-native"
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"

import type { TableKnockout, TableRuntime } from "@/features/game/tableRuntime"
import type { LifeDelta } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { structurallyEqual } from "@/utils/structurallyEqual"
import { useElapsedSince } from "@/utils/useElapsedSince"
import { useReducedMotion } from "@/utils/useReducedMotion"

import {
  benchMenuClearance,
  contentInsetsFor,
  heroFontSize,
  knockoutMessage,
  moveFocus,
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
import { COMPACT_DICE_CHIP_HEIGHT, DICE_CHIP_HEIGHT, DiceChips } from "../DiceChips"
import { diceCoversSeat, DiceSeatOverlay, type LifeCardDice } from "../DiceSeatOverlay"
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
  prizes: number
  color: string
  compact?: boolean
  contentRotation?: LifeCardContentRotation
  contentInsets?: LifeCardContentInsets
  /** why: a seat on the screen's bottom edge is the one the keyboard covers, so its sheet lifts the board. */
  touchesBottomEdge?: boolean
  menuCorner?: LifeCardMenuCorner
  menuEdgeCenter?: LifeCardMenuEdge
  disabled?: boolean
  ownership?: "owned" | "unowned" | "disabled"
  staleSince?: number
  opponents: readonly { id: string; name: string }[]
  table: TableRuntime
  dice?: LifeCardDice
  onChangePrizes: (delta: LifeDelta) => void
  style?: StyleProp<ViewStyle>
}

const KNOCKOUT_TOAST_MS = 6_000
// why: a focused bench Pokémon holds the hero long enough for a few taps, then the Active comes back on its own so the seat never stays on the wrong Pokémon.
const FOCUS_MS = 3_000
const STANDARD_PRIZES = 6
const BENCH_HEIGHT = 56
const COMPACT_BENCH_HEIGHT = 44
// why: a prize pip keeps a card's 13:17 shape.
const PRIZE_PIP_ASPECT = 13 / 17
const HERO_CAPTION_HEIGHT = 44
const COMPACT_HERO_CAPTION_HEIGHT = 24
const CRAMPED_CONTENT_HEIGHT = 260
const LONG_PRESS_MS = 450
const BAR_ON_DARK = "rgba(0,0,0,0.62)"
const BAR_ON_LIGHT = "rgba(255,255,255,0.78)"

type Sheet = { kind: "place"; slot: "active" | "bench" } | { kind: "edit"; pokemonId: string }
const EDIT_ACTIVE_TRIGGER = "edit-active"
const PLACE_ACTIVE_TRIGGER = "place-active"
const ADD_TRIGGER = "add"
type TakerAsk = { pokemonId: string; delta?: number }
// why: a new tick per tap restarts the focus timer and the drain bar, even when the same Pokémon is tapped again.
type Focus = { pokemonId: string; tick: number }

export const PokemonSeatCard = memo(function PokemonSeatCard({
  playerId,
  playerName,
  seatNumber,
  shape,
  prizes,
  color,
  compact,
  dice,
  contentRotation = 0,
  contentInsets,
  touchesBottomEdge,
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
  const insets = contentInsetsFor(contentRotation, contentInsets)
  const clearance = benchMenuClearance(contentRotation, menuCorner, menuEdgeCenter)
  const sideways = Math.abs(contentRotation) === 90
  const diceCovers = diceCoversSeat(dice)
  const diceChips = dice?.chips
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 })
  const layer = sideways
    ? { width: cardSize.height, height: cardSize.width }
    : { width: cardSize.width, height: cardSize.height }
  const cramped = Boolean(compact) || (layer.height > 0 && layer.height < CRAMPED_CONTENT_HEIGHT)
  const padding = cramped ? spacing.xxs : spacing.xs
  const benchHeight = cramped ? COMPACT_BENCH_HEIGHT : BENCH_HEIGHT
  const chipClearance = diceChips?.length
    ? (cramped ? COMPACT_DICE_CHIP_HEIGHT : DICE_CHIP_HEIGHT) + spacing.xxxs
    : 0
  const markSize = cramped ? COMPACT_PLAYER_MARK_SIZE : PLAYER_MARK_SIZE
  // why: the prize grid stands as tall as the seat mark across from it, so the bottom row reads as one band.
  const prizeRowHeight = markSize
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [focus, setFocus] = useState<Focus | null>(null)
  const focusTick = useRef(0)
  const [takerAsk, setTakerAsk] = useState<TakerAsk | null>(null)
  const [knockout, setKnockout] = useState<TableKnockout | null>(null)
  const [pendingUndo, setPendingUndo] = useState<TableKnockout | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const triggers = useRef(new Map<string, View>()).current
  const returnFocusTo = useRef<string | null>(null)
  const trigger = (key: string) => (node: View | null) => {
    if (node) triggers.set(key, node)
    else triggers.delete(key)
  }
  const openSheet = (next: Sheet, from: string) => {
    returnFocusTo.current = from
    setSheet(next)
  }
  const elapsed = useElapsedSince(staleSince)

  const editing = sheet?.kind === "edit" ? findPokemon(board, sheet.pokemonId) : undefined
  const sheetMode: PokemonSheetMode | null =
    sheet?.kind === "place"
      ? sheet
      : editing
        ? { kind: "edit", pokemon: editing.pokemon, slot: editing.slot }
        : null
  const focused = focus ? board.bench.find(({ id }) => id === focus.pokemonId) : undefined
  const shown = focused ?? board.active
  const asking = takerAsk ? findPokemon(board, takerAsk.pokemonId)?.pokemon : undefined
  const controlsLive = canEdit && !sheetMode

  useEffect(() => {
    if (!canEdit) {
      returnFocusTo.current = null
      setSheet(null)
      setFocus(null)
      setTakerAsk(null)
      setKnockout(null)
    }
  }, [canEdit])

  useEffect(() => {
    if (!focus) return
    const timer = setTimeout(() => setFocus(null), FOCUS_MS)
    return () => clearTimeout(timer)
  }, [focus])

  const sheetOpen = sheetMode !== null
  useEffect(() => {
    if (sheetOpen || returnFocusTo.current === null) return
    const from = returnFocusTo.current
    returnFocusTo.current = null
    moveFocus(
      triggers.get(from) ??
        triggers.get(EDIT_ACTIVE_TRIGGER) ??
        triggers.get(PLACE_ACTIVE_TRIGGER) ??
        triggers.get(ADD_TRIGGER),
    )
  }, [sheetOpen, triggers])

  const undoable = knockout && board.lastKnockout?.operationId === knockout.operationId
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
    if (Platform.OS === "web") setAnnouncement(message)
    else AccessibilityInfo.announceForAccessibility(message)
  }

  function undo(ko: TableKnockout) {
    table.undoKnockout(playerId, ko.operationId)
    setKnockout(null)
    setPendingUndo(ko)
  }

  const lastKnockoutId = board.lastKnockout?.operationId
  useEffect(() => {
    if (!pendingUndo) return
    setPendingUndo(null)
    if (lastKnockoutId === pendingUndo.operationId) {
      announce(`Could not undo. ${pokemonName(pendingUndo.pokemon)} stays knocked out.`)
      return
    }
    const restored = findPokemon(board, pendingUndo.pokemon.id)
    const takerName = opponents.find(({ id }) => id === pendingUndo.takerPlayerId)?.name
    announce(
      `Undo. ${pokemonName(pendingUndo.pokemon)} returns to ${restored?.slot === "active" ? "Active" : "the bench"}${
        takerName && pendingUndo.prizesTaken > 0
          ? `, ${takerName} gives back ${prizeWord(pendingUndo.prizesTaken)}`
          : ""
      }.`,
    )
  }, [pendingUndo, lastKnockoutId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  function touchFocus(pokemonId: string) {
    setFocus({ pokemonId, tick: ++focusTick.current })
  }

  function pressBench(pokemon: PokemonInPlay) {
    if (!canEdit) return
    if (!board.active) {
      table.switchActive(playerId, pokemon.id)
      return
    }
    // why: a second tap on the focused chip restarts the timer; ending focus there sent the next damage tap to the Active.
    touchFocus(pokemon.id)
  }

  function switchIn(pokemonId: string) {
    table.switchActive(playerId, pokemonId)
    setFocus(null)
  }

  const ownershipLabel =
    ownership === "owned"
      ? "Your seat"
      : ownership === "unowned"
        ? "View only"
        : ownership === "disabled"
          ? "Controls unavailable"
          : undefined
  const heroDigits = shown ? String(remainingHp(shown)).length : 1
  const fontSize = heroFontSize({
    width: layer.width - padding * 2 - insets.left - insets.right,
    height:
      layer.height -
      padding * 2 -
      insets.top -
      insets.bottom -
      clearance.top -
      chipClearance -
      benchHeight -
      prizeRowHeight -
      (cramped ? COMPACT_HERO_CAPTION_HEIGHT : HERO_CAPTION_HEIGHT),
    digits: heroDigits,
    fontScale: 1,
  })
  const prizePips = Math.max(STANDARD_PRIZES, prizes)
  const pipGap = cramped ? 2 : 3
  const pipHeight = (prizeRowHeight - pipGap * 2) / 3
  const pip = { width: pipHeight * PRIZE_PIP_ASPECT, height: pipHeight, gap: pipGap }
  const tint = (alpha: number) => overlayTint(ink, alpha)
  const bar = [
    themed($bar),
    {
      backgroundColor: ink === "#FFFFFF" ? BAR_ON_DARK : BAR_ON_LIGHT,
      bottom: padding + insets.bottom + prizeRowHeight,
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
      {Platform.OS === "web" ? (
        <Text
          testID={`pokemon-announcement-seat-${seatNumber}`}
          accessibilityLiveRegion="polite"
          text={announcement}
          style={$liveRegion}
        />
      ) : null}
      <View
        testID={`pokemon-layer-seat-${seatNumber}`}
        pointerEvents={sheetMode || diceCovers ? "none" : "box-none"}
        accessibilityElementsHidden={!!sheetMode || diceCovers}
        importantForAccessibility={sheetMode || diceCovers ? "no-hide-descendants" : "auto"}
        aria-hidden={!!sheetMode || diceCovers}
        style={[
          StyleSheet.absoluteFill,
          rotatedLayerStyle(contentRotation, cardSize.width, cardSize.height),
          {
            paddingTop: padding + insets.top + clearance.top + chipClearance,
            paddingBottom: padding + insets.bottom,
            paddingLeft: padding + insets.left,
            paddingRight: padding + insets.right,
          },
          !readyToLayout && $hidden,
        ]}
      >
        {/* why: the seat mark is drawn first and sits behind the content in the bottom-left content corner, so it costs the cramped seats no room and never covers a tap target. */}
        <PlayerMark
          seatNumber={seatNumber}
          shape={shape}
          color={ink}
          spinning={ownership === "owned"}
          size={markSize}
          style={[
            themed($mark),
            {
              left: padding + insets.left,
              // why: the mark centers on the prize row, so the seat's identity reads as one line with the name beside it.
              bottom: padding + insets.bottom + (prizeRowHeight - markSize) / 2,
            },
          ]}
        />
        <View
          testID={`pokemon-bench-seat-${seatNumber}`}
          accessibilityLabel={`${identity}, bench, ${board.bench.length} of ${rules.benchSize}`}
          style={[
            themed($bench),
            { height: benchHeight, marginLeft: clearance.left, marginRight: clearance.right },
          ]}
        >
          {/* why: every bench spot is drawn, filled or not, so the row reads as a bench and the next free spot is the add target. */}
          {Array.from({ length: Math.max(rules.benchSize, board.bench.length) }, (_, index) => {
            const pokemon = board.bench[index]
            if (pokemon)
              return (
                <BenchChip
                  key={pokemon.id}
                  pokemon={pokemon}
                  ink={ink}
                  compact={cramped}
                  interactive={controlsLive}
                  promotes={!board.active}
                  focused={focused?.id === pokemon.id}
                  triggerRef={trigger(`bench:${pokemon.id}`)}
                  onPress={() => pressBench(pokemon)}
                  onLongPress={() =>
                    openSheet({ kind: "edit", pokemonId: pokemon.id }, `bench:${pokemon.id}`)
                  }
                />
              )
            if (index === board.bench.length && controlsLive)
              return (
                <BoardPressable
                  key="add"
                  ref={trigger(ADD_TRIGGER)}
                  testID={`pokemon-bench-add-seat-${seatNumber}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${identity}, add a bench Pokémon`}
                  onPress={() => openSheet({ kind: "place", slot: "bench" }, ADD_TRIGGER)}
                  style={({ pressed }) => [
                    themed($chip),
                    $slot,
                    { borderColor: tint(0.45) },
                    pressed && { backgroundColor: tint(0.14) },
                  ]}
                >
                  <Text text="+" size="lg" weight="medium" style={[{ color: ink }, $dim80]} />
                </BoardPressable>
              )
            return (
              <View
                key={`slot-${index}`}
                testID={`pokemon-bench-slot-${index}-seat-${seatNumber}`}
                style={[themed($chip), $slot, { borderColor: tint(0.3) }]}
              />
            )
          })}
        </View>

        {shown ? (
          <PokemonHero
            key={shown.id}
            identity={identity}
            seatNumber={seatNumber}
            pokemon={shown}
            ink={ink}
            fontSize={fontSize}
            compact={cramped}
            step={rules.damageStep}
            interactive={controlsLive}
            editRef={trigger(EDIT_ACTIVE_TRIGGER)}
            bench={
              focused && focus
                ? {
                    restartKey: focus.tick,
                    switchLabel: board.active ? "Switch in" : "Make Active",
                    onSwitchIn: () => switchIn(focused.id),
                  }
                : undefined
            }
            onDamage={(delta) => {
              damage(shown.id, delta)
              if (focused) touchFocus(focused.id)
            }}
            onEdit={() =>
              openSheet(
                { kind: "edit", pokemonId: shown.id },
                focused ? `bench:${focused.id}` : EDIT_ACTIVE_TRIGGER,
              )
            }
          />
        ) : (
          <BoardPressable
            ref={trigger(PLACE_ACTIVE_TRIGGER)}
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
            onPress={() => openSheet({ kind: "place", slot: "active" }, PLACE_ACTIVE_TRIGGER)}
            style={({ pressed }) => [
              themed($placeActive),
              {
                borderColor: tint(canEdit ? 0.55 : 0.3),
                marginHorizontal: cramped ? spacing.sm : spacing.xl,
                marginVertical: cramped ? spacing.xxs : spacing.xs,
              },
              pressed && { backgroundColor: tint(0.14) },
            ]}
          >
            <Text
              text={canEdit ? "Place Active" : "No Active"}
              size={cramped ? "md" : "lg"}
              weight="medium"
              style={{ color: ink }}
            />
            {canEdit && board.bench.length ? (
              <Text text="or tap a bench Pokémon" size="xxs" style={[{ color: ink }, $dim70]} />
            ) : null}
          </BoardPressable>
        )}

        {/* why: prizes are the score; the pips sit two by three like the cards do, so the count reads at a glance without a number. */}
        <View style={[themed($bottomRow), { height: prizeRowHeight }]}>
          <View style={[$identity, { marginLeft: markSize + spacing.xs }]}>
            <Text
              testID={`player-name-seat-${seatNumber}`}
              text={displayName}
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
          </View>
          <BoardPressable
            testID={`pokemon-prizes-seat-${seatNumber}`}
            accessibilityRole={controlsLive ? "button" : undefined}
            accessibilityLabel={`${identity}, ${prizes} Prize ${prizes === 1 ? "card" : "cards"}`}
            accessibilityHint={
              controlsLive ? "Tap to take a prize. Long press to put one back." : undefined
            }
            disabled={!controlsLive}
            delayLongPress={LONG_PRESS_MS}
            // why: prizes run out at 0, and a put back never passes the six that were laid out.
            onPress={() => prizes > 0 && onChangePrizes(-1)}
            onLongPress={() => prizes < STANDARD_PRIZES && onChangePrizes(1)}
            style={({ pressed }) => [themed($prizes), pressed && { backgroundColor: tint(0.14) }]}
          >
            <View
              style={[$prizeGrid, { width: pip.width * 2 + pip.gap, gap: pip.gap }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {Array.from({ length: prizePips }, (_, index) => (
                <View
                  key={index}
                  testID={`pokemon-prize-pip-${index}-seat-${seatNumber}`}
                  style={[
                    $prizePip,
                    { width: pip.width, height: pip.height },
                    index < prizes
                      ? { backgroundColor: ink }
                      : [$prizePipGone, { borderColor: tint(0.45) }],
                  ]}
                />
              ))}
            </View>
          </BoardPressable>
        </View>

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
            style={[bar, themed($toastRow)]}
          >
            <Text
              testID={`pokemon-knockout-message-seat-${seatNumber}`}
              text={toastMessage(knockout)}
              size="xs"
              style={[$grow, { color: barInk }]}
            />
            {undoLands && controlsLive ? (
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

      {dice && diceCovers ? (
        <DiceSeatOverlay
          seatNumber={seatNumber}
          playerName={playerName}
          color={color}
          foreground={ink}
          contentRotation={contentRotation}
          compact={cramped}
          dice={dice}
        />
      ) : null}
      {diceChips?.length && dice?.onClearChip && !dice.view && !sheetMode ? (
        <DiceChips
          seatNumber={seatNumber}
          playerName={playerName}
          foreground={ink}
          compact={cramped}
          contentRotation={contentRotation}
          cardSize={cardSize}
          top={padding + insets.top + clearance.top}
          left={padding + insets.left + clearance.left}
          chips={diceChips}
          onClear={dice.onClearChip}
        />
      ) : null}
      {sheetMode && canEdit ? (
        <PokemonSheet
          seatNumber={seatNumber}
          liftsBoard={touchesBottomEdge}
          color={color}
          rotation={contentRotation}
          cardWidth={cardSize.width}
          cardHeight={cardSize.height}
          insets={insets}
          clearance={clearance}
          compact={cramped}
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

type BenchFocus = {
  restartKey: number
  switchLabel: string
  onSwitchIn: () => void
}

/** why: one hero serves the Active and a focused bench Pokémon, so damage works the same way on both; the bench variant adds the switch action and a bar that drains until the Active returns. */
function PokemonHero({
  identity,
  seatNumber,
  pokemon,
  ink,
  fontSize,
  compact,
  step,
  interactive,
  editRef,
  bench,
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
  editRef: (node: View | null) => void
  bench?: BenchFocus
  onDamage: (delta: number) => void
  onEdit: () => void
}) {
  const { themed } = useAppTheme()
  const remaining = remainingHp(pokemon)
  const name = pokemonName(pokemon)
  const slotLabel = bench ? `Bench, ${name}` : name
  const onInk = accessibleForeground(ink)
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
                accessibilityLabel={`${identity}, ${slotLabel}, ${delta > 0 ? `add ${delta} damage` : `heal ${Math.abs(delta)}`}`}
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
          accessibilityLabel={`${identity}, ${slotLabel}, ${remaining} HP left of ${pokemon.hp}, ${pokemon.damage} damage`}
          accessibilityLiveRegion="polite"
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
          style={[themed($hp), { fontSize, lineHeight: getLifeLineHeight(fontSize), color: ink }]}
        />
        <View style={themed($captionRow)} pointerEvents="box-none">
          {bench ? (
            <Text
              testID={`pokemon-hero-bench-tag-seat-${seatNumber}`}
              text="BENCH"
              size="xxs"
              weight="medium"
              style={[$tag, { color: ink }, $dim75]}
            />
          ) : null}
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
              ref={editRef}
              testID={`pokemon-edit-active-seat-${seatNumber}`}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${name}`}
              hitSlop={8}
              onPress={onEdit}
              style={({ pressed }) => [
                themed($inlineAction),
                compact && $inlineActionCramped,
                pressed && $pressed,
              ]}
            >
              <Text text="Edit" size="xxs" weight="medium" style={[{ color: ink }, $dim75]} />
            </BoardPressable>
          ) : null}
          {bench && interactive ? (
            <BoardPressable
              testID={`pokemon-switch-in-seat-${seatNumber}`}
              accessibilityRole="button"
              accessibilityLabel={`${bench.switchLabel}, ${name} becomes Active`}
              hitSlop={6}
              onPress={bench.onSwitchIn}
              style={({ pressed }) => [
                themed($switchIn),
                compact && $inlineActionCramped,
                { backgroundColor: ink },
                pressed && $pressed,
              ]}
            >
              <Text text={bench.switchLabel} size="xxs" weight="bold" style={{ color: onInk }} />
            </BoardPressable>
          ) : null}
        </View>
        {bench ? (
          <DrainBar ink={ink} restartKey={bench.restartKey} seatNumber={seatNumber} />
        ) : null}
      </View>
    </View>
  )
}

function DrainBar({
  ink,
  restartKey,
  seatNumber,
}: {
  ink: string
  restartKey: number
  seatNumber: number
}) {
  const reducedMotion = useReducedMotion()
  const left = useSharedValue(1)
  useEffect(() => {
    cancelAnimation(left)
    left.value = 1
    if (reducedMotion === false)
      left.value = withTiming(0, { duration: FOCUS_MS, easing: Easing.linear })
    return () => cancelAnimation(left)
  }, [left, reducedMotion, restartKey])
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: left.value }] }))
  return (
    <View
      testID={`pokemon-focus-drain-seat-${seatNumber}`}
      style={[$drainTrack, { backgroundColor: overlayTint(ink, 0.2) }]}
    >
      <Animated.View style={[$drainFill, { backgroundColor: ink }, fill]} />
    </View>
  )
}

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
  focused,
  triggerRef,
  onPress,
  onLongPress,
}: {
  pokemon: PokemonInPlay
  ink: string
  compact?: boolean
  interactive: boolean
  promotes: boolean
  focused: boolean
  triggerRef: (node: View | null) => void
  onPress: () => void
  onLongPress: () => void
}) {
  const { themed } = useAppTheme()
  const name = pokemonName(pokemon)
  const remaining = remainingHp(pokemon)
  const longPressHandled = useRef(false)
  return (
    <BoardPressable
      ref={triggerRef}
      testID={`pokemon-bench-${pokemon.id}`}
      accessibilityRole={interactive ? "button" : undefined}
      accessibilityLabel={`Bench, ${name}, ${remaining} of ${pokemon.hp} HP, ${pokemon.damage} damage`}
      accessibilityHint={
        interactive
          ? promotes
            ? "Tap to make Active, or edit."
            : "Tap to count damage on it or switch it in, or edit."
          : undefined
      }
      accessibilityState={interactive ? { selected: focused } : undefined}
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
        themed($benchChip),
        { borderColor: overlayTint(ink, focused ? 1 : 0.3) },
        focused && $focusedChip,
        pressed && { backgroundColor: overlayTint(ink, 0.14) },
      ]}
    >
      <Text text={name} size="xxs" numberOfLines={1} style={[$chipName, { color: ink }, $dim85]} />
      <Text
        testID={`pokemon-bench-hp-${pokemon.id}`}
        text={String(remaining)}
        weight="bold"
        numberOfLines={1}
        style={[themed(compact ? $compactChipHp : $chipHp), { color: ink }]}
      />
      <View style={$chipPips} pointerEvents="none">
        {Array.from({ length: pokemon.prizes }, (_, index) => (
          <View key={index} style={[$chipPip, { backgroundColor: ink }]} />
        ))}
      </View>
      {/* why: the bar under the chip shows how much HP is left at a glance, since the number alone does not say how big the Pokémon is. */}
      <View
        pointerEvents="none"
        style={[
          $chipBar,
          { backgroundColor: ink, width: `${Math.round((100 * remaining) / pokemon.hp)}%` },
        ]}
      />
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
const $pressed: ViewStyle = { opacity: 0.6 }
const $shrink: ViewStyle = { flexShrink: 1 }
const $tag: TextStyle = { letterSpacing: 0.6 }
const $inlineActionCramped: ViewStyle = { minHeight: 18 }
const $liveRegion: TextStyle = { position: "absolute", width: 1, height: 1, opacity: 0 }
const $slot: ViewStyle = { borderWidth: 1.5, borderStyle: "dashed" }
const $focusedChip: ViewStyle = { borderWidth: 2 }
const $chipName: TextStyle = { alignSelf: "stretch" }
const $chipPips: ViewStyle = {
  position: "absolute",
  right: 5,
  bottom: 6,
  flexDirection: "row",
  gap: 2,
}
const $chipPip: ViewStyle = { width: 5, height: 7, borderRadius: 1, opacity: 0.8 }
const $chipBar: ViewStyle = { position: "absolute", left: 0, bottom: 0, height: 3, opacity: 0.85 }
const $prizePip: ViewStyle = { borderRadius: 2 }
const $prizePipGone: ViewStyle = { borderWidth: 1.5 }
const $prizeGrid: ViewStyle = { flexDirection: "row", flexWrap: "wrap" }
// why: the name sits with the seat mark in the bottom-left corner on every board, and the prizes take the other corner.
const $identity: ViewStyle = { flex: 1, minWidth: 0, alignItems: "flex-start" }
const $drainTrack: ViewStyle = {
  alignSelf: "stretch",
  height: 2,
  marginTop: 4,
  marginHorizontal: 48,
  overflow: "hidden",
}
const $drainFill: ViewStyle = { width: "100%", height: "100%", transformOrigin: "left" }

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
const $chip: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  minWidth: 0,
  maxWidth: 180,
  borderRadius: 10,
  borderWidth: StyleSheet.hairlineWidth,
  paddingHorizontal: spacing.xxs,
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
})
const $benchChip: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "flex-start",
  justifyContent: "flex-start",
  paddingTop: spacing.xxxs,
  paddingHorizontal: spacing.xxs + 2,
})
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
const $placeActive: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  borderWidth: 2,
  borderStyle: "dashed",
  borderRadius: 16,
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.xxxs,
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
const $switchIn: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.xs,
  minHeight: 24,
  borderRadius: 7,
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
  alignItems: "center",
  justifyContent: "flex-start",
})
const $prizes: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  paddingHorizontal: spacing.xs,
  paddingVertical: spacing.xxs,
  borderRadius: 12,
  maxWidth: "100%",
})
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
