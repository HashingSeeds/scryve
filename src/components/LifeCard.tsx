import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import type {
  LayoutChangeEvent,
  LayoutRectangle,
  StyleProp,
  TextStyle,
  ViewStyle,
} from "react-native"
import { AccessibilityInfo, Platform, StyleSheet, View } from "react-native"
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LayoutAnimationConfig,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated"

import type { AttackBox } from "@/features/game/commanderAttack"
import { counterValueLabel, playSystemRules, type PlaySystemId } from "@/features/game/playSystems"
import type { CommanderBoardPlayer, LifeDelta, PlayerId } from "@/features/game/types"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { structurallyEqual } from "@/utils/structurallyEqual"
import { startTapTiming } from "@/utils/tapTiming"
import { motionDuration, useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import { CommanderClaimBanner, type CommanderClaim } from "./CommanderClaimBanner"
import {
  ATTACK_SHADE,
  DAMAGE_INK,
  OTHERS_INK,
  CommanderDamageCardControls,
  shadowReached,
  SWAP_MS,
  CommanderTakeoverBackdrop,
  SHADOW_INK,
  TAKEOVER_LAYERS,
  useCommanderTakeover,
  type ArmedCommander,
  type CommanderAttacker,
  type CommanderDamageCardMode,
  attackerLayout,
  attackerLifeSlot,
} from "./CommanderDamageCardControls"
import {
  commanderTakeover,
  lifeInk,
  OUT_CAUSE,
  OUT_CAUSE_GAP,
  OUT_CAUSE_GLYPH,
  OUT_LABEL,
  outInk,
  stackedReadout,
  type CommanderBoardSeat,
  type CommanderFacing,
  type CommanderReach,
} from "./commanderDamageLayout"
import { CommanderStrip, commanderGridShown, commanderStripCorner } from "./CommanderStrip"
import {
  CounterChips,
  DICE_ONLY_SEAT,
  seatBagSize,
  TableGlyph,
  type SeatTable,
} from "./CounterChips"
import { DiceChips } from "./DiceChips"
import { diceCoversSeat, DiceSeatOverlay, type LifeCardDice } from "./DiceSeatOverlay"
import { mixColorsInLinearLight } from "./GameMenuButtonShape"
import { CalculatorGlyph, LifeCalculator } from "./LifeCalculator"
import { LifeControls, useRecentDelta } from "./LifeControls"
import { LifeEditor } from "./LifeEditor"
import {
  seatCardRadius,
  COMPACT_LIFE_FONT_SIZE,
  COMPACT_LIFE_TARGET_SIZE,
  getLifeFontSizeThatFits,
  getLifeLineHeight,
  getLifeTargetTextSpace,
  LIFE_FONT_SIZE,
  LIFE_MAX_FONT_SCALE,
  LIFE_GLYPH_LINE_HEIGHT,
  LIFE_TARGET_SIZE,
  clearOfCutout,
  cornerOffset,
  cornerStep,
  useCornerSlide,
  CUTOUT_ENDS_INSIDE_INSET,
  SCREEN_CORNER_CLEARANCE,
  type LifeCardContentInsets,
  type LifeCardContentRotation,
  type LifeCardScreenEdges,
  type LifeCardMenuCorner,
  type LifeCardMenuEdge,
} from "./playerCardTypes"
import { MarkArt, PlayerMark } from "./PlayerMark"
import {
  SeatIdentity,
  seatIdentityBottomGap,
  seatIdentityLabel,
  seatIdentityMetrics,
  seatMarkArt,
} from "./SeatIdentity"
import { Text } from "./Text"
import { TurnChip, TurnChipLayer, UndoPassChip } from "./TurnChip"
import { useSeatDimmed } from "./TurnSpotlight"
import { useTurnStyle } from "./turnStyle"
import { isProMarkShape, shapeForSeat, type PlayerMarkShape } from "../../convex/lib/appearance"

const LIFE_FADE_MS = SWAP_MS

export type { LifeCardContentRotation } from "./playerCardTypes"

export type LifeCardCommanderDamage = {
  players?: readonly CommanderBoardPlayer[]
  ownerPlayerId: PlayerId
  seats: readonly CommanderBoardSeat[]
  incoming: Record<PlayerId, number>
  split?: Record<PlayerId, readonly number[]>
  lethal: number
  armedPlayerId?: PlayerId | null
  onPressSword?: () => void
  attackerName?: string
  attacker?: CommanderAttacker
  commanders?: readonly ArmedCommander[]
  onPower?: (power: number, index: number) => void
  facing?: CommanderFacing
  reach?: CommanderReach
  dealt?: number
  takeBack?: number
  othersStep?: number
  othersTakeBack?: number
  /** why: how much of this attack's damage the defender's life already shows, so its readout can name the life it started from. */
  applied?: number
  /** why: the attacker's Others box, damage from its other creatures that takes life but never counts toward commander lethal. */
  others?: number
  onOthers?: (power: number) => void
  othersShown?: boolean
  othersSitting?: boolean
  onSit?: (box: AttackBox) => void
  othersLanded?: number
  onHit?: () => void
  onUndo?: () => void
  acted?: boolean
  armBar?: { stagedTargets: number; onSend: () => void }
  pendingClaims?: readonly CommanderClaim[]
}

export type LifeCardOut = { reason: string } & (
  | { cause: "life" }
  | { cause: "commanderDamage"; amount: number; attacker?: CommanderAttacker }
  | { cause: "counter"; amount: number; counterId: string }
)

export interface LifeCardProps {
  playerId?: string
  playerName: string
  seatNumber: number
  shape?: PlayerMarkShape
  foil?: boolean
  life: number
  color: string
  compact?: boolean
  boardRotation?: number
  contentRotation?: LifeCardContentRotation
  contentInsets?: LifeCardContentInsets
  screenEdges?: LifeCardScreenEdges
  menuCorner?: LifeCardMenuCorner
  menuEdgeCenter?: LifeCardMenuEdge
  lifeFontSizeFor?: (digits: number) => number | undefined
  system?: PlaySystemId
  lifeStep?: number
  disabled?: boolean
  ownership?: "owned" | "unowned" | "disabled"
  staleSince?: number
  commanderDamage?: LifeCardCommanderDamage
  out?: LifeCardOut
  seatTable?: SeatTable
  dice?: LifeCardDice
  onPlayStart?: () => void
  onChange: (delta: LifeDelta) => void
  style?: StyleProp<ViewStyle>
}

/** why: the board re-renders on every sync step and server update; a seat only needs to when its own props change. PlayerGrid rebuilds plain props (insets, styles, commander data) each render, so they compare by content, and it keeps every callback's identity stable. */
export const LifeCard = memo(function LifeCard({
  playerId,
  playerName,
  seatNumber,
  shape,
  foil,
  life,
  color,
  compact,
  boardRotation = 0,
  contentRotation = 0,
  contentInsets,
  screenEdges,
  menuCorner,
  menuEdgeCenter,
  lifeFontSizeFor,
  system,
  lifeStep,
  disabled,
  ownership,
  staleSince,
  commanderDamage,
  dice,
  out,
  seatTable,
  onPlayStart,
  onChange,
  style,
}: LifeCardProps) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const turnStyle = useTurnStyle()
  // why: dims only the fill, so life totals stay full white on every seat.
  const dimmed = useSeatDimmed(playerId)
  const fill = dimmed ? mixColorsInLinearLight(color, colors.board.background, 0.55) : color
  const commanderSeat = !!commanderDamage
  const diceCovers = diceCoversSeat(dice)
  const diceChips = dice?.chips
  const turnChip = diceChips?.flatMap((chip) => (chip.kind === "turn" ? [chip.state] : []))[0]
  const undoPass = diceChips?.flatMap((chip) => (chip.kind === "undoPass" ? [chip.onUndo] : []))[0]
  const foreground = accessibleForeground(color)
  const reducedMotion = useReducedMotion()
  const cornerSlide = useCornerSlide()
  const lifeFadeDuration = motionDuration(reducedMotion, LIFE_FADE_MS)
  const locked = !!out && out.cause !== "life"
  const frozen = disabled || locked
  const contentRotationStyle: TextStyle | undefined = contentRotation
    ? { transform: [{ rotate: `${contentRotation}deg` }] }
    : undefined
  const displayName = playerName.trim() || translate("board:seat.unnamedPlayer")
  const identity = seatIdentityLabel(seatNumber, playerName)
  const lifeTargetSize = compact ? COMPACT_LIFE_TARGET_SIZE : LIFE_TARGET_SIZE
  const [preview, setPreview] = useState(0)
  const stopTapTiming = useRef<() => void>(undefined)
  const showPreview = useCallback((delta: number) => {
    stopTapTiming.current = delta === 0 ? undefined : startTapTiming()
    setPreview(delta)
  }, [])
  useLayoutEffect(() => {
    stopTapTiming.current?.()
    stopTapTiming.current = undefined
  }, [preview])
  const shownLife = life + preview
  const shownDigits = String(shownLife).length
  const fontSizeFor = (digits: number) =>
    lifeFontSizeFor?.(digits) ??
    Math.min(
      compact ? COMPACT_LIFE_FONT_SIZE : LIFE_FONT_SIZE,
      getLifeFontSizeThatFits({
        availableWidth: getLifeTargetTextSpace(lifeTargetSize),
        availableHeight: getLifeTargetTextSpace(lifeTargetSize),
        digits,
        fontScale: 1,
      }),
    )
  const resolvedLifeFontSize = fontSizeFor(shownDigits)
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 })
  const sidewaysContent = Math.abs(contentRotation) === 90
  // why: a sideways corner layer is sized from the card, so laid out before the card measures, the row's corner slide carries the name across the seat into place.
  const cornerMeasured = !sidewaysContent || cardSize.width > 0
  const [identityRowAt, setIdentityRowAt] = useState<{ x: number; y: number }>()
  const [fullIdentityWidth, setFullIdentityWidth] = useState(0)
  const [rowChipWidth, setRowChipWidth] = useState(0)
  const [stripBounds, setStripBounds] = useState<LayoutRectangle | null>(null)

  const [editorOpen, setEditorOpen] = useState(false)
  const calculator = !!playSystemRules(system).counter.calculator
  // why: while a counter sheet covers the card, the card's own controls leave touch, keyboard focus, and the accessibility tree; accessibilityViewIsModal only isolates on iOS.
  const [tableSheetOpen, setTableSheetOpen] = useState(false)
  const [seatedPlayerId, setSeatedPlayerId] = useState(playerId)
  if (seatedPlayerId !== playerId) {
    setSeatedPlayerId(playerId)
    setPreview(0)
    setEditorOpen(false)
    setTableSheetOpen(false)
  }
  useEffect(() => {
    if (tableSheetOpen || editorOpen) onPlayStart?.()
  }, [editorOpen, onPlayStart, tableSheetOpen])
  const recentDelta = useRecentDelta(life, playerId)
  const announced = useRef({ life, playerId })
  useEffect(() => {
    const before = announced.current
    announced.current = { life, playerId }
    if (before.life === life || before.playerId !== playerId) return
    if (Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(
        translate("board:lifeCard.now", { identity, value: counterValueLabel(system, life) }),
      )
    }
  }, [identity, life, playerId, system])

  const ownershipLabel = ownership ? translate(`board:seat.ownership.${ownership}`) : undefined
  const armedCommanderId = commanderDamage?.armedPlayerId
  const attacked =
    !!commanderDamage && !!armedCommanderId && armedCommanderId !== commanderDamage.ownerPlayerId
  // why: a seat already out sits an attack out; one knocked out during it stays a target so the lethal hit can be undone.
  const [outWhenArmed, setOutWhenArmed] = useState(() => (out ? armedCommanderId : undefined))
  const [armedSeen, setArmedSeen] = useState(armedCommanderId)
  if (armedSeen !== armedCommanderId) {
    setArmedSeen(armedCommanderId)
    setOutWhenArmed(out ? armedCommanderId : undefined)
  }
  const sittingOut = attacked && outWhenArmed === armedCommanderId
  const defending = attacked && !sittingOut
  const armedCommanders = commanderDamage?.commanders ?? [
    { power: 1, total: (armedCommanderId && commanderDamage?.incoming[armedCommanderId]) || 0 },
  ]
  const causeGlyphShown =
    out?.cause === "counter" || !!(out?.cause === "commanderDamage" && out.attacker)
  const incoming = armedCommanders.reduce((sum, { landed = 0 }) => sum + landed, 0)
  const othersIncoming = commanderDamage?.othersLanded ?? 0
  const attackParts =
    defending && commanderDamage && (incoming || othersIncoming)
      ? {
          from: life + (commanderDamage.applied ?? 0),
          commander: incoming,
          others: othersIncoming,
        }
      : undefined
  // why: the line fades out with the last attack's numbers rather than going blank as it goes.
  const lastAttack = useRef(attackParts)
  if (attackParts) lastAttack.current = attackParts
  const shownAttack = attackParts ?? lastAttack.current
  const attackLine = shownAttack
    ? [
        shownAttack.from,
        ...(shownAttack.commander ? [shownAttack.commander] : []),
        ...(shownAttack.others ? [shownAttack.others] : []),
      ].join(" − ")
    : ""
  const stacked = stackedReadout(resolvedLifeFontSize, shownDigits, attackLine.length)
  const lifeRise = lifeInk(resolvedLifeFontSize, shownDigits).y
  const stack = useSharedValue(0)
  const landed = !!attackParts
  useEffect(() => {
    stack.value = withTiming(landed ? 1 : 0, {
      duration: motionDuration(reducedMotion, STACK_MS),
      easing: Easing.out(Easing.cubic),
    })
  }, [landed, reducedMotion, stack])
  const lifeStackStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: stack.value * (lifeRise + stacked.lifeShift - lifeRise * stacked.scale),
      },
      { scale: 1 - stack.value * (1 - stacked.scale) },
    ],
  }))
  const incomingStyle = useAnimatedStyle(() => ({
    opacity: stack.value,
    transform: [{ translateY: lifeRise + stacked.lineShift + (1 - stack.value) * 6 }],
  }))
  const readoutInk = !out
    ? lifeInk(resolvedLifeFontSize, shownDigits)
    : out.cause === "life"
      ? outInk({
          fontSize: resolvedLifeFontSize,
          digits: shownDigits,
          below: { ...OUT_LABEL, chars: translate("board:lifeCard.outLabel").length },
        })
      : outInk({
          fontSize: resolvedLifeFontSize,
          digits: shownDigits,
          below: {
            ...OUT_CAUSE,
            chars: String(out.amount).length,
            lead: causeGlyphShown ? OUT_CAUSE_GLYPH + OUT_CAUSE_GAP : 0,
          },
        })
  const takeover =
    defending && cardSize.width > 0
      ? commanderTakeover({
          card: cardSize,
          rotation: contentRotation,
          lifeFontSize: resolvedLifeFontSize,
          ink: readoutInk,
          reach: commanderDamage?.reach,
        })
      : undefined
  const floodedBy = useCommanderTakeover(takeover, {
    id: armedCommanderId,
    color: commanderDamage?.attacker?.color,
  })
  // why: an attacker typing a power hides its own life total, which sits where the in-card keypad opens. A new attack starts with it shown.
  const [powerEditing, setPowerEditing] = useState(false)
  if (powerEditing && armedCommanderId !== commanderDamage?.ownerPlayerId) setPowerEditing(false)
  const grid =
    stripBounds && cardSize.width > 0
      ? gridReach(stripBounds, cardSize, sidewaysContent)
      : undefined
  const commanderCardMode: CommanderDamageCardMode | undefined =
    commanderDamage && armedCommanderId === commanderDamage.ownerPlayerId
      ? {
          kind: "source",
          playerName: displayName,
          submit: commanderDamage.armBar?.stagedTargets ? "send" : "done",
          mark: { color, shape, seatNumber },
          commanders: armedCommanders,
          others: commanderDamage.others ?? 0,
          onOthers: commanderDamage.onOthers ?? (() => {}),
          othersShown: commanderDamage.othersShown !== false,
          othersSitting: !!commanderDamage.othersSitting,
          onSit: commanderDamage.onSit ?? (() => {}),
          acted: !!commanderDamage.acted,
          onPower: commanderDamage.onPower ?? (() => {}),
          onEditing: setPowerEditing,
          grid,
          onSubmit: commanderDamage.armBar?.onSend ?? commanderDamage.onPressSword ?? (() => {}),
        }
      : commanderDamage && defending
        ? {
            kind: "target",
            attackerName:
              commanderDamage.attackerName ?? translate("board:commander.unknownAttacker"),
            attacker: commanderDamage.attacker,
            commanders: armedCommanders,
            lethal: commanderDamage.lethal,
            facing: commanderDamage.facing ?? {},
            stripCorner: commanderStripCorner(contentRotation),
            takeover,
            wave: floodedBy.wave,
            acted: !!commanderDamage.acted,
            dealt: commanderDamage.dealt ?? 0,
            takeBack: commanderDamage.takeBack ?? 0,
            othersStep: commanderDamage.othersStep ?? 0,
            othersTakeBack: commanderDamage.othersTakeBack ?? 0,
            onHit: commanderDamage.onHit ?? (() => {}),
            onUndo: commanderDamage.onUndo ?? (() => {}),
          }
        : undefined
  // why: a defender's ring and badges stay while the shadow drains, so they fade out as its edge passes the disc, mirroring how they came in.
  const lastTarget = useRef<CommanderDamageCardMode>(undefined)
  useEffect(() => {
    if (commanderCardMode)
      lastTarget.current = commanderCardMode.kind === "target" ? commanderCardMode : undefined
  })
  const shownCardMode = commanderCardMode ?? (floodedBy.takeover ? lastTarget.current : undefined)
  const attackerSide = commanderCardMode?.kind === "source"
  const commanderCovers = !!commanderCardMode && (!takeover || floodedBy.covered)
  const turnChipShown =
    !dice?.view &&
    !editorOpen &&
    !tableSheetOpen &&
    !commanderCovers &&
    !diceCovers &&
    !attackerSide
  const shownFlood = floodedBy.takeover?.flood
  // why: the strip keeps the attack's look until the flood has drained off it.
  const stripAttackerId = defending ? armedCommanderId : floodedBy.attacker?.id
  const stripAttack = stripAttackerId
    ? {
        attackerId: stripAttackerId,
        wave: floodedBy.takeover ? floodedBy.wave : undefined,
        flood: shownFlood,
      }
    : undefined
  // why: a connected game holds hits until the attacker sends them, so the lit totals read the attack's own running totals, one per partner, to move with each tap.
  const stripIncoming =
    defending && armedCommanderId && commanderDamage
      ? {
          ...commanderDamage.incoming,
          [armedCommanderId]: Math.max(...armedCommanders.map(({ total }) => total)),
        }
      : undefined
  const stripSplit =
    defending && armedCommanderId && commanderDamage
      ? { ...commanderDamage.split, [armedCommanderId]: armedCommanders.map(({ total }) => total) }
      : commanderDamage?.split
  const readoutFit = floodedBy.takeover?.fit ?? 1
  const fitFlood = readoutFit < 1 ? shownFlood : undefined
  const fitWave = floodedBy.wave
  const readoutFitStyle = useAnimatedStyle(() => {
    if (readoutFit >= 1) return { transform: [{ scale: 1 }] }
    const reached = fitFlood
      ? shadowReached(fitFlood, fitWave.value, fitFlood.discGap)
      : fitWave.value
    return { transform: [{ scale: 1 + (readoutFit - 1) * reached }] }
  })
  // why: an attacker's total shrinks into its slot under the power boxes and grows back after, one number throughout, turning regular weight once it lands. The slot keeps the attack's partner count after it ends, so the total grows back from where it sat.
  const [slotCommanders, setSlotCommanders] = useState(armedCommanders.length)
  if (attackerSide && slotCommanders !== armedCommanders.length)
    setSlotCommanders(armedCommanders.length)
  const lifeSlot =
    commanderSeat && cardSize.width > 0
      ? attackerLifeSlot(
          attackerLayout({
            space: sidewaysContent ? { width: cardSize.height, height: cardSize.width } : cardSize,
            count: slotCommanders,
            others: commanderDamage?.othersShown !== false,
            compact,
            grid,
          }),
        )
      : undefined
  const toSlot = attackerSide && !!lifeSlot
  const [lifeInSlot, setLifeInSlot] = useState(false)
  if (lifeInSlot && !toSlot) setLifeInSlot(false)
  useEffect(() => {
    if (!toSlot) return
    const landed = setTimeout(() => setLifeInSlot(true), lifeFadeDuration)
    return () => clearTimeout(landed)
  }, [toSlot, lifeFadeDuration])
  const lifeLanded = toSlot && (lifeInSlot || !lifeFadeDuration)
  const slotPose =
    toSlot && lifeSlot
      ? {
          x: -lifeSlot.belowCardCenter * Math.round(Math.sin((contentRotation * Math.PI) / 180)),
          y: lifeSlot.belowCardCenter * Math.round(Math.cos((contentRotation * Math.PI) / 180)),
          scale: lifeSlot.fontSize / resolvedLifeFontSize,
        }
      : { x: 0, y: 0, scale: 1 }
  const slotStyle = useAnimatedStyle(() => {
    if (!lifeSlot) return {}
    const timing = { duration: lifeFadeDuration, easing: Easing.out(Easing.cubic) }
    return {
      transform: [
        { translateX: withTiming(slotPose.x, timing) },
        { translateY: withTiming(slotPose.y, timing) },
        { scale: withTiming(slotPose.scale, timing) },
      ],
    }
  })
  // why: Reanimated applies a style a frame after the commit that mounts the power boxes, so with reduced motion the total takes its slot in that same commit.
  const slotAt = {
    transform: [{ translateX: slotPose.x }, { translateY: slotPose.y }, { scale: slotPose.scale }],
  }
  // why: the attacker's mark flies into its grid as the life total swaps for the power boxes, and back out after, so the grid stays up until the mark has landed home.
  const sourceFlight = useSharedValue(attackerSide ? 1 : 0)
  const [sourceLanding, setSourceLanding] = useState(false)
  useEffect(() => {
    if (attackerSide) setSourceLanding(true)
    sourceFlight.value = withTiming(
      attackerSide ? 1 : 0,
      { duration: lifeFadeDuration },
      (finished) => {
        if (finished && !attackerSide) runOnJS(setSourceLanding)(false)
      },
    )
  }, [attackerSide, lifeFadeDuration, sourceFlight])
  // why: web lets a box-none child take touches under a parent set to none, so the fading mark's whole chain turns off to leave the X its taps.
  const cornerTouches = attackerSide ? "none" : "box-none"
  const knock = useSharedValue(0)
  const defenderTotal =
    commanderCardMode?.kind === "target"
      ? commanderCardMode.commanders.reduce((sum, { total }) => sum + total, 0)
      : undefined
  const knockFacing = commanderCardMode?.kind === "target" ? commanderCardMode.facing : undefined
  const lastDefenderTotal = useRef(defenderTotal)
  useEffect(() => {
    const previous = lastDefenderTotal.current
    lastDefenderTotal.current = defenderTotal
    if (defenderTotal === undefined || previous === undefined || defenderTotal <= previous) return
    if (reducedMotion !== false) return
    knock.value = withSequence(
      withTiming(1, { duration: 95 }),
      withTiming(-0.25, { duration: 130 }),
      withTiming(0, { duration: 155 }),
    )
  }, [defenderTotal, knock, reducedMotion])
  const facingX = knockFacing?.x === "left" ? 1 : knockFacing?.x === "right" ? -1 : 0
  const facingY = knockFacing?.y === "top" ? 1 : knockFacing?.y === "bottom" ? -1 : 0
  const knockDirection = takeover?.knock ?? {
    x: facingX && facingY ? facingX / Math.SQRT2 : facingX,
    y: facingX && facingY ? facingY / Math.SQRT2 : facingY,
  }
  const knockStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: knock.value * knockDirection.x * KNOCKBACK },
      { translateY: knock.value * knockDirection.y * KNOCKBACK },
    ],
  }))
  const lifeControlsShown =
    !commanderCovers && !sittingOut && !tableSheetOpen && !diceCovers && ownership !== "unowned"
  const claims = lifeControlsShown && !editorOpen ? commanderDamage?.pendingClaims : undefined
  const calculatorButtonShown = calculator && lifeControlsShown && !editorOpen && !frozen
  const trailingButtonSize = seatBagSize(compact)
  const claimShown = !!claims?.length
  const sourceShown = attackerSide || sourceLanding
  // why: a defender keeps its strip through an attack, with the attacker's total lit, instead of moving the damage onto the card.
  const commanderStripShown =
    commanderSeat &&
    (!commanderCovers || defending || attackerSide) &&
    !tableSheetOpen &&
    !diceCovers &&
    commanderGridShown({
      players: commanderDamage.players ?? [],
      ownerPlayerId: commanderDamage.ownerPlayerId,
      incoming: commanderDamage.incoming,
      attacked: !!stripAttackerId || sourceShown,
    })
  // why: a grid grown only for an attack is mid-flight to or from the mark while the − and + fade, so only a grid that stays slides the glyph at its end.
  const stripStays =
    !!commanderDamage &&
    commanderStripShown &&
    commanderGridShown({
      players: commanderDamage.players ?? [],
      ownerPlayerId: commanderDamage.ownerPlayerId,
      incoming: commanderDamage.incoming,
      attacked: false,
    })
  const identityMetrics = seatIdentityMetrics(compact)
  const markArt = seatMarkArt(shape ?? shapeForSeat(seatNumber), compact)
  const identityCorner = seatIdentityPlacement({
    rotation: contentRotation,
    cardSize,
    gap: identityMetrics.edge,
    insets: contentInsets,
    screenEdges,
    markHeight: markArt.height,
    buttonSize: trailingButtonSize,
  })
  // why: a seat someone else holds keeps its own bag on its own device.
  const seatBag = ownership === "unowned" || frozen ? undefined : dice?.bag
  const rowCap =
    calculatorButtonShown && typeof identityCorner.rowMaxWidth === "number"
      ? Math.max(identityCorner.rowMaxWidth - trailingButtonSize - identityMetrics.gap, 0)
      : identityCorner.rowMaxWidth
  const rowTurnChip = !!turnChip && turnStyle === "row" && turnChipShown
  const rowUndo = !!undoPass && turnChipShown
  const bagReserve = seatBag ? trailingButtonSize + identityMetrics.gap : 0
  // why: on seats too short for the name and the chip, the name gives way so the chip never runs under the bag; the mark still says whose seat it is.
  const nameRetracted =
    (rowTurnChip || rowUndo) &&
    typeof rowCap === "number" &&
    fullIdentityWidth + identityMetrics.gap + rowChipWidth > rowCap - bagReserve
  const markAnchor =
    cardSize.width > 0
      ? identityMarkCenter({
          rotation: contentRotation,
          cardSize,
          left: Number(identityCorner.position.left ?? 0),
          bottom: Number(identityCorner.position.bottom ?? 0),
          art: markArt,
          size: markArt.size,
        })
      : undefined
  const nameFadeStyle = useAnimatedStyle(() => ({
    opacity: withTiming(commanderStripShown ? 0 : 1, { duration: lifeFadeDuration }),
  }))
  const seatRun = Math.abs(contentRotation) === 90 ? cardSize.height : cardSize.width
  // why: a name cut to a few letters reads worse than none, so in commander games short seats keep just their mark from the start; judged by seat length alone so seats of one size match.
  const markOnly =
    commanderSeat &&
    seatRun > 0 &&
    seatRun / 2 - identityMetrics.edge * 2 - identityMetrics.icon - identityMetrics.gap <
      MIN_NAME_ROOM
  const seatIdentity = (
    <SeatIdentity
      seatNumber={seatNumber}
      playerName={displayName}
      shape={shape}
      color={foreground}
      compact={compact}
      insetSwordColor={commanderDamage ? color : undefined}
      foil={foil && !!shape && isProMarkShape(shape)}
      staleSince={staleSince}
      markOnly={markOnly}
      nameRetracted={nameRetracted}
      markHidden={commanderStripShown}
      nameStyle={nameFadeStyle}
    />
  )

  useEffect(() => {
    if (frozen) {
      setEditorOpen(false)
    }
  }, [frozen])

  const outLabel = out && translate("board:lifeCard.out", { reason: out.reason })
  const lifeFontStyle: TextStyle = {
    fontSize: resolvedLifeFontSize,
    lineHeight: getLifeLineHeight(resolvedLifeFontSize),
  }
  const lifeTotal = (...style: StyleProp<TextStyle>[]) => (
    <Text
      testID={`life-total-seat-${seatNumber}`}
      text={String(shownLife)}
      weight={lifeLanded ? "normal" : "bold"}
      accessible
      accessibilityLabel={translate("board:counters.seatItem", {
        identity,
        label: counterValueLabel(system, life),
      })}
      accessibilityLiveRegion="polite"
      maxFontSizeMultiplier={LIFE_MAX_FONT_SCALE}
      numberOfLines={1}
      style={[themed($life), ...style, { color: foreground }]}
    />
  )

  function measureCard(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout
    setCardSize((current) =>
      current.width === width && current.height === height ? current : { width, height },
    )
  }

  return (
    <Animated.View
      testID={`life-card-seat-${seatNumber}`}
      accessibilityLabel={[ownershipLabel, outLabel]
        .filter((part): part is string => Boolean(part))
        .reduce(
          (label, part) => translate("board:counters.seatItem", { identity: label, label: part }),
          identity,
        )}
      onLayout={measureCard}
      style={[
        themed($card),
        compact && themed($compactCard),
        ownership === "disabled" && themed($disabledCard),
        staleSince !== undefined && themed($staleCard),
        { backgroundColor: fill },
        style,
        knockStyle,
      ]}
    >
      {shape && isProMarkShape(shape) && cardSize.height > 0 ? (
        <View
          testID={`pro-mark-watermark-seat-${seatNumber}`}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={proWatermarkPlacement(contentRotation, cardSize)}
        >
          <MarkArt
            shape={shape}
            color={foreground}
            size={(Math.abs(contentRotation) === 90 ? cardSize.width : cardSize.height) * 0.8}
          />
        </View>
      ) : null}
      {floodedBy.takeover ? (
        <CommanderTakeoverBackdrop
          seatNumber={seatNumber}
          takeover={floodedBy.takeover}
          wave={floodedBy.wave}
          cardSize={cardSize}
          floodColor={ATTACK_SHADE}
          defenderColor={color}
        />
      ) : null}
      <Animated.View
        pointerEvents={commanderCardMode || diceCovers ? "none" : "box-none"}
        accessibilityElementsHidden={tableSheetOpen || diceCovers}
        importantForAccessibility={tableSheetOpen || diceCovers ? "no-hide-descendants" : "auto"}
        style={[
          themed($content),
          readoutFitStyle,
          floodedBy.takeover && $aboveFlood,
          sourceShown && $aboveAttackerControls,
        ]}
      >
        <Animated.View
          testID={`life-readout-seat-${seatNumber}`}
          pointerEvents="none"
          style={[
            themed($readout),
            lifeFadeDuration ? slotStyle : slotAt,
            powerEditing && $powerEditingHidden,
          ]}
        >
          {out?.cause === "life" ? (
            <View style={[$outReadout, contentRotationStyle]}>
              {lifeTotal(lifeFontStyle)}
              <Text
                testID={`life-out-label-seat-${seatNumber}`}
                text={translate("board:lifeCard.outLabel")}
                weight="bold"
                accessible={false}
                maxFontSizeMultiplier={LIFE_MAX_FONT_SCALE}
                style={[themed($outLabel), { color: foreground }]}
              />
            </View>
          ) : out ? (
            <View style={[$outReadout, contentRotationStyle]}>
              {lifeTotal(lifeFontStyle)}
              <View testID={`life-out-cause-seat-${seatNumber}`} style={$outCause}>
                {out.cause === "counter" ? (
                  <TableGlyph id={out.counterId} size={OUT_CAUSE_GLYPH} color={foreground} />
                ) : out.attacker ? (
                  <PlayerMark
                    seatNumber={out.attacker.seatNumber}
                    shape={out.attacker.shape}
                    color={foreground}
                    insetSwordColor={color}
                    size={OUT_CAUSE_GLYPH}
                  />
                ) : null}
                <Text
                  testID={`life-out-amount-seat-${seatNumber}`}
                  text={String(out.amount)}
                  weight="bold"
                  accessible={false}
                  maxFontSizeMultiplier={1}
                  numberOfLines={1}
                  style={[$outAmount, { color: foreground }]}
                />
              </View>
            </View>
          ) : (
            <View
              testID={`life-upright-seat-${seatNumber}`}
              style={[$outReadout, contentRotationStyle]}
            >
              <Animated.View style={[$outReadout, lifeStackStyle]}>
                {lifeTotal(lifeFontStyle)}
              </Animated.View>
              {shownAttack ? (
                <Animated.View pointerEvents="none" style={[$incomingSlot, incomingStyle]}>
                  <Text
                    testID={`life-incoming-seat-${seatNumber}`}
                    weight="bold"
                    accessible={false}
                    maxFontSizeMultiplier={1}
                    numberOfLines={1}
                    style={[$outAmount, { color: foreground }]}
                  >
                    {String(shownAttack.from)}
                    {shownAttack.commander ? (
                      <Text
                        text={` − ${shownAttack.commander}`}
                        weight="bold"
                        maxFontSizeMultiplier={1}
                        style={[$outAmount, $hurtInk, { color: DAMAGE_INK }]}
                      />
                    ) : null}
                    {shownAttack.others ? (
                      <Text
                        text={` − ${shownAttack.others}`}
                        weight="bold"
                        maxFontSizeMultiplier={1}
                        style={[$outAmount, $hurtInk, { color: OTHERS_INK }]}
                      />
                    ) : null}
                  </Text>
                </Animated.View>
              ) : null}
            </View>
          )}
        </Animated.View>
      </Animated.View>
      {out ? (
        <View
          testID={`life-eliminated-seat-${seatNumber}`}
          pointerEvents="none"
          style={[themed($eliminated), locked && $lockedOverlay]}
        />
      ) : null}
      {/* why: the − and + fade out as commander mode or a sheet takes the card and back in after, but not when the board first draws. */}
      <LayoutAnimationConfig skipEntering>
        {shownCardMode ? (
          <CommanderDamageCardControls
            seatNumber={seatNumber}
            playerName={displayName}
            foreground={foreground}
            contentRotation={contentRotation}
            contentInsets={contentInsets}
            menuCorner={menuCorner}
            compact={compact}
            mode={shownCardMode}
            draining={!commanderCardMode}
          />
        ) : null}
        {lifeControlsShown ? (
          <Animated.View
            entering={lifeFadeDuration ? FadeIn.duration(lifeFadeDuration) : undefined}
            exiting={lifeFadeDuration ? FadeOut.duration(lifeFadeDuration) : undefined}
            pointerEvents="box-none"
            style={[StyleSheet.absoluteFill, out?.cause === "life" && $aboveOutOverlay]}
          >
            <LifeControls
              playerName={displayName}
              seatNumber={seatNumber}
              disabled={disabled}
              lockedReason={locked ? outLabel : undefined}
              reducedMotion={reducedMotion}
              contrastCheckedForeground={foreground}
              compact={compact}
              contentRotation={contentRotation}
              system={system}
              lifeStep={lifeStep}
              recentDelta={recentDelta}
              pendingDelta={preview}
              lifeFontSize={resolvedLifeFontSize}
              lifeDigits={shownDigits}
              obstacle={
                stripStays && stripBounds
                  ? { edge: CONTENT_LEFT_EDGE[contentRotation], bounds: stripBounds }
                  : undefined
              }
              totalInk={readoutInk}
              onChange={onChange}
              onPreview={showPreview}
              onOpenEditor={() => setEditorOpen(true)}
            />
          </Animated.View>
        ) : null}
      </LayoutAnimationConfig>
      {dice && diceCovers ? (
        <DiceSeatOverlay
          seatNumber={seatNumber}
          playerName={displayName}
          color={color}
          foreground={foreground}
          contentRotation={contentRotation}
          compact={compact}
          dice={dice}
        />
      ) : null}
      {commanderDamage && commanderStripShown ? (
        <CommanderStrip
          seatNumber={seatNumber}
          identity={identity}
          ownerPlayerId={commanderDamage.ownerPlayerId}
          players={commanderDamage.players ?? []}
          seats={commanderDamage.seats}
          incoming={stripIncoming ?? commanderDamage.incoming}
          split={stripSplit}
          lethal={commanderDamage.lethal}
          foreground={stripAttack ? SHADOW_INK : foreground}
          cardColor={color}
          contentRotation={contentRotation}
          contentInsets={contentInsets}
          screenEdges={screenEdges}
          compact={compact}
          attack={stripAttack}
          source={
            sourceShown
              ? {
                  active: attackerSide,
                  flight: sourceFlight,
                  submit: commanderCardMode?.kind === "source" ? commanderCardMode.submit : "done",
                  acted: !!commanderDamage.acted,
                  onSubmit:
                    commanderCardMode?.kind === "source" ? commanderCardMode.onSubmit : () => {},
                }
              : undefined
          }
          markAnchor={markAnchor}
          disabled={!!disabled || sittingOut}
          onPress={commanderDamage.onPressSword}
          onBoundsChange={setStripBounds}
        />
      ) : null}
      {cornerMeasured && (!commanderCovers || attackerSide) && !tableSheetOpen && !dice?.view ? (
        // why: switching an old game to another layout turns a mounted seat from sideways to upright, and the reused layer hid the identity on iOS; a fresh layer per rotation does not.
        <Animated.View
          key={contentRotation}
          testID={`life-corner-layer-seat-${seatNumber}`}
          pointerEvents={cornerTouches}
          aria-hidden={attackerSide}
          accessibilityElementsHidden={attackerSide}
          importantForAccessibility={attackerSide ? "no-hide-descendants" : "auto"}
          style={[
            themed($cornerLayer),
            identityCorner.layer,
            { transform: [{ rotate: `${contentRotation}deg` }] },
          ]}
        >
          <Animated.View
            testID={`life-identity-row-seat-${seatNumber}`}
            pointerEvents={cornerTouches}
            layout={cornerSlide}
            onLayout={({ nativeEvent: { layout } }) =>
              setIdentityRowAt((current) =>
                current?.x === layout.x && current.y === layout.y
                  ? current
                  : { x: layout.x, y: layout.y },
              )
            }
            style={[
              $cornerRow,
              {
                // why: the row is the trimmed mark's height so a taller name, status, or chip centers on the mark instead of lifting it off the spot the commander exit mark takes.
                height: markArt.height,
                gap: identityMetrics.gap,
                left: identityCorner.position.left,
                bottom: identityCorner.position.bottom,
                maxWidth: rowCap,
              },
            ]}
          >
            <View
              testID={`life-identity-seat-${seatNumber}`}
              onLayout={({ nativeEvent: { layout } }) => {
                if (!nameRetracted) setFullIdentityWidth(layout.width)
              }}
              // why: the corner layer draws above the grid, so the hidden mark and name would swallow touches meant for the grid's lower chips.
              pointerEvents={commanderStripShown ? "none" : cornerTouches}
              accessibilityElementsHidden={diceCovers}
              importantForAccessibility={diceCovers ? "no-hide-descendants" : "auto"}
              style={[
                $cornerIdentity,
                // why: the half-run cap leaves the far corner to the seat's bag; without it the name runs to the row's limit.
                commanderSeat && { maxWidth: identityCorner.position.maxWidth },
              ]}
            >
              {commanderDamage ? (
                <BoardPressable
                  testID={`commander-mark-seat-${seatNumber}`}
                  accessibilityRole="button"
                  accessibilityLabel={translate(
                    staleSince !== undefined
                      ? "board:commander.assignFromStale"
                      : "board:commander.assignFrom",
                    { identity },
                  )}
                  accessibilityState={{ disabled: !!disabled || sittingOut }}
                  accessible={!commanderStripShown}
                  accessibilityElementsHidden={commanderStripShown}
                  importantForAccessibility={commanderStripShown ? "no-hide-descendants" : "auto"}
                  disabled={disabled || sittingOut || commanderStripShown}
                  hitSlop={8}
                  onPress={commanderDamage.onPressSword}
                  style={({ pressed }) => pressed && { opacity: 0.72 }}
                >
                  {seatIdentity}
                </BoardPressable>
              ) : (
                <View pointerEvents="none">{seatIdentity}</View>
              )}
            </View>
            {diceChips?.length &&
            dice?.onPressChip &&
            !dice.view &&
            !editorOpen &&
            !attackerSide ? (
              <DiceChips
                seatNumber={seatNumber}
                playerName={displayName}
                foreground={foreground}
                compact={compact}
                chips={diceChips}
                onPress={dice.onPressChip}
                bloomCenterInRow={
                  identityRowAt && cardSize.width > 0
                    ? {
                        x:
                          (sidewaysContent ? cardSize.height : cardSize.width) / 2 -
                          identityRowAt.x,
                        y:
                          (sidewaysContent ? cardSize.width : cardSize.height) / 2 -
                          identityRowAt.y,
                      }
                    : undefined
                }
              />
            ) : null}
            {rowTurnChip || rowUndo ? (
              <Animated.View
                testID={`turn-row-chip-seat-${seatNumber}`}
                layout={cornerSlide}
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(140)}
                onLayout={({ nativeEvent: { layout } }) => setRowChipWidth(layout.width)}
              >
                {turnChip && rowTurnChip ? (
                  <TurnChip
                    state={turnChip}
                    seatNumber={seatNumber}
                    foreground={foreground}
                    compact={compact}
                    filled
                  />
                ) : null}
                {undoPass && rowUndo ? (
                  <UndoPassChip
                    seatNumber={seatNumber}
                    foreground={foreground}
                    compact={compact}
                    onUndo={undoPass}
                  />
                ) : null}
              </Animated.View>
            ) : null}
          </Animated.View>
          {calculatorButtonShown ? (
            <BoardPressable
              testID={`life-calculator-open-seat-${seatNumber}`}
              accessibilityRole="button"
              accessibilityLabel={translate("board:lifeCard.openCalculator", { identity })}
              hitSlop={12}
              onPress={() => setEditorOpen(true)}
              style={({ pressed }) => [
                $cornerButton,
                {
                  right: identityCorner.trailing.right,
                  bottom: identityCorner.trailing.bottom,
                  width: trailingButtonSize,
                  height: trailingButtonSize,
                },
                pressed && { opacity: 0.72 },
              ]}
            >
              <CalculatorGlyph color={foreground} inkHeight={identityMetrics.icon} />
            </BoardPressable>
          ) : null}
        </Animated.View>
      ) : null}
      {turnChip && turnStyle !== "row" && turnChipShown ? (
        <TurnChipLayer
          state={turnChip}
          seatNumber={seatNumber}
          foreground={foreground}
          compact={compact}
          rotation={contentRotation}
          cardSize={cardSize}
          contentInsets={contentInsets}
          menuCorner={menuCorner}
          menuEdgeCenter={menuEdgeCenter}
          filled={turnStyle === "dim"}
        />
      ) : null}
      {claims?.length ? (
        <CommanderClaimBanner
          seatNumber={seatNumber}
          claims={claims}
          contentRotation={contentRotation}
          contentInsets={contentInsets}
          menuEdgeCenter={menuEdgeCenter}
          cardSize={cardSize}
          compact={compact}
          disabled={disabled}
        />
      ) : null}
      {(seatTable || seatBag) &&
      !claimShown &&
      !diceCovers &&
      !commanderCovers &&
      !sittingOut &&
      !editorOpen ? (
        <CounterChips
          key={playerId}
          seat={seatTable ?? DICE_ONLY_SEAT}
          dice={seatBag}
          bagAt={{
            right:
              identityCorner.trailing.right +
              (calculatorButtonShown ? trailingButtonSize + identityMetrics.gap : 0),
            bottom: identityCorner.trailing.bottom,
          }}
          seatNumber={seatNumber}
          identity={identity}
          color={color}
          foreground={foreground}
          compact={compact}
          contentRotation={contentRotation}
          contentInsets={contentInsets}
          menuEdgeCenter={menuEdgeCenter}
          cardSize={cardSize}
          onSheetOpenChange={setTableSheetOpen}
        />
      ) : null}
      {editorOpen && calculator ? (
        <LifeCalculator
          playerId={playerId}
          seatNumber={seatNumber}
          playerName={displayName}
          life={life}
          system={system}
          color={color}
          rotation={contentRotation}
          cardWidth={cardSize.width}
          cardHeight={cardSize.height}
          contentInsets={clearOfCutout(contentInsets)}
          menuCorner={menuCorner}
          menuEdgeCenter={menuEdgeCenter}
          onChange={onChange}
          onClose={() => setEditorOpen(false)}
        />
      ) : editorOpen ? (
        <LifeEditor
          seatNumber={seatNumber}
          playerName={displayName}
          life={life}
          sourceFontSize={resolvedLifeFontSize}
          system={system}
          color={color}
          rotation={contentRotation}
          boardRotation={boardRotation}
          cardWidth={cardSize.width}
          cardHeight={cardSize.height}
          contentInsets={clearOfCutout(contentInsets)}
          menuCorner={menuCorner}
          menuEdgeCenter={menuEdgeCenter}
          onChange={onChange}
          onClose={() => setEditorOpen(false)}
        />
      ) : null}
    </Animated.View>
  )
}, structurallyEqual)

const STACK_MS = 260
const KNOCKBACK = 12

const $card: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  overflow: "hidden",
  padding: spacing.xs,
  borderWidth: 0,
  borderRadius: seatCardRadius(),
})

const $content: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  alignItems: "center",
  zIndex: 1,
})

const $readout: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFill,
  alignItems: "center",
  justifyContent: "center",
})

const $compactCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.xxs,
  borderRadius: seatCardRadius(true),
})

const $life: ThemedStyle<TextStyle> = () => ({
  width: "100%",
  textAlign: "center",
  fontVariant: ["tabular-nums"],
})

const $cornerLayer: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFill,
  zIndex: 10,
})

const $cornerRow: ViewStyle = { position: "absolute", flexDirection: "row", alignItems: "center" }
const $cornerIdentity: ViewStyle = { flexShrink: 1, minWidth: 0 }
const $cornerButton: ViewStyle = {
  position: "absolute",
  alignItems: "center",
  justifyContent: "center",
  opacity: 0.6,
}

const CONTENT_LEFT_EDGE = {
  0: "left",
  180: "right",
  90: "top",
  [-90]: "bottom",
} as const

const CONTENT_RIGHT_EDGE = {
  0: "right",
  180: "left",
  90: "bottom",
  [-90]: "top",
} as const

const CONTENT_TOP_EDGE = { 0: "top", 180: "bottom", 90: "right", [-90]: "left" } as const

export function proWatermarkPlacement(
  rotation: LifeCardContentRotation,
  cardSize: { width: number; height: number },
): ViewStyle {
  const size = (Math.abs(rotation) === 90 ? cardSize.width : cardSize.height) * 0.8
  return {
    position: "absolute",
    width: size,
    height: size,
    opacity: 0.11,
    [CONTENT_TOP_EDGE[rotation]]: -size * 0.22,
    [CONTENT_RIGHT_EDGE[rotation]]: -size * 0.33,
    transform: [{ rotate: `${rotation}deg` }],
  }
}

const MIN_NAME_ROOM = 48

// why: insets give a notch's depth but not its width; a tucked name stops short of a Dynamic Island sized cutout.
export const CUTOUT_HALF_WIDTH = 64

const CONTENT_BOTTOM_EDGE = {
  0: "bottom",
  180: "top",
  90: "left",
  [-90]: "right",
} as const

/** why: the row is laid out upright and centered on the card, then rotated, so its mark turns about the card center. */
export function identityMarkCenter({
  rotation,
  cardSize,
  left,
  bottom,
  art,
  size,
}: {
  rotation: LifeCardContentRotation
  cardSize: { width: number; height: number }
  left: number
  bottom: number
  art: { width: number; height: number }
  size: number
}) {
  const sideways = Math.abs(rotation) === 90
  const frame = sideways
    ? { width: cardSize.height, height: cardSize.width }
    : { width: cardSize.width, height: cardSize.height }
  const x = left + art.width / 2 - frame.width / 2
  const y = frame.height - bottom - art.height / 2 - frame.height / 2
  const turn = (rotation * Math.PI) / 180
  const cos = Math.round(Math.cos(turn))
  const sin = Math.round(Math.sin(turn))
  return {
    x: cardSize.width / 2 + x * cos - y * sin,
    y: cardSize.height / 2 + x * sin + y * cos,
    size,
  }
}

/** why: the layer swaps its sides before turning sideways; turned as is, the identity pokes past the card. */
export function seatIdentityPlacement({
  rotation,
  cardSize,
  gap,
  insets,
  screenEdges,
  markHeight,
  buttonSize,
}: {
  rotation: LifeCardContentRotation
  cardSize: { width: number; height: number }
  gap: number
  markHeight: number
  buttonSize: number
  insets?: LifeCardContentInsets
  screenEdges?: LifeCardScreenEdges
}) {
  const { width, height } = cardSize
  const sideways = Math.abs(rotation) === 90
  const bottomEdge = CONTENT_BOTTOM_EDGE[rotation]
  const leftEdge = CONTENT_LEFT_EDGE[rotation]
  const spansScreenEdge = !!screenEdges?.[leftEdge] && !!screenEdges[CONTENT_RIGHT_EDGE[rotation]]
  const inset = insets?.[bottomEdge] ?? 0
  const contentHeight = sideways ? width : height
  const raised = seatIdentityBottomGap(gap, inset) + inset
  // why: a mid-edge notch or home indicator truncates the name, so the pair rises past it; on a short card that lands the mark on the − and + glyphs, so it tucks instead.
  const roomAboveCutout = raised + markHeight <= contentHeight / 2 - LIFE_GLYPH_LINE_HEIGHT / 2
  const underCutout = spansScreenEdge && inset > 0
  const cutoutAtMiddle = underCutout && roomAboveCutout
  const rightEdge = CONTENT_RIGHT_EDGE[rotation]
  const left = cornerOffset(gap, leftEdge, bottomEdge, insets, screenEdges)
  const bottom = cutoutAtMiddle
    ? raised
    : cornerOffset(gap, bottomEdge, leftEdge, insets, screenEdges)
  // why: the outside corner opposite the name holds the seat's bag and calculator, centered on the identity row; when their own corner sits deeper, they center on a row placed there instead.
  const trailing = {
    right: cornerOffset(gap, rightEdge, bottomEdge, insets, screenEdges),
    bottom:
      Math.max(bottom, cornerOffset(gap, bottomEdge, rightEdge, insets, screenEdges)) +
      (markHeight - buttonSize) / 2,
  }
  const run = sideways ? height : width
  const layer: ViewStyle | undefined = sideways
    ? {
        width: height,
        height: width,
        left: (width - height) / 2,
        top: (height - width) / 2,
        right: undefined,
        bottom: undefined,
      }
    : undefined
  const tucked = underCutout && !cutoutAtMiddle
  const position: ViewStyle = {
    left,
    bottom,
    maxWidth: run
      ? Math.max(run / 2 - left - gap - (tucked ? CUTOUT_HALF_WIDTH : 0), 0)
      : undefined,
  }
  const farCutout =
    insets?.cutout?.edge === rightEdge && insets.cutout.side === bottomEdge
      ? insets.cutout.size - CUTOUT_ENDS_INSIDE_INSET
      : 0
  const farTab = cornerStep(insets?.tabCorners ?? [], rightEdge, bottomEdge)
  // why: dice chips trail the name past the half-run line, except beside a tucked name, where they'd reach the cutout; name and chips stop short of a far-end first-player tab.
  const rowMaxWidth =
    run && !tucked
      ? Math.max(run - left - Math.max(left, farCutout, farTab && gap + farTab), 0)
      : position.maxWidth
  return { layer, position, rowMaxWidth, trailing }
}

const $eliminated: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...StyleSheet.absoluteFill,
  zIndex: 2,
  backgroundColor: colors.board.background,
  opacity: 0.6,
})

const $lockedOverlay: ViewStyle = { zIndex: 9 }

const $aboveOutOverlay: ViewStyle = { zIndex: 3 }

/** why: how far a corner grid reaches in from the nearer end of each seat axis (width, and up from its foot). A grid in a screen corner sits further in, so every seat allows that clearance and attacker boxes match. */
function gridReach(
  bounds: LayoutRectangle,
  card: { width: number; height: number },
  sideways: boolean,
) {
  const along = (length: number, start: number, size: number) =>
    Math.max(
      start * 2 + size < length ? start + size : length - start,
      size + SCREEN_CORNER_CLEARANCE,
    )
  return {
    width: sideways
      ? along(card.height, bounds.y, bounds.height)
      : along(card.width, bounds.x, bounds.width),
    height: sideways
      ? along(card.width, bounds.x, bounds.width)
      : along(card.height, bounds.y, bounds.height),
  }
}

const $outReadout: ViewStyle = { width: "100%", alignItems: "center" }
const $incomingSlot: ViewStyle = {
  position: "absolute",
  left: 0,
  right: 0,
  top: "50%",
  marginTop: -OUT_CAUSE.lineHeight / 2,
  alignItems: "center",
}
const $powerEditingHidden: ViewStyle = { opacity: 0 }

const $outCause: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: OUT_CAUSE_GAP,
  height: OUT_CAUSE.lineHeight,
  marginTop: OUT_CAUSE.marginTop,
}

// why: red and orange digits sit on any seat's color, so a dark halo keeps them legible on a red or orange disc.
const $hurtInk: TextStyle = {
  textShadowColor: "rgba(0, 0, 0, 0.7)",
  textShadowRadius: 4,
  textShadowOffset: { width: 0, height: 0 },
}

const $outAmount: TextStyle = {
  fontSize: OUT_CAUSE.fontSize,
  lineHeight: OUT_CAUSE.lineHeight,
  fontVariant: ["tabular-nums"],
}

const $outLabel: ThemedStyle<TextStyle> = () => ({
  ...OUT_LABEL,
  letterSpacing: 2,
  textTransform: "uppercase",
})

const $disabledCard: ThemedStyle<ViewStyle> = () => ({ opacity: 0.72 })
const $staleCard: ThemedStyle<ViewStyle> = () => ({ opacity: 0.5 })

const $aboveFlood: ViewStyle = { zIndex: TAKEOVER_LAYERS.life }

// why: the attacker's total crosses its power boxes (z 8) on the way to its slot, so it rides over them and under the corner layer's X (z 10).
const $aboveAttackerControls: ViewStyle = { zIndex: 9 }
