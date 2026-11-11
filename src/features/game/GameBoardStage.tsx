import { type ReactNode, useEffect, useMemo, useState } from "react"
import { Dimensions, StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native"
import Animated from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { TurnedBoardContext } from "@/components/BoardPressable"
import { seatBagSize } from "@/components/CounterChips"
import {
  FirstPlayerTabs,
  FirstPlayerTabsShownContext,
  type FirstPlayerOffer,
  type FirstPlayerTab,
} from "@/components/FirstPlayerTabs"
import {
  ANCHOR_LOW_ON_SCREEN,
  COMPACT_MENU_BUTTON_SIZE,
  GameMenuBackdrop,
  GameMenuCluster,
  GameRadialMenu,
  type GameRadialMenuProps,
  MENU_BUTTON_SIZE,
} from "@/components/GameRadialMenu"
import {
  getPlayerGridFacings,
  getPlayerGridMenuAnchor,
  type PlayerGridLayoutVariant,
  type PlayerGridProps,
} from "@/components/PlayerGrid"
import {
  getMenuSeamNeighbors,
  getPlayerGridRows,
  getPlayerSlotFacings,
} from "@/components/playerGridGeometry"
import { RoundClockTabs } from "@/components/RoundClockTabs"
import { seatIdentityMetrics } from "@/components/SeatIdentity"
import { teamChipCrowded, teamPanelCompact, teamStripWidth } from "@/components/teamGridGeometry"
import { TurnSpotlightContext, type TurnSpotlight } from "@/components/TurnSpotlight"
import { usePlayerGridLayout } from "@/components/usePlayerGridLayout"
import { useTopEdgeBand } from "@/utils/useTopEdgeBand"

import { boardPointToWindowPoint } from "./pinnedBoardGeometry"
import type { PlaySystemId } from "./playSystems"
import type { RoundClock } from "./roundClock"
import { clockwiseSlots } from "./turnTab"
import { rotateGameBoardAnchor, useGameBoardOrientation } from "./useGameBoardOrientation"
import { turnGroupOf, type TurnGroups } from "../../../convex/lib/turns"
import {
  SCREEN_PINNING_AVAILABLE,
  ScreenPinnedView,
  type ScreenPinnedMetrics,
} from "../../../modules/screen-pinned-view"

export interface GameBoardStageProps {
  playerCount: number
  teamBoard?: boolean
  layoutVariant: PlayerGridLayoutVariant
  renderGrid: (boardOrientation: PlayerGridProps["boardOrientation"]) => ReactNode
  menu: Omit<GameRadialMenuProps, "anchor" | "boardAnchor" | "nativeFrame" | "compact">
  firstPlayer?: FirstPlayerOffer
  roundClock?: BoardRoundClock
  turns?: BoardTurns
  seam?: (geometry: BoardSeamGeometry) => ReactNode
  windowOverlay?: ReactNode
  toast?: ReactNode
  onBoardSizeChange?: (size: BoardSize) => void
  testID?: string
}

export interface BoardRoundClock {
  clock: RoundClock
  system?: PlaySystemId
  onPress: () => void
}

export interface BoardTurns {
  active?: string
  groups?: TurnGroups
  nextOf: (clockwiseSlots: number[]) => string | undefined
}

export interface BoardSeamGeometry {
  anchor: { x: number; y: number }
  facings: readonly number[]
  edgeTabs: boolean
  sides: ReturnType<typeof getMenuSeamNeighbors>
  width: number
  menuSize: number
  /** why: on a team board each panel's ends hold its teammates' strips, so seam plates stop this much shorter. */
  teamStrip: number
  teamChipCrowded?: (slot: number) => boolean
}

const seamTeams = (
  teamBoard: boolean | undefined,
  teamCount: number,
  layout: Parameters<typeof teamChipCrowded>[1],
) =>
  teamBoard
    ? {
        teamStrip: teamStripWidth(teamPanelCompact(layout, teamCount)),
        teamChipCrowded: (slot: number) => teamChipCrowded(teamCount, layout, slot),
      }
    : { teamStrip: 0 }

export interface BoardSize {
  width: number
  height: number
}

export const GameBoardStage = SCREEN_PINNING_AVAILABLE ? PinnedGameBoardStage : LegacyGameBoardStage

function PinnedGameBoardStage({
  playerCount,
  teamBoard,
  layoutVariant,
  renderGrid,
  menu,
  firstPlayer,
  roundClock,
  turns,
  seam,
  windowOverlay,
  toast,
  onBoardSizeChange,
  testID = "game-board",
}: GameBoardStageProps) {
  const window = useWindowDimensions()
  const safeArea = useSafeAreaInsets()
  const [metrics, setMetrics] = useState<ScreenPinnedMetrics>(() => {
    const screen = Dimensions.get("screen")
    return {
      pinned: true,
      holderAngle: 0,
      width: Math.min(screen.width, screen.height),
      height: Math.max(screen.width, screen.height),
      insets: safeArea,
    }
  })
  const { pinned } = metrics
  const width = pinned ? metrics.width : window.width
  const height = pinned ? metrics.height : window.height
  const holderAngle = pinned ? metrics.holderAngle : 0
  const fontScale = window.fontScale

  const gridLayout = usePlayerGridLayout({
    playerCount,
    width,
    height,
    fontScale,
    layoutVariant,
    teamBoard,
  })
  useEffect(() => onBoardSizeChange?.({ width, height }), [onBoardSizeChange, width, height])
  const boardAnchor = useMemo(
    () => getPlayerGridMenuAnchor(playerCount, gridLayout),
    [playerCount, gridLayout],
  )
  const tabs = useMemo(
    () => firstPlayerTabs(boardAnchor, getPlayerGridFacings(playerCount, gridLayout)),
    [boardAnchor, playerCount, gridLayout],
  )
  const facings = useMemo(
    () => getPlayerSlotFacings(playerCount, gridLayout),
    [playerCount, gridLayout],
  )
  const holderAnchor = useMemo(
    () => boardPointToWindowPoint(boardAnchor, { width, height }, holderAngle),
    [boardAnchor, width, height, holderAngle],
  )
  const boardOrientation = useMemo(
    () =>
      pinned
        ? {
            width,
            height,
            screenWidth: width,
            screenHeight: height,
            fontScale,
            rotation: 0,
            insets: metrics.insets,
            touchRotation: -holderAngle,
          }
        : undefined,
    [pinned, width, height, fontScale, metrics.insets, holderAngle],
  )
  const tabsShown = (!!firstPlayer || !!roundClock) && !menu.open
  const spotlight = useSpotlight(turns, playerCount, gridLayout)

  return (
    <View testID={testID} style={$stage}>
      <ScreenPinnedView style={StyleSheet.absoluteFill} onOrientationChange={setMetrics}>
        <TurnedBoardContext.Provider value={holderAngle !== 0}>
          <View collapsable={false} style={pinned ? [$pinnedBoard, { width, height }] : $fill}>
            <FirstPlayerTabsShownContext.Provider value={tabsShown}>
              <TurnSpotlightContext.Provider value={spotlight}>
                {renderGrid(boardOrientation)}
              </TurnSpotlightContext.Provider>
            </FirstPlayerTabsShownContext.Provider>
            {seam && !menu.open
              ? seam({
                  anchor: boardAnchor,
                  facings,
                  edgeTabs: tabsShown,
                  sides: getMenuSeamNeighbors(playerCount, gridLayout),
                  width,
                  menuSize: playerCount > 2 ? COMPACT_MENU_BUTTON_SIZE : MENU_BUTTON_SIZE,
                  ...seamTeams(teamBoard, playerCount, gridLayout),
                })
              : null}
            <GameMenuBackdrop open={menu.open} onClose={menu.onClose} />
            <GameMenuCluster
              open={menu.open}
              anchor={boardAnchor}
              holderAnchor={holderAnchor}
              holderHeight={holderAngle % 180 === 0 ? height : width}
              facingAngle={holderAngle}
              actions={menu.actions}
              compact={playerCount > 2}
              signal={menu.signal}
              statusLine={menu.statusLine}
              onToggle={menu.onToggle}
            />
            {tabsShown ? (
              <BoardTabs firstPlayer={firstPlayer} roundClock={roundClock} tabs={tabs} />
            ) : null}
          </View>
        </TurnedBoardContext.Provider>
      </ScreenPinnedView>
      {toast ? (
        <BoardToastSlot anchor={holderAnchor} hidden={menu.open}>
          {toast}
        </BoardToastSlot>
      ) : null}
      {windowOverlay}
    </View>
  )
}

function LegacyGameBoardStage({
  playerCount,
  teamBoard,
  layoutVariant,
  renderGrid,
  menu,
  firstPlayer,
  roundClock,
  turns,
  seam,
  windowOverlay,
  toast,
  onBoardSizeChange,
  testID = "game-board",
}: GameBoardStageProps) {
  const boardOrientation = useGameBoardOrientation()
  const { width, height, fontScale, rotation } = boardOrientation
  const gridLayout = usePlayerGridLayout({
    playerCount,
    width,
    height,
    fontScale,
    layoutVariant,
    teamBoard,
  })
  useEffect(() => onBoardSizeChange?.({ width, height }), [onBoardSizeChange, width, height])
  const topEdgeBand = useTopEdgeBand()
  const boardAnchor = useMemo(
    () =>
      getPlayerGridMenuAnchor(playerCount, gridLayout, rotation === 0 ? topEdgeBand / height : 0),
    [playerCount, gridLayout, rotation, topEdgeBand, height],
  )
  const menuAnchor = useMemo(
    () => rotateGameBoardAnchor(boardAnchor, rotation),
    [boardAnchor, rotation],
  )
  const tabs = useMemo(
    () => firstPlayerTabs(boardAnchor, getPlayerGridFacings(playerCount, gridLayout), rotation),
    [boardAnchor, playerCount, gridLayout, rotation],
  )
  const facings = useMemo(
    () => getPlayerSlotFacings(playerCount, gridLayout),
    [playerCount, gridLayout],
  )
  const tabsShown = (!!firstPlayer || !!roundClock) && !menu.open
  const spotlight = useSpotlight(turns, playerCount, gridLayout)

  return (
    <Animated.View
      ref={boardOrientation.frameRef}
      collapsable={false}
      testID={testID}
      style={$stage}
    >
      <FirstPlayerTabsShownContext.Provider value={tabsShown}>
        <TurnSpotlightContext.Provider value={spotlight}>
          {renderGrid(boardOrientation)}
        </TurnSpotlightContext.Provider>
      </FirstPlayerTabsShownContext.Provider>
      {seam && !menu.open && rotation === 0
        ? seam({
            anchor: boardAnchor,
            facings,
            edgeTabs: tabsShown,
            sides: getMenuSeamNeighbors(playerCount, gridLayout),
            width,
            menuSize: playerCount > 2 ? COMPACT_MENU_BUTTON_SIZE : MENU_BUTTON_SIZE,
            ...seamTeams(teamBoard, playerCount, gridLayout),
          })
        : null}
      <GameRadialMenu
        {...menu}
        anchor={menuAnchor}
        boardAnchor={rotateGameBoardAnchor(menuAnchor, -rotation)}
        nativeFrame={boardOrientation.nativeFrame}
        compact={playerCount > 2}
      />
      {tabsShown ? (
        <BoardTabs firstPlayer={firstPlayer} roundClock={roundClock} tabs={tabs} />
      ) : null}
      {toast ? (
        <BoardToastSlot anchor={menuAnchor} hidden={menu.open}>
          {toast}
        </BoardToastSlot>
      ) : null}
      {windowOverlay}
    </Animated.View>
  )
}

function useSpotlight(
  turns: BoardTurns | undefined,
  playerCount: number,
  gridLayout: Parameters<typeof getPlayerGridRows>[1],
): TurnSpotlight | undefined {
  const active = turns?.active
  const nextOf = turns?.nextOf
  const groups = turns?.groups
  const passTo = useMemo(
    () =>
      active && nextOf
        ? nextOf(clockwiseSlots(getPlayerGridRows(playerCount, gridLayout)))
        : undefined,
    [active, nextOf, playerCount, gridLayout],
  )
  return useMemo(
    () => (active ? { active: turnGroupOf(groups, active), passTo } : undefined),
    [active, groups, passTo],
  )
}

function BoardTabs({
  firstPlayer,
  roundClock,
  tabs,
}: {
  firstPlayer?: FirstPlayerOffer
  roundClock?: BoardRoundClock
  tabs: readonly FirstPlayerTab[]
}) {
  if (firstPlayer) return <FirstPlayerTabs offer={firstPlayer} tabs={tabs} />
  if (!roundClock) return null
  return <RoundClockTabs {...roundClock} tabs={tabs} />
}

/** why: the tabs sit where the menu's row meets the board's left and right edges, clear of the camera cutout and home indicator, each turned toward the players nearest it. `rotation` turns a board drawn sideways onto the screen. */
export function firstPlayerTabs(
  boardAnchor: { x: number; y: number },
  facings: readonly number[],
  rotation = 0,
): FirstPlayerTab[] {
  return [
    { x: 0, toward: 90 },
    { x: 1, toward: -90 },
  ].map(({ x, toward }, index) => {
    const facing = facings.includes(toward) ? toward : (facings[index] ?? facings[0] ?? 0)
    const { x: sx, y: sy } = rotateGameBoardAnchor({ x, y: boardAnchor.y }, rotation)
    const edge = sx === 0 ? "left" : sx === 1 ? "right" : sy === 0 ? "top" : "bottom"
    return { edge, at: edge === "left" || edge === "right" ? sy : sx, facing: facing + rotation }
  })
}

// why: seats print their name and mark at the outer edges, so the toast sits just past the menu and out of the side bands sideways seats use. It stays mounted while the menu is open so a timed toast keeps its clock.
const SEAT_IDENTITY_BAND = seatIdentityMetrics().edge + seatBagSize()
const TOAST_MENU_CLEARANCE = MENU_BUTTON_SIZE / 2 + 8

function BoardToastSlot({
  anchor,
  hidden,
  children,
}: {
  anchor: { x: number; y: number }
  hidden: boolean
  children: ReactNode
}) {
  const below = anchor.y <= ANCHOR_LOW_ON_SCREEN
  return (
    <View
      testID="board-toast-slot"
      pointerEvents={hidden ? "none" : "box-none"}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
      style={[
        $toastSlot,
        below
          ? { top: `${anchor.y * 100}%`, marginTop: TOAST_MENU_CLEARANCE }
          : { bottom: `${(1 - anchor.y) * 100}%`, marginBottom: TOAST_MENU_CLEARANCE },
        hidden && $hidden,
      ]}
    >
      {children}
    </View>
  )
}

const $toastSlot: ViewStyle = {
  position: "absolute",
  left: SEAT_IDENTITY_BAND,
  right: SEAT_IDENTITY_BAND,
  zIndex: 80,
  elevation: 80,
  alignItems: "center",
}
const $hidden: ViewStyle = { opacity: 0 }
const $pinnedBoard: ViewStyle = { position: "absolute", left: 0, top: 0 }
const $stage: ViewStyle = { flex: 1, width: "100%" }
const $fill: ViewStyle = StyleSheet.absoluteFill
