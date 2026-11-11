import { useCallback } from "react"
import type { ViewStyle } from "react-native"
import { View } from "react-native"

import { translate } from "@/i18n/translate"
import { accessibleForeground } from "@/utils/colorContrast"

import { BoardPressable } from "./BoardPressable"
import { contentFrame, CounterChips, DICE_ONLY_SEAT, type SeatTable } from "./CounterChips"
import type { SeatDiceBag } from "./DiceSeatOverlay"
import { COMPACT_MENU_BUTTON_SIZE, MENU_BUTTON_SIZE } from "./GameRadialMenu"
import {
  cornerOffset,
  type LifeCardContentInsets,
  type LifeCardContentRotation,
  type LifeCardMenuCorner,
  type LifeCardMenuEdge,
  type LifeCardScreenEdges,
} from "./playerCardTypes"
import { CONTENT_EDGES } from "./playerGridGeometry"
import { SeatIdentity, seatIdentityLabel, seatIdentityMetrics } from "./SeatIdentity"
import { isProMarkShape, type PlayerMarkShape } from "../../convex/lib/appearance"

export interface TeamHead {
  seatNumber: number
  name: string
  color: string
  shape?: PlayerMarkShape
  foil?: boolean
  staleSince?: number
  ownership?: "owned" | "unowned" | "disabled"
  seat?: SeatTable
  bag?: SeatDiceBag
  sword?: { onPress: () => void; disabled: boolean }
}

export type TeamSheetOwner = "zone" | 0 | 1

const SIDES = ["left", "right"] as const
type Side = (typeof SIDES)[number]

const touches = (corner: LifeCardMenuCorner, edge: string) => corner.toLowerCase().includes(edge)

export function TeamCorners({
  heads,
  shared,
  rotation,
  cardSize,
  contentInsets,
  screenEdges,
  menuCorner,
  menuEdgeCenter,
  compact,
  row,
  namesHidden,
  countersShown,
  sheetOwner,
  onSheetFor,
}: {
  heads: readonly [TeamHead, TeamHead]
  shared: readonly string[]
  rotation: LifeCardContentRotation
  cardSize: { width: number; height: number }
  contentInsets?: LifeCardContentInsets
  screenEdges?: LifeCardScreenEdges
  menuCorner?: LifeCardMenuCorner
  menuEdgeCenter?: LifeCardMenuEdge
  compact?: boolean
  row: { start: number; end: number; bottom: number }
  namesHidden: boolean
  countersShown: boolean
  sheetOwner?: TeamSheetOwner
  onSheetFor: (owner: TeamSheetOwner, open: boolean) => void
}) {
  const firstSheet = useCallback((open: boolean) => onSheetFor(0, open), [onSheetFor])
  const secondSheet = useCallback((open: boolean) => onSheetFor(1, open), [onSheetFor])
  if (cardSize.width === 0 || cardSize.height === 0) return null
  const edges = CONTENT_EDGES[rotation]
  const { gap } = seatIdentityMetrics(compact)
  const run = Math.abs(rotation) === 90 ? cardSize.height : cardSize.width
  const menuHalf = (compact ? COMPACT_MENU_BUTTON_SIZE : MENU_BUTTON_SIZE) / 2
  const inset = (side: Side, end: "top" | "bottom") =>
    cornerOffset(gap, edges[side], edges[end], contentInsets, screenEdges) +
    (menuCorner && touches(menuCorner, edges[side]) && touches(menuCorner, edges[end])
      ? menuHalf
      : 0)
  const topMenu = menuEdgeCenter === edges.top ? menuHalf : 0
  const nameAlong = SIDES.map((side) => inset(side, "top"))
  const nameTop = SIDES.map((side) =>
    cornerOffset(gap, edges.top, edges[side], contentInsets, screenEdges),
  )
  return (
    <>
      <View
        pointerEvents={namesHidden ? "none" : "box-none"}
        accessibilityElementsHidden={namesHidden}
        importantForAccessibility={namesHidden ? "no-hide-descendants" : "auto"}
        style={[contentFrame(rotation, cardSize), $layer, namesHidden && $hidden]}
      >
        {heads.map((head, index) => (
          <TeamName
            key={head.seatNumber}
            head={head}
            compact={compact}
            reversed={index === 1}
            style={{
              top: nameTop[index],
              [SIDES[index]]: nameAlong[index],
              maxWidth: Math.max(run / 2 - nameAlong[index] - gap - topMenu, 0),
            }}
          />
        ))}
      </View>
      {countersShown
        ? heads.map((head, index) =>
            (head.seat || head.bag) && (sheetOwner === undefined || sheetOwner === index) ? (
              <CounterChips
                key={head.seatNumber}
                seat={head.seat ?? DICE_ONLY_SEAT}
                dice={head.bag}
                bagAt={
                  index === 0
                    ? { left: inset("left", "bottom"), bottom: row.bottom }
                    : { right: inset("right", "bottom"), bottom: row.bottom }
                }
                nameEnd={index === 0 ? row.start : row.end}
                hidden={shared}
                seatNumber={head.seatNumber}
                identity={seatIdentityLabel(head.seatNumber, head.name)}
                color={head.color}
                foreground={accessibleForeground(head.color)}
                compact={compact}
                contentRotation={rotation}
                contentInsets={contentInsets}
                menuEdgeCenter={menuEdgeCenter}
                cardSize={cardSize}
                onSheetOpenChange={index === 0 ? firstSheet : secondSheet}
              />
            ) : null,
          )
        : null}
    </>
  )
}

function TeamName({
  head,
  compact,
  reversed,
  style,
}: {
  head: TeamHead
  compact?: boolean
  reversed: boolean
  style: ViewStyle
}) {
  const identity = seatIdentityLabel(head.seatNumber, head.name)
  const seatIdentity = (
    <SeatIdentity
      seatNumber={head.seatNumber}
      playerName={head.name.trim() || translate("board:seat.unnamedPlayer")}
      shape={head.shape}
      color={accessibleForeground(head.color)}
      compact={compact}
      insetSwordColor={head.sword ? head.color : undefined}
      foil={head.foil && !!head.shape && isProMarkShape(head.shape)}
      staleSince={head.staleSince}
      style={[$shrink, reversed && $reversed]}
    />
  )
  const shown = [
    $name,
    reversed ? $reversed : $forward,
    style,
    head.ownership === "disabled" && $disabled,
  ]
  return head.sword ? (
    <BoardPressable
      testID={`commander-mark-seat-${head.seatNumber}`}
      accessibilityRole="button"
      accessibilityLabel={translate("board:commander.assignFrom", { identity })}
      accessibilityState={{ disabled: head.sword.disabled }}
      disabled={head.sword.disabled}
      hitSlop={8}
      onPress={head.sword.onPress}
      style={({ pressed }) => [shown, pressed && $pressed]}
    >
      {seatIdentity}
    </BoardPressable>
  ) : (
    <View
      testID={`team-identity-seat-${head.seatNumber}`}
      accessible
      accessibilityLabel={
        head.ownership
          ? translate("board:counters.seatItem", {
              identity,
              label: translate(`board:seat.ownership.${head.ownership}`),
            })
          : identity
      }
      style={shown}
    >
      {seatIdentity}
    </View>
  )
}

const $layer: ViewStyle = { zIndex: 10 }
const $name: ViewStyle = { position: "absolute" }
const $forward: ViewStyle = { flexDirection: "row" }
const $shrink: ViewStyle = { flexShrink: 1, minWidth: 0 }
const $reversed: ViewStyle = { flexDirection: "row-reverse" }
const $hidden: ViewStyle = { opacity: 0 }
const $disabled: ViewStyle = { opacity: 0.72 }
const $pressed: ViewStyle = { opacity: 0.72 }
