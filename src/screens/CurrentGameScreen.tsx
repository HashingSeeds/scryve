import { useCallback, useMemo, useRef, useState } from "react"
import type { GestureResponderEvent, ViewStyle } from "react-native"
import { useKeepAwake } from "expo-keep-awake"

import { Button } from "@/components/Button"
import { DialogCard, $dialogText, type DialogOrigin } from "@/components/DialogCard"
import { FloatingAppNavigation } from "@/components/FloatingAppNavigation"
import { type RadialMenuAction } from "@/components/GameRadialMenu"
import { getPlayerGridLayoutOptions, PlayerGrid } from "@/components/PlayerGrid"
import { PlayerLayoutPicker } from "@/components/PlayerLayoutPicker"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import {
  hasLocalGameStarted,
  incomingCommanderDamage,
  isEliminatedByCommanderDamage,
} from "@/features/game/domain"
import { GameBoardStage } from "@/features/game/GameBoardStage"
import { GameSavedToast } from "@/features/game/GameSavedToast"
import { LocalGameEndDialog } from "@/features/game/LocalGameEndDialog"
import type { LocalGameRepository } from "@/features/game/localPersistence"
import { supportsCommanderDamage } from "@/features/game/playSystems"
import type { GamePlayer, LocalGame, LocalGameResult, PlayerId } from "@/features/game/types"
import { useLocalGame } from "@/features/game/useLocalGame"
import { useMenuButtonStyle } from "@/features/game/useMenuButtonStyle"
import { useSeatColors } from "@/features/game/useSeatColors"
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
  onViewSummary: (gameId: string) => void
  onGameAbandoned?: () => void
  repository?: LocalGameRepository
  /** why: the signed-in account that a finished game uploads to. */
  ownerId?: string
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
  onViewSummary,
  onGameAbandoned,
  repository,
  ownerId,
}: CurrentGameScreenProps) {
  useKeepAwake("count-local-game", { suppressDeactivateWarnings: true })
  const menuButtonStyle = useMenuButtonStyle()
  const { themed } = useAppTheme()
  const runtime = useLocalGame(initialGame, repository, ownerId)
  const system = runtime.game.system
  const [menuOpen, setMenuOpen] = useState(false)
  const [freshBoard, setFreshBoard] = useState(fresh)
  const [savedGameId, setSavedGameId] = useState<string>()
  const isFresh = freshBoard && !hasLocalGameStarted(runtime.game)
  const [endSource, setEndSource] = useState<GameEndSource | undefined>(
    initialEndOpen ? "stale_game_prompt" : undefined,
  )
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false)
  const [menuDialogOrigin, setMenuDialogOrigin] = useState<DialogOrigin>()
  const [armedPlayerId, setArmedPlayerId] = useState<PlayerId | null>(null)
  const [inspectedPlayerId, setInspectedPlayerId] = useState<PlayerId | null>(null)
  const commanderDamageEnabled = supportsCommanderDamage(system, runtime.game.format)

  const runtimeRef = useRef(runtime)
  runtimeRef.current = runtime

  function toggleSword(player: GamePlayer) {
    setInspectedPlayerId(null)
    setArmedPlayerId((current) => (current === player.id ? null : player.id))
  }

  function assignCommanderDamage(target: GamePlayer, step: number) {
    if (!armedPlayerId || armedPlayerId === target.id) return
    runtime.assignCommanderDamage(armedPlayerId, target.id, step)
  }

  const captureMenuDialogOrigin = useCallback((event?: GestureResponderEvent) => {
    setMenuDialogOrigin(
      event?.nativeEvent ? { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY } : undefined,
    )
  }, [])
  const playerCount = runtime.game.players.length
  const layoutVariant = runtime.game.layout ?? "auto"
  const layoutOptions = getPlayerGridLayoutOptions(playerCount)

  function confirmEnd(result: LocalGameResult) {
    const ended = runtime.finish(result, endSource)
    if (ended.status === "active") {
      setEndSource(undefined)
      return
    }
    // why: a failed rematch save throws here, and the open dialog shows the error.
    runtime.rematch()
    setEndSource(undefined)
    setFreshBoard(true)
    setSavedGameId(ended.id)
  }

  const dismissSavedToast = useCallback(() => setSavedGameId(undefined), [])

  function abandonGame() {
    if (!onGameAbandoned) return
    runtime.discard()
    setEndSource(undefined)
    setTimeout(onGameAbandoned, 0)
  }

  const showEndConfirmation = useCallback(() => {
    setMenuOpen(false)
    setEndSource("game_menu")
  }, [])

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
  }, [])

  const toggleMenu = useCallback(() => {
    setMenuOpen((current) => !current)
  }, [])

  const undoAndCloseMenu = useCallback(() => {
    runtimeRef.current.undo()
    setMenuOpen(false)
  }, [])

  const exitCommanderMode = useCallback(() => {
    setArmedPlayerId(null)
    setInspectedPlayerId(null)
  }, [])

  function closePanel() {
    setLayoutPickerOpen(false)
  }

  const radialActions: readonly RadialMenuAction[] = useMemo(
    () => [
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
        onPress: undoAndCloseMenu,
      },
      {
        kind: "setup",
        label: "Game",
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
    ],
    [
      captureMenuDialogOrigin,
      closeMenu,
      isFresh,
      layoutOptions.length,
      onConnect,
      onHistory,
      onSetup,
      runtime.canUndo,
      showEndConfirmation,
      undoAndCloseMenu,
    ],
  )

  const seatColors = useSeatColors(runtime.game.players)
  const exitAction = useMemo(
    () =>
      armedPlayerId || inspectedPlayerId
        ? { label: "Exit commander damage", onPress: exitCommanderMode }
        : undefined,
    [armedPlayerId, inspectedPlayerId, exitCommanderMode],
  )

  return (
    <Screen
      preset="fixed"
      safeAreaEdges={[]}
      SystemBarsProps={{ hidden: true }}
      contentContainerStyle={themed($screen)}
    >
      <GameBoardStage
        playerCount={playerCount}
        layoutVariant={layoutVariant}
        renderGrid={(boardOrientation) => (
          <PlayerGrid
            boardOrientation={boardOrientation}
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
        )}
        menu={{
          open: menuOpen,
          actions: radialActions,
          variant: menuButtonStyle,
          seatColors,
          exitAction,
          onToggle: toggleMenu,
          onClose: closeMenu,
        }}
        windowOverlay={
          menuOpen && onDecks && onSettings && onAccount ? (
            <FloatingAppNavigation
              destinationLabel="Decks"
              accountLabel={accountLabel}
              onDestination={onDecks}
              onSettings={onSettings}
              onAccount={onAccount}
            />
          ) : null
        }
      />

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

      {savedGameId ? (
        <GameSavedToast
          key={savedGameId}
          onViewSummary={() => onViewSummary(savedGameId)}
          onDismiss={dismissSavedToast}
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
const $menuItem: ThemedStyle<ViewStyle> = () => ({ minHeight: 48 })
