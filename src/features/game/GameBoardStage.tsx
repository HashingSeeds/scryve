import { type ReactNode, useMemo, useState } from "react"
import { Dimensions, StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native"
import Animated from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { TurnedBoardContext } from "@/components/BoardPressable"
import {
  GameMenuBackdrop,
  GameMenuCluster,
  GameRadialMenu,
  type GameRadialMenuProps,
} from "@/components/GameRadialMenu"
import {
  getPlayerGridLayout,
  getPlayerGridMenuAnchor,
  type PlayerGridLayoutVariant,
  type PlayerGridProps,
} from "@/components/PlayerGrid"
import { useTopEdgeBand } from "@/utils/useTopEdgeBand"

import { boardPointToWindowPoint } from "./pinnedBoardGeometry"
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
  menu: Omit<
    GameRadialMenuProps,
    "anchor" | "boardAnchor" | "nativeFrame" | "compact" | "statusLine"
  >
  windowOverlay?: ReactNode
}

/** why: where the native module exists the board is pinned to the screen hardware so seats never move when the phone turns; web and older binaries keep the JS counter-rotation. */
export const GameBoardStage = SCREEN_PINNING_AVAILABLE ? PinnedGameBoardStage : LegacyGameBoardStage

function PinnedGameBoardStage({
  playerCount,
  layoutVariant,
  renderGrid,
  menu,
  windowOverlay,
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

  const gridLayout = useMemo(
    () => getPlayerGridLayout({ playerCount, width, height, fontScale, layoutVariant }),
    [playerCount, width, height, fontScale, layoutVariant],
  )
  const boardAnchor = useMemo(
    () => getPlayerGridMenuAnchor(playerCount, gridLayout),
    [playerCount, gridLayout],
  )
  const holderAnchor = boardPointToWindowPoint(boardAnchor, { width, height }, holderAngle)
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
  const menuOpen = menu.open && !menu.exitAction

  return (
    <View testID="game-board" style={$stage}>
      <ScreenPinnedView style={StyleSheet.absoluteFill} onOrientationChange={setMetrics}>
        <TurnedBoardContext.Provider value={holderAngle !== 0}>
          <View collapsable={false} style={pinned ? [$pinnedBoard, { width, height }] : $fill}>
            {renderGrid(boardOrientation)}
            <GameMenuBackdrop open={menuOpen} onClose={menu.onClose} />
            <GameMenuCluster
              open={menu.open}
              anchor={boardAnchor}
              holderAnchor={holderAnchor}
              facingAngle={holderAngle}
              actions={menu.actions}
              compact={playerCount > 2}
              variant={menu.variant}
              seatColors={menu.seatColors}
              exitAction={menu.exitAction}
              signal={menu.signal}
              onToggle={menu.onToggle}
            />
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
  windowOverlay,
}: GameBoardStageProps) {
  const boardOrientation = useGameBoardOrientation()
  const { width, height, fontScale, rotation } = boardOrientation
  const gridLayout = useMemo(
    () => getPlayerGridLayout({ playerCount, width, height, fontScale, layoutVariant }),
    [playerCount, width, height, fontScale, layoutVariant],
  )
  const topEdgeBand = useTopEdgeBand()
  const menuAnchor = useMemo(
    () =>
      rotateGameBoardAnchor(
        getPlayerGridMenuAnchor(playerCount, gridLayout, rotation === 0 ? topEdgeBand / height : 0),
        rotation,
      ),
    [playerCount, gridLayout, rotation, topEdgeBand, height],
  )

  return (
    <Animated.View
      ref={boardOrientation.frameRef}
      collapsable={false}
      testID="game-board"
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
      {windowOverlay}
    </Animated.View>
  )
}

const $pinnedBoard: ViewStyle = { position: "absolute", left: 0, top: 0 }
const $stage: ViewStyle = { flex: 1, width: "100%" }
const $fill: ViewStyle = StyleSheet.absoluteFill
