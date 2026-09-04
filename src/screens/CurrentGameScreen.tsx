import { useState } from "react"
import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native"
import { useWindowDimensions, View } from "react-native"
import { useKeepAwake } from "expo-keep-awake"

import { Button } from "@/components/Button"
import { ChoiceButton, CHOICE_RADIUS } from "@/components/ChoiceButton"
import { DialogCard, $dialogActions, $dialogText, type DialogOrigin } from "@/components/DialogCard"
import { FloatingAppNavigation } from "@/components/FloatingAppNavigation"
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
import { incomingCommanderDamage, isEliminatedByCommanderDamage } from "@/features/game/domain"
import type { LocalGameRepository } from "@/features/game/localPersistence"
import {
  counterValueLabel,
  playSystemId,
  supportsCommanderDamage,
} from "@/features/game/playSystems"
import type { GamePlayer, LocalGame, PlayerId } from "@/features/game/types"
import { useLocalGame } from "@/features/game/useLocalGame"
import { useMenuButtonStyle } from "@/features/game/useMenuButtonStyle"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export interface CurrentGameScreenProps {
  initialGame: LocalGame
  fresh?: boolean
  initialEndOpen?: boolean
  onDecks?: () => void
  onHistory?: () => void
  onSetup?: () => void
  onConnect?: () => void
  onSettings?: () => void
  onAccount?: () => void
  accountLabel?: "Account" | "Sign in"
  onGameEnded: (gameId: string) => void
  onGameAbandoned?: () => void
  repository?: LocalGameRepository
}

export function CurrentGameScreen({
  initialGame,
  fresh = false,
  initialEndOpen = false,
  onDecks,
  onHistory,
  onSetup,
  onConnect,
  onSettings,
  onAccount,
  accountLabel = "Account",
  onGameEnded,
  onGameAbandoned,
  repository,
}: CurrentGameScreenProps) {
  useKeepAwake("count-local-game")
  const menuButtonStyle = useMenuButtonStyle()
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const runtime = useLocalGame(initialGame, repository)
  const system = playSystemId(runtime.game.system)
  const { width, height, fontScale } = useWindowDimensions()
  const [menuOpen, setMenuOpen] = useState(false)
  const [isFresh, setIsFresh] = useState(fresh)
  const [endConfirmationOpen, setEndConfirmationOpen] = useState(initialEndOpen)
  const [winnerPlayerIds, setWinnerPlayerIds] = useState<PlayerId[]>([])
  const [drawSelected, setDrawSelected] = useState(false)
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false)
  const [menuDialogOrigin, setMenuDialogOrigin] = useState<DialogOrigin>()
  const [armedPlayerId, setArmedPlayerId] = useState<PlayerId | null>(null)
  const commanderDamageEnabled = supportsCommanderDamage(system, runtime.game.format)

  function toggleSword(player: GamePlayer) {
    setArmedPlayerId((current) => (current === player.id ? null : player.id))
  }

  function assignCommanderDamage(target: GamePlayer, step: number) {
    if (!armedPlayerId || armedPlayerId === target.id) return
    runtime.assignCommanderDamage(armedPlayerId, target.id, step)
    setIsFresh(false)
  }

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
    if (!endResultSelected) return
    const ended = winnerPlayerIds.length
      ? runtime.finish({ kind: "win", winnerPlayerIds })
      : runtime.finish({ kind: "draw" })
    setEndConfirmationOpen(false)
    if (ended.status !== "active") setTimeout(() => onGameEnded(ended.id), 0)
  }

  function abandonGame() {
    if (!onGameAbandoned) return
    runtime.discard()
    setEndConfirmationOpen(false)
    setTimeout(onGameAbandoned, 0)
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
      kind: "setup",
      label: "Setup",
      disabled: !onSetup,
      onPress: () => {
        closeMenu()
        onSetup?.()
      },
    },
    {
      kind: "history",
      label: "History",
      disabled: !onHistory,
      onPress: () => {
        closeMenu()
        onHistory?.()
      },
    },
    isFresh
      ? {
          kind: "connect",
          label: "Connect",
          disabled: !onConnect,
          onPress: () => {
            closeMenu()
            onConnect?.()
          },
        }
      : {
          kind: "end-game",
          label: "End",
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
          system={system}
          layoutVariant={layoutVariant}
          disabled={menuOpen}
          isPlayerEliminated={
            commanderDamageEnabled
              ? (player) => isEliminatedByCommanderDamage(runtime.game, player.id)
              : undefined
          }
          commanderDamage={
            commanderDamageEnabled
              ? {
                  incomingFor: (player) => incomingCommanderDamage(runtime.game, player.id),
                  armedPlayerId,
                  onPressSword: toggleSword,
                  onStage: assignCommanderDamage,
                }
              : undefined
          }
          onChange={(playerId, delta) => {
            runtime.changeLife(playerId, delta)
            setIsFresh(false)
          }}
        />
        <GameRadialMenu
          open={menuOpen}
          anchor={menuAnchor}
          compact={playerCount > 2}
          actions={radialActions}
          variant={menuButtonStyle}
          seatColors={runtime.game.players.map((player) => player.color)}
          onToggle={() => {
            setArmedPlayerId(null)
            setMenuOpen((current) => !current)
          }}
          onClose={closeMenu}
        />
        {menuOpen && onDecks && onSettings && onAccount ? (
          <FloatingAppNavigation
            destinationLabel="Decks"
            accountLabel={accountLabel}
            onDestination={onDecks}
            onSettings={onSettings}
            onAccount={onAccount}
          />
        ) : null}
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
              text="Choose a winner or record a draw."
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
                  detail={counterValueLabel(system, player.life)}
                  accentColor={player.color}
                  Leading={({ color }) => (
                    <PlayerMark seatNumber={player.seat} color={color} size={28} />
                  )}
                  accessibilityLabel={`${player.name}, ${counterValueLabel(system, player.life)}${selected ? ", winner" : ""}`}
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
              testID="abandon-game-button"
              text="Abandon"
              disabled={!onGameAbandoned}
              style={themed($dialogAction)}
              onPress={abandonGame}
            />
            <Button
              testID="confirm-end-game-button"
              text="End game"
              disabled={!endResultSelected}
              preset="reversed"
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
