import { useState } from "react"
import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native"
import { useWindowDimensions, View } from "react-native"
import { useKeepAwake } from "expo-keep-awake"

import { Button } from "@/components/Button"
import { ChoiceButton, CHOICE_RADIUS } from "@/components/ChoiceButton"
import { DialogCard, $dialogActions, $dialogText, type DialogOrigin } from "@/components/DialogCard"
import { GameRadialMenu, type RadialMenuAction } from "@/components/GameRadialMenu"
import {
  getPlayerGridLayoutOptions,
  getPlayerGridLayout,
  getPlayerGridMenuAnchor,
  PlayerGrid,
  type PlayerGridLayoutVariant,
} from "@/components/PlayerGrid"
import { DrawMark, PlayerMark } from "@/components/PlayerMark"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { LocalGameRepository } from "@/features/game/localPersistence"
import type { LocalGame, PlayerId } from "@/features/game/types"
import { useLocalGame } from "@/features/game/useLocalGame"
import { useMenuButtonStyle } from "@/features/game/useMenuButtonStyle"
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
  const menuButtonStyle = useMenuButtonStyle()
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const runtime = useLocalGame(initialGame, repository)
  const { width, height, fontScale } = useWindowDimensions()
  const [menuOpen, setMenuOpen] = useState(false)
  const [endConfirmationOpen, setEndConfirmationOpen] = useState(false)
  const [winnerPlayerIds, setWinnerPlayerIds] = useState<PlayerId[]>([])
  const [drawSelected, setDrawSelected] = useState(false)
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [menuDialogOrigin, setMenuDialogOrigin] = useState<DialogOrigin>()

  function captureMenuDialogOrigin(event?: GestureResponderEvent) {
    setMenuDialogOrigin(
      event?.nativeEvent ? { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY } : undefined,
    )
  }
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
    const ended =
      winnerPlayerIds.length > 0
        ? runtime.finish({ kind: "win", winnerPlayerIds })
        : drawSelected
          ? runtime.finish({ kind: "draw" })
          : runtime.abandon()
    setEndConfirmationOpen(false)
    if (ended.status !== "active") setTimeout(() => onGameEnded(ended.id), 0)
  }

  function toggleWinner(playerId: PlayerId) {
    setDrawSelected(false)
    setWinnerPlayerIds((current) =>
      current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId],
    )
  }

  const endResultSelected = winnerPlayerIds.length > 0 || drawSelected

  function selectDraw() {
    setWinnerPlayerIds([])
    setDrawSelected((current) => !current)
  }

  function showEndConfirmation() {
    setMenuOpen(false)
    setWinnerPlayerIds([])
    setDrawSelected(false)
    setEndConfirmationOpen(true)
  }

  function closeMenu() {
    setMenuOpen(false)
  }

  function closePanel() {
    setLayoutPickerOpen(false)
  }

  const radialActions: readonly RadialMenuAction[] = [
    {
      kind: "layout",
      label: "Layout",
      disabled: layoutOptions.length < 2,
      onPress: (event) => {
        captureMenuDialogOrigin(event)
        setMenuOpen(false)
        setLayoutPickerOpen(true)
      },
    },
    {
      kind: "undo",
      label: "Undo",
      disabled: !runtime.canUndo,
      onPress: () => {
        runtime.undo()
        closeMenu()
      },
    },
    {
      kind: "status",
      label: "Status",
      onPress: (event) => {
        captureMenuDialogOrigin(event)
        setMenuOpen(false)
        setStatusOpen(true)
      },
    },
    {
      kind: "home",
      label: "Home",
      onPress: () => {
        closeMenu()
        onHome()
      },
    },
    {
      kind: "end-game",
      label: "End game",
      onPress: (event) => {
        captureMenuDialogOrigin(event)
        showEndConfirmation()
      },
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
          variant={menuButtonStyle}
          seatColors={runtime.game.players.map((player) => player.color)}
          onToggle={() => setMenuOpen((current) => !current)}
          onClose={closeMenu}
        />
      </View>

      {layoutPickerOpen ? (
        <DialogCard
          visible
          onClose={closePanel}
          origin={menuDialogOrigin}
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
          <Button tx="game:cancel" style={themed($menuItem)} onPress={closePanel} />
        </DialogCard>
      ) : null}

      {statusOpen ? (
        <DialogCard
          visible
          onClose={() => setStatusOpen(false)}
          origin={menuDialogOrigin}
          backdropTestID="game-status-backdrop"
          backdropAccessibilityLabel="Close game status"
          dialogTestID="game-status-dialog"
          accessibilityViewIsModal
        >
          <Text text="Game status" preset="subheading" style={themed($dialogText)} />
          <Text
            testID="game-status-summary"
            text={`${playerCount} players · started at ${runtime.game.startingLife} life`}
            style={themed($dialogText)}
          />
          <Text
            text="Local game — everything is saved on this device."
            size="xs"
            style={themed($dialogText)}
          />
          <Button text="Close" style={themed($menuItem)} onPress={() => setStatusOpen(false)} />
        </DialogCard>
      ) : null}

      {endConfirmationOpen ? (
        <DialogCard
          visible
          onClose={() => setEndConfirmationOpen(false)}
          origin={menuDialogOrigin}
          backdropTestID="end-game-backdrop"
          backdropAccessibilityLabel="Cancel ending the game"
          dialogTestID="end-game-dialog"
          dialogAccessibilityRole="alert"
        >
          <View style={themed($dialogHeader)}>
            <Text text="Who won?" preset="subheading" />
            <Text
              text="Skip to end without recording a result."
              size="xs"
              style={themed($dialogSubtitle)}
            />
          </View>
          <View style={themed($resultChoices)}>
            {runtime.game.players.map((player) => {
              const selected = winnerPlayerIds.includes(player.id)
              return (
                <ChoiceButton
                  key={player.id}
                  testID={`end-game-winner-${player.seat}`}
                  text={player.name}
                  detail={`${player.life} life`}
                  accentColor={player.color}
                  Leading={({ color }) => (
                    <PlayerMark seatNumber={player.seat} color={color} size={28} />
                  )}
                  accessibilityLabel={`${player.name}, ${player.life} life${selected ? ", winner" : ""}`}
                  selected={selected}
                  onPress={() => toggleWinner(player.id)}
                />
              )
            })}
            <ChoiceButton
              testID="end-game-result-draw"
              text="Draw"
              accentColor={colors.palette.neutral400}
              Leading={({ color }) => <DrawMark color={color} />}
              selected={drawSelected}
              onPress={selectDraw}
            />
          </View>
          <View style={themed($dialogActions)}>
            <Button
              tx="game:cancel"
              style={themed($dialogAction)}
              onPress={() => setEndConfirmationOpen(false)}
            />
            <Button
              testID="confirm-end-game-button"
              tx={endResultSelected ? "game:finish" : "game:abandon"}
              preset={endResultSelected ? "reversed" : "filled"}
              style={themed($dialogAction)}
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
const $dialogHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $dialogSubtitle: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $resultChoices: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $dialogAction: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  minHeight: 48,
  borderRadius: CHOICE_RADIUS,
})
