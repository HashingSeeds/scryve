import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import type { GestureResponderEvent, ViewStyle } from "react-native"
import { ScrollView } from "react-native"
import { useKeepAwake } from "expo-keep-awake"

import type { AccountEntry } from "@/components/AppUtilityMenu"
import { Button } from "@/components/Button"
import { $dialogText, DialogCard, type DialogOrigin } from "@/components/DialogCard"
import { FloatingAppNavigation } from "@/components/FloatingAppNavigation"
import type {
  GameMenuActions,
  GameMenuSignal,
  GameMenuStatusLine,
  RadialMenuAction,
} from "@/components/GameRadialMenu"
import { PlayerLayoutPicker } from "@/components/PlayerLayoutPicker"
import { ResultLiveRegion } from "@/components/ResultAnnouncer"
import { Text } from "@/components/Text"
import { gameRules, openRules } from "@/features/rules/gameRules"
import { prefetchRules } from "@/features/rules/rulesSource"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useStableCallbacks } from "@/utils/useStableCallbacks"
import { useStructurallyStable } from "@/utils/useStructurallyStable"

import { GameBoardStage, type GameBoardStageProps } from "./GameBoardStage"
import { getPlayerGridLayoutOptions, type PlayerGridLayoutVariant } from "./playerLayouts"
import type { GamePlayer } from "./types"
import type { CommanderAttack } from "./useCommanderAttack"
import { closingMenu, useDice } from "./useDice"
import type { SystemId } from "../../../convex/lib/systems"

export type BoardPetal = Pick<
  RadialMenuAction,
  "kind" | "label" | "detail" | "disabled" | "blocked"
> & { onPress: () => void }

export interface BoardChromeOptions {
  gameId: string
  system: SystemId | undefined
  players: readonly Pick<GamePlayer, "id" | "name">[]
  layout: {
    value: PlayerGridLayoutVariant
    onChange: (layout: PlayerGridLayoutVariant) => void
    seats?: ReactNode
  }
  petals: readonly [BoardPetal, BoardPetal]
  attack: Pick<CommanderAttack, "dispatch" | "inspectedPlayerId">
  onDiceTool?: () => void
  signal?: GameMenuSignal
  statusLine?: GameMenuStatusLine
  accountEntry?: AccountEntry
  onRules?: (system: SystemId, ruleId?: string) => void
  onDecks?: () => void
  onHistory?: () => void
  onSettings?: () => void
  onSupport?: () => void
  onAccount?: () => void
}

export type BoardChrome = ReturnType<typeof useBoardChrome>

export function useBoardChrome({
  gameId,
  system,
  players,
  layout,
  petals: [third, end],
  attack: { dispatch, inspectedPlayerId },
  onDiceTool,
  signal,
  statusLine,
  accountEntry,
  onRules,
  onDecks,
  onHistory,
  onSettings,
  onSupport,
  onAccount,
}: BoardChromeOptions) {
  useKeepAwake(undefined, { suppressDeactivateWarnings: true })
  const stable = useStableCallbacks()
  const [menuOpen, setMenuOpen] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [dialogOrigin, setDialogOrigin] = useState<DialogOrigin>()
  const dice = useDice(players, gameId, system)
  const rules = gameRules(system)
  useEffect(() => {
    if (rules?.kind === "text") prefetchRules(rules)
  }, [rules])
  const hasRules = Boolean(rules && (rules.kind === "link" || onRules))
  const playerCount = players.length
  const canPickLayout = getPlayerGridLayoutOptions(playerCount).length > 1 || Boolean(layout.seats)

  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const closeLayout = useCallback(() => setLayoutOpen(false), [])
  const fromMenu = useCallback(
    (run: () => void) => (event?: GestureResponderEvent) => {
      setDialogOrigin(
        event?.nativeEvent ? { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY } : undefined,
      )
      setMenuOpen(false)
      run()
    },
    [],
  )
  const pressThird = stable("third", third.onPress)
  const pressEnd = stable("end", end.onPress)
  const thirdPetal = useStructurallyStable(petal(third))
  const endPetal = useStructurallyStable(petal(end))
  const showRules = stable(
    "rules",
    () => rules && openRules(rules, () => system && onRules?.(system)),
  )
  const showDecks = stable("decks", () => onDecks?.())
  const pickedDiceTool = stable("diceTool", () => {
    setMenuOpen(false)
    onDiceTool?.()
  })
  const diceTools = useMemo(
    () => closingMenu(dice.tools, pickedDiceTool),
    [dice.tools, pickedDiceTool],
  )
  const decksEnabled = Boolean(onDecks)
  const actions: GameMenuActions = useMemo(
    () => [
      {
        kind: "layout",
        label: translate("board:menu.layout"),
        disabled: !canPickLayout,
        onPress: fromMenu(() => setLayoutOpen(true)),
      },
      { kind: "dice", label: translate("board:menu.dice"), tools: diceTools },
      { ...thirdPetal, onPress: fromMenu(pressThird) },
      hasRules
        ? { kind: "rules", label: translate("board:menu.rules"), onPress: fromMenu(showRules) }
        : {
            kind: "decks",
            label: translate("common:appNavigation.decks"),
            disabled: !decksEnabled,
            onPress: fromMenu(showDecks),
          },
      { ...endPetal, onPress: fromMenu(pressEnd) },
    ],
    [
      canPickLayout,
      decksEnabled,
      diceTools,
      endPetal,
      fromMenu,
      hasRules,
      pressEnd,
      pressThird,
      showDecks,
      showRules,
      thirdPetal,
    ],
  )

  const toggleMenu = useCallback(() => {
    dispatch({ type: "send" })
    setMenuOpen((current) => !current)
  }, [dispatch])
  const exitCommander = useCallback(() => dispatch({ type: "send" }), [dispatch])
  const { open: diceOpen, close: closeDice } = dice
  const diceArmed = dice.grid.armed
  const exitAction = useMemo(
    () =>
      diceOpen
        ? {
            label: translate("board:menu.closeDice"),
            onPress: closeDice,
            ...(diceArmed ? { heldTool: diceArmed } : {}),
          }
        : inspectedPlayerId
          ? { label: translate("board:menu.exitCommander"), onPress: exitCommander }
          : undefined,
    [closeDice, diceArmed, diceOpen, inspectedPlayerId, exitCommander],
  )
  const pressStatus = stable("status", () => {
    setMenuOpen(false)
    statusLine?.onPress()
  })
  const statusText = statusLine?.text
  const statusTone = statusLine?.tone
  const shownStatusLine = useMemo(
    () =>
      statusText && statusTone
        ? { text: statusText, tone: statusTone, onPress: pressStatus }
        : undefined,
    [pressStatus, statusText, statusTone],
  )

  return {
    menuOpen,
    layoutOpen,
    dialogOrigin,
    dice,
    playerCount,
    layout,
    closeLayout,
    menu: {
      open: menuOpen,
      actions,
      exitAction,
      signal,
      statusLine: shownStatusLine,
      onToggle: toggleMenu,
      onClose: closeMenu,
    },
    navigation:
      menuOpen && onHistory && onSettings && onSupport && onAccount
        ? {
            accountEntry,
            onDecks: hasRules ? onDecks : undefined,
            onHistory,
            onSettings,
            onSupport,
            onAccount,
          }
        : undefined,
  }
}

function petal({ onPress: _onPress, ...shown }: BoardPetal) {
  return shown
}

export type GameBoardProps = Omit<
  GameBoardStageProps,
  "playerCount" | "layoutVariant" | "menu" | "windowOverlay"
> & { chrome: BoardChrome }

export function GameBoard({ chrome, ...stage }: GameBoardProps) {
  const { navigation, layout } = chrome
  return (
    <>
      <GameBoardStage
        {...stage}
        playerCount={chrome.playerCount}
        layoutVariant={layout.value}
        menu={chrome.menu}
        windowOverlay={navigation ? <FloatingAppNavigation {...navigation} /> : null}
      />
      <ResultLiveRegion testID="dice-announcer" message={chrome.dice.webMessage} />
      {chrome.layoutOpen ? (
        <LayoutDialog
          playerCount={chrome.playerCount}
          layout={layout}
          origin={chrome.dialogOrigin}
          onClose={chrome.closeLayout}
        />
      ) : null}
    </>
  )
}

function LayoutDialog({
  playerCount,
  layout: { value, onChange, seats },
  origin,
  onClose,
}: {
  playerCount: number
  layout: BoardChromeOptions["layout"]
  origin?: DialogOrigin
  onClose: () => void
}) {
  const { themed } = useAppTheme()
  return (
    <DialogCard
      visible
      onClose={onClose}
      origin={origin}
      backdropTestID="layout-picker-backdrop"
      backdropAccessibilityLabel={translate("board:menu.closeLayoutChooser")}
      dialogTestID="layout-picker-dialog"
      accessibilityViewIsModal
      wide
    >
      {/* why: layouts plus the seat map outgrow a small phone, so they scroll and the button stays put. */}
      <ScrollView
        testID="layout-picker-scroll"
        style={$layoutScroll}
        contentContainerStyle={themed($layoutContent)}
      >
        <Text tx="board:menu.layout" preset="subheading" style={themed($dialogText)} />
        {getPlayerGridLayoutOptions(playerCount).length > 1 ? (
          <PlayerLayoutPicker
            playerCount={playerCount}
            value={value}
            testID="layout"
            onChange={(next) => {
              onChange(next)
              onClose()
            }}
          />
        ) : null}
        {seats ? (
          <>
            <Text tx="board:seats.title" preset="subheading" style={themed($dialogText)} />
            {seats}
          </>
        ) : null}
      </ScrollView>
      <Button
        tx={seats ? "common:done" : "common:cancel"}
        style={themed($dialogButton)}
        onPress={onClose}
      />
    </DialogCard>
  )
}

const $layoutScroll: ViewStyle = { flexGrow: 0, flexShrink: 1 }
const $layoutContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.lg })
const $dialogButton: ThemedStyle<ViewStyle> = () => ({ minHeight: 48 })
