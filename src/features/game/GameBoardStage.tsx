import { type ReactNode, useEffect, useMemo, useState } from "react"
import { Dimensions, StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native"
import { useAnimatedHinge } from "expo-hinge/reanimated"
import Animated, {
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { TurnedBoardContext } from "@/components/BoardPressable"
import {
  FirstPlayerTabs,
  type FirstPlayerOffer,
  type FirstPlayerTab,
} from "@/components/FirstPlayerTabs"
import {
  GameMenuBackdrop,
  GameMenuCluster,
  GameRadialMenu,
  type GameRadialMenuProps,
  openToolBag,
} from "@/components/GameRadialMenu"
import {
  getPlayerGridFacings,
  getPlayerGridMenuAnchor,
  type PlayerGridLayoutVariant,
  type PlayerGridProps,
} from "@/components/PlayerGrid"
import { usePlayerGridLayout } from "@/components/usePlayerGridLayout"
import { useTopEdgeBand } from "@/utils/useTopEdgeBand"
import { useWindowSpansHinge } from "@/utils/useWindowSpansHinge"

import { boardPointToWindowPoint } from "./pinnedBoardGeometry"
import { hingeUnfold, type TableTurn } from "./tableTurn"
import { TableTurnOffer } from "./TableTurnOffer"
import { rotateGameBoardAnchor, useGameBoardOrientation } from "./useGameBoardOrientation"
import {
  SCREEN_PINNING_AVAILABLE,
  ScreenPinnedView,
  type ScreenPinnedMetrics,
} from "../../../modules/screen-pinned-view"

export interface GameBoardStageProps {
  playerCount: number
  layoutVariant: PlayerGridLayoutVariant
  renderGrid: (boardOrientation: PlayerGridProps["boardOrientation"]) => ReactNode
  menu: Omit<GameRadialMenuProps, "anchor" | "boardAnchor" | "nativeFrame" | "compact">
  firstPlayer?: FirstPlayerOffer
  tableSlotColors?: readonly string[]
  windowOverlay?: ReactNode
  onBoardSizeChange?: (size: BoardSize) => void
  testID?: string
}

export interface BoardSize {
  width: number
  height: number
}

export const GameBoardStage = SCREEN_PINNING_AVAILABLE ? PinnedGameBoardStage : LegacyGameBoardStage

function PinnedGameBoardStage({
  playerCount,
  layoutVariant,
  renderGrid,
  menu,
  firstPlayer,
  tableSlotColors,
  windowOverlay,
  onBoardSizeChange,
  testID = "game-board",
}: GameBoardStageProps) {
  const window = useWindowDimensions()
  const spansHinge = useWindowSpansHinge()
  const turnAngle = useSharedValue(0)
  const hinge = useAnimatedHinge()
  const unfolded = useDerivedValue(() => hingeUnfold(hinge.value))
  const [landed, setLanded] = useState<TableTurn["landed"]>()
  const [kept, setKept] = useState(false)
  // why: closing the Duo ends the turn, so the next opening offers it again from the center column.
  if (!spansHinge && (landed || kept)) {
    setLanded(undefined)
    setKept(false)
  }
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
  // why: closing the Duo or turning its window ends a turn in progress; cancelling makes its timing callback report unfinished, so it cannot land the next opening's board.
  useEffect(() => {
    cancelAnimation(turnAngle)
    turnAngle.set(0)
  }, [spansHinge, metrics.holderAngle, landed, turnAngle])

  const gridLayout = usePlayerGridLayout({
    playerCount,
    width,
    height,
    fontScale,
    layoutVariant,
    holderAngle: landed ? undefined : holderAngle,
  })
  const offering = !!gridLayout.centerColumn && !kept
  const tableTurn = useMemo<TableTurn | undefined>(
    () => (gridLayout.centerColumn || landed ? { angle: turnAngle, unfolded, landed } : undefined),
    [gridLayout.centerColumn, landed, turnAngle, unfolded],
  )
  useEffect(() => onBoardSizeChange?.({ width, height }), [onBoardSizeChange, width, height])
  const boardAnchor = useMemo(
    () => getPlayerGridMenuAnchor(playerCount, gridLayout),
    [playerCount, gridLayout],
  )
  const tabs = useMemo(
    () => firstPlayerTabs(boardAnchor, getPlayerGridFacings(playerCount, gridLayout)),
    [boardAnchor, playerCount, gridLayout],
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
            tableTurn,
          }
        : undefined,
    [pinned, width, height, fontScale, metrics.insets, holderAngle, tableTurn],
  )
  const menuOpen = menu.open && !menu.exitAction
  const bag = openToolBag(menu.actions)

  return (
    <View testID={testID} style={$stage}>
      <ScreenPinnedView style={StyleSheet.absoluteFill} onOrientationChange={setMetrics}>
        <TurnedBoardContext.Provider value={holderAngle !== 0}>
          <View collapsable={false} style={pinned ? [$pinnedBoard, { width, height }] : $fill}>
            {renderGrid(boardOrientation)}
            <GameMenuBackdrop open={menuOpen} onClose={bag?.onToggle ?? menu.onClose} />
            {offering ? null : (
              <GameMenuCluster
                open={menu.open}
                anchor={boardAnchor}
                holderAnchor={holderAnchor}
                holderHeight={holderAngle % 180 === 0 ? height : width}
                facingAngle={holderAngle}
                actions={menu.actions}
                compact={playerCount > 2}
                exitAction={menu.exitAction}
                signal={menu.signal}
                statusLine={menu.statusLine}
                onToggle={menu.onToggle}
              />
            )}
            {firstPlayer && !offering && !menu.open && !menu.exitAction ? (
              <FirstPlayerTabs offer={firstPlayer} tabs={tabs} />
            ) : null}
            {offering ? (
              <TableTurnOffer
                key={holderAngle}
                angle={turnAngle}
                unfolded={unfolded}
                holderAngle={holderAngle}
                tableSlotColors={tableSlotColors}
                onLand={setLanded}
                onKeep={() => {
                  turnAngle.set(withTiming(0, { duration: 250 }))
                  setKept(true)
                }}
              />
            ) : null}
          </View>
        </TurnedBoardContext.Provider>
      </ScreenPinnedView>
      {windowOverlay}
    </View>
  )
}

function LegacyGameBoardStage({
  playerCount,
  layoutVariant,
  renderGrid,
  menu,
  firstPlayer,
  windowOverlay,
  onBoardSizeChange,
  testID = "game-board",
}: GameBoardStageProps) {
  const boardOrientation = useGameBoardOrientation()
  const { width, height, fontScale, rotation } = boardOrientation
  const gridLayout = usePlayerGridLayout({ playerCount, width, height, fontScale, layoutVariant })
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

  return (
    <Animated.View
      ref={boardOrientation.frameRef}
      collapsable={false}
      testID={testID}
      style={$stage}
    >
      {renderGrid(boardOrientation)}
      <GameRadialMenu
        {...menu}
        anchor={menuAnchor}
        boardAnchor={rotateGameBoardAnchor(menuAnchor, -rotation)}
        nativeFrame={boardOrientation.nativeFrame}
        compact={playerCount > 2}
      />
      {firstPlayer && !menu.open && !menu.exitAction ? (
        <FirstPlayerTabs offer={firstPlayer} tabs={tabs} />
      ) : null}
      {windowOverlay}
    </Animated.View>
  )
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

const $pinnedBoard: ViewStyle = { position: "absolute", left: 0, top: 0 }
const $stage: ViewStyle = { flex: 1, width: "100%" }
const $fill: ViewStyle = StyleSheet.absoluteFill
