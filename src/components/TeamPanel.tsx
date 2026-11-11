import { useCallback, useState, type ReactNode } from "react"
import type { ViewStyle } from "react-native"
import { StyleSheet, View } from "react-native"
import Animated from "react-native-reanimated"

import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"

import { BoardPressable } from "./BoardPressable"
import {
  contentFrame,
  contentInset,
  CounterChips,
  DICE_ONLY_SEAT,
  seatBagSize,
  type SeatTable,
} from "./CounterChips"
import type { SeatDiceBag } from "./DiceSeatOverlay"
import {
  cornerOffset,
  seatCardRadius,
  type LifeCardContentInsets,
  type LifeCardContentRotation,
  type LifeCardEdge,
  type LifeCardMenuCorner,
  type LifeCardMenuEdge,
  type LifeCardScreenEdges,
} from "./playerCardTypes"
import { CONTENT_EDGES } from "./playerGridGeometry"
import { SeatIdentity, seatIdentityLabel, seatIdentityMetrics } from "./SeatIdentity"
import { teamSplit, teamStripWidth } from "./teamGridGeometry"
import { useSeatFill } from "./TurnSpotlight"
import { isProMarkShape, type PlayerMarkShape } from "../../convex/lib/appearance"

export interface TeamStripHead {
  playerId: string
  seatNumber: number
  name: string
  color: string
  shape?: PlayerMarkShape
  foil?: boolean
  staleSince?: number
  ownership?: "owned" | "unowned" | "disabled"
  out: boolean
  seat?: SeatTable
  bag?: SeatDiceBag
  /** why: in Commander a teammate's mark starts their commander's attack, as a seat's mark does. */
  sword?: { onPress: () => void; disabled: boolean }
}

export interface TeamZonePlace {
  contentInsets: LifeCardContentInsets
  screenEdges: LifeCardScreenEdges
  menuEdgeCenter?: LifeCardMenuEdge
}

export interface TeamPanelProps {
  slot: number
  rotation: LifeCardContentRotation
  compact?: boolean
  heads: readonly [TeamStripHead, TeamStripHead]
  /** why: the counters the team shares (poison) live on the zone, so the strips leave them out. */
  shared: readonly string[]
  contentInsets: LifeCardContentInsets
  screenEdges: LifeCardScreenEdges
  menuCorner?: LifeCardMenuCorner
  menuEdgeCenter?: LifeCardMenuEdge
  style?: ViewStyle
  renderZone: (place: TeamZonePlace) => ReactNode
}

const SIDES = ["left", "right"] as const

/** why: a Two-Headed Giant team is one panel: a strip per teammate at each end, holding their name, mark, own counters, and bag, around one shared zone with the team's life, poison, turn, and commander damage. */
export function TeamPanel({
  slot,
  rotation,
  compact,
  heads,
  shared,
  contentInsets,
  screenEdges,
  menuCorner,
  menuEdgeCenter,
  style,
  renderZone,
}: TeamPanelProps) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [sheetOpen, setSheetOpen] = useState<readonly [boolean, boolean]>([false, false])
  const [stackEnds, setStackEnds] = useState<readonly [number, number]>([0, 0])
  const firstStackEnd = useCallback(
    (end: number) => setStackEnds((current) => (current[0] === end ? current : [end, current[1]])),
    [],
  )
  const secondStackEnd = useCallback(
    (end: number) => setStackEnds((current) => (current[1] === end ? current : [current[0], end])),
    [],
  )
  const firstSheet = useCallback(
    (open: boolean) => setSheetOpen((current) => [open, current[1]]),
    [],
  )
  const secondSheet = useCallback(
    (open: boolean) => setSheetOpen((current) => [current[0], open]),
    [],
  )
  const covered = sheetOpen[0] || sheetOpen[1]
  const edges = CONTENT_EDGES[rotation]
  const outer = [edges.left, edges.right] as const
  const base = teamStripWidth(compact)
  const thickness = SIDES.map((side) => base + contentInset(rotation, contentInsets, side))
  const sideways = Math.abs(rotation) === 90
  const isStripEdge = (edge: LifeCardEdge) => outer.includes(edge)
  const zone: TeamZonePlace = {
    contentInsets: {
      ...contentInsets,
      [outer[0]]: 0,
      [outer[1]]: 0,
      cutout:
        contentInsets.cutout &&
        !isStripEdge(contentInsets.cutout.edge) &&
        !isStripEdge(contentInsets.cutout.side)
          ? contentInsets.cutout
          : undefined,
      tabCorners: contentInsets.tabCorners?.filter(
        ({ edge, side }) => !isStripEdge(edge) && !isStripEdge(side),
      ),
    },
    screenEdges: { ...screenEdges, [outer[0]]: false, [outer[1]]: false },
    menuEdgeCenter: menuEdgeCenter && !isStripEdge(menuEdgeCenter) ? menuEdgeCenter : undefined,
  }
  const measured = size.width > 0 && size.height > 0
  const frameWidth = sideways ? size.height : size.width
  const frameHeight = sideways ? size.width : size.height
  const metrics = seatIdentityMetrics(compact)
  const bagSize = seatBagSize(compact)
  const gap = metrics.gap
  const menuAt = (end: "top" | "bottom", head: 0 | 1) =>
    !!menuCorner &&
    menuCorner.toLowerCase().includes(edges[end]) &&
    menuCorner.toLowerCase().includes(outer[head])
  const menuClearance = compact ? 30 : 34
  const strips = heads.map((head, index) => {
    const side = index === 0 ? 0 : 1
    const inset = contentInset(rotation, contentInsets, SIDES[side])
    const center = side === 0 ? inset + base / 2 : frameWidth - inset - base / 2
    const top =
      cornerOffset(gap, edges.top, outer[side], contentInsets, screenEdges) +
      (menuAt("top", side) ? menuClearance : 0)
    const bottom =
      cornerOffset(gap, edges.bottom, outer[side], contentInsets, screenEdges) +
      (menuAt("bottom", side) ? menuClearance : 0)
    const editable = !!head.seat?.editable
    const bagShown = editable || !!head.bag
    const nameFoot = bottom + (bagShown ? bagSize + gap : 0)
    const chipFloor = frameHeight - nameFoot - metrics.icon - gap
    const chipsEnd = stackEnds[side] ? stackEnds[side] + gap : top
    return { head, side, center, top, bottom, nameFoot, chipFloor, chipsEnd, bagShown }
  })

  return (
    <View
      testID={`team-panel-${slot + 1}`}
      onLayout={({ nativeEvent: { layout } }) =>
        setSize((current) =>
          current.width === layout.width && current.height === layout.height
            ? current
            : { width: layout.width, height: layout.height },
        )
      }
      style={[$panel, { borderRadius: seatCardRadius(compact) }, style]}
    >
      <View style={[$fill, { flexDirection: teamSplit(rotation) }]}>
        <StripFill head={heads[0]} length={thickness[0]} sideways={sideways} />
        <View
          style={$fill}
          pointerEvents={covered ? "none" : "auto"}
          accessibilityElementsHidden={covered}
          importantForAccessibility={covered ? "no-hide-descendants" : "auto"}
        >
          {renderZone(zone)}
        </View>
        <StripFill head={heads[1]} length={thickness[1]} sideways={sideways} />
      </View>
      {measured ? (
        <View pointerEvents="box-none" style={[contentFrame(rotation, size), $identityLayer]}>
          {strips.map(({ head, center, nameFoot, chipsEnd }) => {
            const length = Math.max(0, frameHeight - nameFoot - chipsEnd)
            return (
              <StripIdentity
                key={head.playerId}
                head={head}
                compact={compact}
                hidden={covered}
                style={{
                  width: length,
                  height: base,
                  left: center - length / 2,
                  top: chipsEnd + length / 2 - base / 2,
                }}
              />
            )
          })}
        </View>
      ) : null}
      {measured
        ? strips.map(({ head, side, center, top, chipFloor, bottom, bagShown }) =>
            head.seat || head.bag ? (
              <CounterChips
                key={head.playerId}
                seat={head.seat ?? DICE_ONLY_SEAT}
                dice={head.bag}
                bagAt={{
                  right: frameWidth - center - bagSize / 2,
                  bottom: bagShown ? bottom : 0,
                }}
                stack={{ center, width: base - 4, top, bottom: chipFloor }}
                hidden={shared}
                seatNumber={head.seatNumber}
                identity={seatIdentityLabel(head.seatNumber, head.name)}
                color={head.color}
                foreground={accessibleForeground(head.color)}
                compact={compact}
                contentRotation={rotation}
                contentInsets={contentInsets}
                cardSize={size}
                onStackEnd={side === 0 ? firstStackEnd : secondStackEnd}
                onSheetOpenChange={side === 0 ? firstSheet : secondSheet}
              />
            ) : null,
          )
        : null}
    </View>
  )
}

function StripFill({
  head,
  length,
  sideways,
}: {
  head: TeamStripHead
  length: number
  sideways: boolean
}) {
  const fill = useSeatFill(head.color, head.playerId)
  const { themed } = useAppTheme()
  return (
    <Animated.View
      testID={`team-strip-seat-${head.seatNumber}`}
      style={[
        sideways ? { height: length } : { width: length },
        fill,
        head.ownership === "disabled" && $disabled,
        head.staleSince !== undefined && $stale,
      ]}
    >
      {head.out ? <View pointerEvents="none" style={themed($out)} /> : null}
    </Animated.View>
  )
}

function StripIdentity({
  head,
  compact,
  hidden,
  style,
}: {
  head: TeamStripHead
  compact?: boolean
  hidden: boolean
  style: ViewStyle
}) {
  const foreground = accessibleForeground(head.color)
  const identity = seatIdentityLabel(head.seatNumber, head.name)
  const label = head.ownership
    ? translate("board:counters.seatItem", {
        identity,
        label: translate(`board:seat.ownership.${head.ownership}`),
      })
    : identity
  const seatIdentity = (
    <SeatIdentity
      seatNumber={head.seatNumber}
      playerName={head.name.trim() || translate("board:seat.unnamedPlayer")}
      shape={head.shape}
      color={foreground}
      compact={compact}
      insetSwordColor={head.sword ? head.color : undefined}
      foil={head.foil && !!head.shape && isProMarkShape(head.shape)}
      staleSince={head.staleSince}
    />
  )
  return (
    <View
      testID={`team-identity-seat-${head.seatNumber}`}
      pointerEvents={hidden ? "none" : "box-none"}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
      style={[
        $identityRow,
        style,
        hidden && $hidden,
        (head.ownership === "disabled" || head.out) && $disabled,
      ]}
    >
      {head.sword ? (
        <BoardPressable
          testID={`commander-mark-seat-${head.seatNumber}`}
          accessibilityRole="button"
          accessibilityLabel={translate("board:commander.assignFrom", { identity })}
          accessibilityState={{ disabled: head.sword.disabled }}
          disabled={head.sword.disabled}
          hitSlop={8}
          onPress={head.sword.onPress}
          style={({ pressed }) => [$shrink, pressed && { opacity: 0.72 }]}
        >
          {seatIdentity}
        </BoardPressable>
      ) : (
        <View accessible accessibilityLabel={label} style={$shrink}>
          {seatIdentity}
        </View>
      )}
    </View>
  )
}

const $panel: ViewStyle = { flex: 1, overflow: "hidden" }
const $fill: ViewStyle = { flex: 1 }
const $identityLayer: ViewStyle = { zIndex: 10 }
const $identityRow: ViewStyle = {
  position: "absolute",
  flexDirection: "row",
  alignItems: "center",
  transform: [{ rotate: "-90deg" }],
}
const $shrink: ViewStyle = { flexShrink: 1, minWidth: 0 }
const $hidden: ViewStyle = { opacity: 0 }
const $disabled: ViewStyle = { opacity: 0.72 }
const $stale: ViewStyle = { opacity: 0.5 }
const $out: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...StyleSheet.absoluteFill,
  backgroundColor: colors.board.background,
  opacity: 0.6,
})
