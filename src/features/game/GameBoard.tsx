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
import type { TeamDesign } from "@/components/PlayerGrid"
import { PlayerLayoutPicker } from "@/components/PlayerLayoutPicker"
import { ResultLiveRegion } from "@/components/ResultAnnouncer"
import { SegmentedControl } from "@/components/SegmentedControl"
import { Text } from "@/components/Text"
import { gameRules, openRules } from "@/features/rules/gameRules"
import { prefetchRules } from "@/features/rules/rulesSource"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useStableCallbacks } from "@/utils/useStableCallbacks"
import { useStructurallyStable } from "@/utils/useStructurallyStable"

import type { DiceTool } from "./dice"
import { GameBoardStage, type GameBoardStageProps } from "./GameBoardStage"
import { getPlayerGridLayoutOptions, type PlayerGridLayoutVariant } from "./playerLayouts"
import type { GamePlayer } from "./types"
import type { CommanderAttack } from "./useCommanderAttack"
import { useDice } from "./useDice"
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
    teamDesign?: { value: TeamDesign; onChange: (design: TeamDesign) => void }
  }
  /** why: a Two-Headed Giant board seats team panels, so the menu and tabs sit by the teams. */
  teamCount?: number
  petals: readonly [BoardPetal, BoardPetal]
  attack: Pick<CommanderAttack, "dispatch">
  onDiceTool?: () => void
  onLog?: () => void
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
  teamCount,
  attack: { dispatch },
  onDiceTool,
  onLog,
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
  const seatDice = useDice(players, gameId, system)
  // why: rolling by hand means the players skipped the first-player offer.
  const rollFor = stable("bagRoll", (player: GamePlayer, tool: DiceTool) => {
    onDiceTool?.()
    seatDice.grid.bag.rollFor(player, tool)
  })
  const dice = {
    ...seatDice,
    grid: { ...seatDice.grid, bag: { ...seatDice.grid.bag, rollFor } },
  }
  const rules = gameRules(system)
  useEffect(() => {
    if (rules?.kind === "text") prefetchRules(rules)
  }, [rules])
  const hasRules = Boolean(rules && (rules.kind === "link" || onRules))
  const playerCount = teamCount ?? players.length
  const canPickLayout = getPlayerGridLayoutOptions(playerCount).length > 1 || Boolean(layout.seats)

  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const closeLayout = useCallback(() => setLayoutOpen(false), [])
  // why: the menu pauses a commander attack rather than ending it, so closing the menu returns to the attack as it was. A petal that takes over or leaves the board finishes the attack first, sending any held hits as the attacker's check would.
  const finishAttack = useCallback(() => dispatch({ type: "send" }), [dispatch])
  const fromMenu = useCallback(
    (run: () => void, { keepsAttack = false } = {}) =>
      (event?: GestureResponderEvent) => {
        setDialogOrigin(
          event?.nativeEvent
            ? { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }
            : undefined,
        )
        setMenuOpen(false)
        if (!keepsAttack) finishAttack()
        run()
      },
    [finishAttack],
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
  const showLog = stable("log", () => onLog?.())
  const decksEnabled = Boolean(onDecks)
  const logEnabled = Boolean(onLog)
  const actions: GameMenuActions = useMemo(
    () => [
      {
        kind: "layout",
        label: translate("board:menu.layout"),
        disabled: !canPickLayout,
        onPress: fromMenu(() => setLayoutOpen(true)),
      },
      {
        kind: "history",
        label: translate("board:menu.log"),
        disabled: !logEnabled,
        onPress: fromMenu(showLog),
      },
      { ...thirdPetal, onPress: fromMenu(pressThird) },
      hasRules
        ? {
            kind: "rules",
            label: translate("board:menu.rules"),
            onPress: fromMenu(showRules, { keepsAttack: true }),
          }
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
      endPetal,
      fromMenu,
      hasRules,
      logEnabled,
      pressEnd,
      pressThird,
      showDecks,
      showLog,
      showRules,
      thirdPetal,
    ],
  )

  const toggleMenu = useCallback(() => setMenuOpen((current) => !current), [])
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
    teamBoard: teamCount !== undefined,
    layout,
    closeLayout,
    menu: {
      open: menuOpen,
      actions,
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
            // why: every app destination leaves the board, Update app and Events included.
            onChoose: finishAttack,
          }
        : undefined,
  }
}

function petal({ onPress: _onPress, ...shown }: BoardPetal) {
  return shown
}

export type GameBoardProps = Omit<
  GameBoardStageProps,
  "playerCount" | "teamBoard" | "layoutVariant" | "menu" | "windowOverlay"
> & { chrome: BoardChrome }

export function GameBoard({ chrome, ...stage }: GameBoardProps) {
  const { navigation, layout } = chrome
  return (
    <>
      <GameBoardStage
        {...stage}
        playerCount={chrome.playerCount}
        teamBoard={chrome.teamBoard}
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
  layout: { value, onChange, seats, teamDesign },
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
        {teamDesign ? (
          <>
            <Text tx="board:teams.panel" preset="subheading" style={themed($dialogText)} />
            <SegmentedControl
              testID="team-design"
              accessibilityLabel={translate("board:teams.panel")}
              segments={[
                { id: "merged", label: translate("board:teams.merged") },
                { id: "split", label: translate("board:teams.split") },
              ]}
              selectedId={teamDesign.value}
              onSelect={(id) => teamDesign.onChange(id === "split" ? "split" : "merged")}
            />
          </>
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
