import { useState } from "react"
import type { GestureResponderEvent, ViewStyle } from "react-native"
import { useWindowDimensions, View } from "react-native"
import { useKeepAwake } from "expo-keep-awake"

import { Button } from "@/components/Button"
import { DialogCard, $dialogText, type DialogOrigin } from "@/components/DialogCard"
import { FloatingAppNavigation } from "@/components/FloatingAppNavigation"
import { GameRadialMenu, type RadialMenuAction } from "@/components/GameRadialMenu"
import {
  getPlayerGridLayoutOptions,
  getPlayerGridLayout,
  getPlayerGridMenuAnchor,
  PlayerGrid,
} from "@/components/PlayerGrid"
import { PlayerLayoutPicker } from "@/components/PlayerLayoutPicker"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import {
  hasLocalGameStarted,
  incomingCommanderDamage,
  isEliminatedByCommanderDamage,
} from "@/features/game/domain"
import { LocalGameEndDialog } from "@/features/game/LocalGameEndDialog"
import type { LocalGameRepository } from "@/features/game/localPersistence"
import { supportsCommanderDamage } from "@/features/game/playSystems"
import type { GamePlayer, LocalGame, LocalGameResult, PlayerId } from "@/features/game/types"
import { useLocalGame } from "@/features/game/useLocalGame"
import { useMenuButtonStyle } from "@/features/game/useMenuButtonStyle"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import type { GameEndSource } from "@/utils/analytics"

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
  const { themed } = useAppTheme()
  const runtime = useLocalGame(initialGame, repository)
  const system = runtime.game.system
  const { width, height, fontScale } = useWindowDimensions()
  const [menuOpen, setMenuOpen] = useState(false)
  const isFresh = fresh && !hasLocalGameStarted(runtime.game)
  const [endSource, setEndSource] = useState<GameEndSource | undefined>(
    initialEndOpen ? "stale_game_prompt" : undefined,
  )
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false)
  const [menuDialogOrigin, setMenuDialogOrigin] = useState<DialogOrigin>()
  const [armedPlayerId, setArmedPlayerId] = useState<PlayerId | null>(null)
  const [inspectedPlayerId, setInspectedPlayerId] = useState<PlayerId | null>(null)
  const commanderDamageEnabled = supportsCommanderDamage(system, runtime.game.format)

  function toggleSword(player: GamePlayer) {
    setInspectedPlayerId(null)
    setArmedPlayerId((current) => (current === player.id ? null : player.id))
  }

  function assignCommanderDamage(target: GamePlayer, step: number) {
    if (!armedPlayerId || armedPlayerId === target.id) return
    runtime.assignCommanderDamage(armedPlayerId, target.id, step)
  }

  function captureMenuDialogOrigin(event?: GestureResponderEvent) {
    setMenuDialogOrigin(
      event?.nativeEvent ? { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY } : undefined,
    )
  }
  const playerCount = runtime.game.players.length
  const layoutVariant = runtime.game.layout ?? "auto"
  const layoutOptions = getPlayerGridLayoutOptions(playerCount)
  const gridLayout = getPlayerGridLayout({
    playerCount,
    width,
    height,
    fontScale,
    layoutVariant,
  })
  const menuAnchor = getPlayerGridMenuAnchor(playerCount, gridLayout)

  function confirmEnd(result: LocalGameResult) {
    const ended = runtime.finish(result, endSource)
    setEndSource(undefined)
    if (ended.status !== "active") setTimeout(() => onGameEnded(ended.id), 0)
  }

  function abandonGame() {
    if (!onGameAbandoned) return
    runtime.discard()
    setEndSource(undefined)
    setTimeout(onGameAbandoned, 0)
  }

  function showEndConfirmation() {
    setMenuOpen(false)
    setEndSource("game_menu")
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
      label: isFresh ? "Setup" : "New",
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
          lifeStep={runtime.game.lifeStep}
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
                  inspection: { playerId: inspectedPlayerId, onChange: setInspectedPlayerId },
                  onPressSword: toggleSword,
                  onStage: assignCommanderDamage,
                }
              : undefined
          }
          onChange={runtime.changeLife}
        />
        {!armedPlayerId && !inspectedPlayerId ? (
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
        ) : null}
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
          <PlayerLayoutPicker
            playerCount={playerCount}
            value={layoutVariant}
            testID="layout"
            onChange={(layout) => {
              runtime.changeLayout(layout)
              closePanel()
            }}
          />
          <Button tx="game:cancel" style={themed($menuItem)} onPress={closePanel} />
        </DialogCard>
      ) : null}

      {endSource ? (
        <LocalGameEndDialog
          game={runtime.game}
          origin={menuDialogOrigin}
          onClose={() => setEndSource(undefined)}
          onEnd={confirmEnd}
          onAbandon={onGameAbandoned ? abandonGame : undefined}
        />
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
const $menuItem: ThemedStyle<ViewStyle> = () => ({ minHeight: 48 })
