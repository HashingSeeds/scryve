import { useState } from "react"
import type { ViewStyle } from "react-native"
import { useWindowDimensions, View } from "react-native"
import { useKeepAwake } from "expo-keep-awake"

import { Button } from "@/components/Button"
import { DialogCard, $dialogActions, $dialogButton, $dialogText } from "@/components/DialogCard"
import { GameRadialMenu, type RadialMenuAction } from "@/components/GameRadialMenu"
import {
  getPlayerGridLayoutOptions,
  getPlayerGridLayout,
  getPlayerGridMenuAnchor,
  PlayerGrid,
  type PlayerGridLayoutVariant,
} from "@/components/PlayerGrid"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { LocalGameRepository } from "@/features/game/localPersistence"
import type { LocalGame } from "@/features/game/types"
import { useLocalGame } from "@/features/game/useLocalGame"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export interface CurrentGameScreenProps {
  initialGame: LocalGame
  onHome: () => void
  onGameEnded: (gameId: string) => void
  repository?: LocalGameRepository
}

export function CurrentGameScreen({
  initialGame,
  onHome,
  onGameEnded,
  repository,
}: CurrentGameScreenProps) {
  useKeepAwake("count-local-game")
  const { themed } = useAppTheme()
  const runtime = useLocalGame(initialGame, repository)
  const { width, height, fontScale } = useWindowDimensions()
  const [menuOpen, setMenuOpen] = useState(false)
  const [endConfirmationOpen, setEndConfirmationOpen] = useState(false)
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false)
  const [layoutVariant, setLayoutVariant] = useState<PlayerGridLayoutVariant>("auto")
  const playerCount = runtime.game.players.length
  const layoutOptions = getPlayerGridLayoutOptions(playerCount)
  const gridLayout = getPlayerGridLayout({
    playerCount,
    width,
    height,
    fontScale,
    layoutVariant,
  })
  const menuAnchor = getPlayerGridMenuAnchor(playerCount, gridLayout)

  function confirmEnd() {
    const ended = runtime.finish()
    setEndConfirmationOpen(false)
    if (ended.status !== "active") setTimeout(() => onGameEnded(ended.id), 0)
  }

  function showEndConfirmation() {
    setMenuOpen(false)
    setEndConfirmationOpen(true)
  }

  function closeMenu() {
    setMenuOpen(false)
  }

  function closePanel() {
    setLayoutPickerOpen(false)
  }

  const radialActions: readonly RadialMenuAction[] = [
    ...(layoutOptions.length > 1
      ? [
          {
            id: "layout",
            label: "Layout",
            glyph: "▦",
            color: "#FBC878",
            onPress: () => {
              setMenuOpen(false)
              setLayoutPickerOpen(true)
            },
          } satisfies RadialMenuAction,
        ]
      : []),
    {
      id: "undo",
      label: "Undo",
      glyph: "↶",
      color: "#55C894",
      disabled: !runtime.canUndo,
      onPress: () => {
        runtime.undo()
        closeMenu()
      },
    },
    {
      id: "game-home",
      label: "Home",
      glyph: "⌂",
      color: "#7DB7E8",
      onPress: () => {
        closeMenu()
        onHome()
      },
    },
    {
      id: "end-game",
      label: "End game",
      glyph: "✓",
      color: "#D96767",
      onPress: showEndConfirmation,
    },
  ]

  return (
    <Screen
      preset="fixed"
      safeAreaEdges={[]}
      SystemBarsProps={{ hidden: true }}
      contentContainerStyle={themed($screen)}
    >
      <View testID="game-board" style={themed($board)}>
        <PlayerGrid
          players={runtime.game.players}
          layoutVariant={layoutVariant}
          disabled={menuOpen}
          onChange={runtime.changeLife}
        />
        <GameRadialMenu
          open={menuOpen}
          anchor={menuAnchor}
          compact={playerCount > 2}
          actions={radialActions}
          onToggle={() => setMenuOpen((current) => !current)}
          onClose={closeMenu}
        />
      </View>

      {layoutPickerOpen ? (
        <DialogCard
          visible
          onClose={closePanel}
          backdropTestID="layout-picker-backdrop"
          backdropAccessibilityLabel="Close layout chooser"
          dialogTestID="layout-picker-dialog"
          accessibilityViewIsModal
          wide
        >
          <Text text="Layout" preset="subheading" style={themed($dialogText)} />
          <View style={themed($layoutOptions)}>
            {layoutOptions.map((option) => (
              <Button
                key={option.variant}
                testID={`layout-${option.variant}`}
                text={option.label}
                accessibilityState={{ selected: layoutVariant === option.variant }}
                preset={layoutVariant === option.variant ? "reversed" : "default"}
                style={themed($layoutOption)}
                onPress={() => {
                  setLayoutVariant(option.variant)
                  closePanel()
                }}
              />
            ))}
          </View>
          <Button tx="localGame:cancel" style={themed($menuItem)} onPress={closePanel} />
        </DialogCard>
      ) : null}

      {endConfirmationOpen ? (
        <DialogCard
          visible
          onClose={() => setEndConfirmationOpen(false)}
          backdropTestID="end-game-backdrop"
          backdropAccessibilityLabel="Cancel ending the game"
          dialogTestID="end-game-dialog"
          dialogAccessibilityRole="alert"
        >
          <Text tx="localGame:endConfirmation" weight="bold" style={themed($dialogText)} />
          <View style={themed($dialogActions)}>
            <Button
              tx="localGame:cancel"
              style={themed($dialogButton)}
              onPress={() => setEndConfirmationOpen(false)}
            />
            <Button
              testID="confirm-end-game-button"
              tx="localGame:endGame"
              preset="reversed"
              style={themed($dialogButton)}
              onPress={confirmEnd}
            />
          </View>
        </DialogCard>
      ) : null}
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  width: "100%",
  justifyContent: "flex-start",
})
const $board: ThemedStyle<ViewStyle> = () => ({ flex: 1, width: "100%" })
const $layoutOptions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})
const $layoutOption: ThemedStyle<ViewStyle> = () => ({
  minWidth: 96,
  minHeight: 44,
  flexGrow: 1,
})
const $menuItem: ThemedStyle<ViewStyle> = () => ({ minHeight: 48 })
