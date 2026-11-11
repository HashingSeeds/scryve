import { useCallback, useContext, useState } from "react"
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native"
import { Platform, useWindowDimensions, View } from "react-native"
import Animated, { useAnimatedStyle } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import type { SeatDeck } from "@/features/decks/useSeatDeckCards"
import type { DiceSeatChip, DiceTool } from "@/features/game/dice"
import { PARTNER_COMMANDER } from "@/features/game/domain"
import { type PlayerGridLayoutVariant, type SeatOrder } from "@/features/game/playerLayouts"
import { playSystemRules, type PlaySystemId } from "@/features/game/playSystems"
import type { TableRuntime } from "@/features/game/tableRuntime"
import type {
  CommanderBoardPlayer,
  CommanderSlot,
  GamePlayer,
  LifeDelta,
  PlayerId,
} from "@/features/game/types"
import type { CommanderAttack } from "@/features/game/useCommanderAttack"
import type { useGameBoardOrientation } from "@/features/game/useGameBoardOrientation"
import { tableItemRulesOf } from "@/features/rules/gameRules"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { radius } from "@/theme/radius"
import type { ThemedStyle } from "@/theme/types"
import { useStableCallbacks } from "@/utils/useStableCallbacks"
import { useTopEdgeBand } from "@/utils/useTopEdgeBand"

import { commanderBoardSeats, commanderFacing, commanderReach } from "./commanderDamageLayout"
import { counterOutReason, seatTableState } from "./CounterChips"
import type { LifeCardDice } from "./DiceSeatOverlay"
import { FirstPlayerTabsShownContext } from "./FirstPlayerTabs"
import { LifeCard, type LifeCardCommanderDamage, type LifeCardOut } from "./LifeCard"
import {
  COMPACT_LIFE_GLYPH_LINE_HEIGHT,
  COMPACT_LIFE_TARGET_SIZE,
  getLifeFontSizeThatFits,
  getLifeTargetTextSpace,
  LIFE_GLYPH_LINE_HEIGHT,
  LIFE_TARGET_SIZE,
  TUCKS_INTO_SCREEN_CORNERS,
  type LifeCardContentInsets,
  type LifeCardContentRotation,
  type LifeCardEdge,
  type LifeCardMenuCorner,
  type LifeCardMenuEdge,
} from "./playerCardTypes"
import {
  boardInsetsFor,
  getPlayerGridLayout,
  getPlayerGridRowFlex,
  getPlayerGridRows,
  seatFrames,
} from "./playerGridGeometry"
import { PokemonSeatCard } from "./pokemon/PokemonSeatCard"
import { panelBoxes, teamPanelCompact, teamSeatRows } from "./teamGridGeometry"
import { teamZoneMiddle } from "./TeamShade"
import type { TeamHead } from "./TeamZone"
import { usePlayerGridLayout } from "./usePlayerGridLayout"
import { outReason, type OutReason, type OutState } from "../../convex/lib/outReason"

export interface CommanderDamageGridBinding {
  incomingFor: (playerId: PlayerId, commander?: CommanderSlot) => Record<PlayerId, number>
  lethal: number
  attack: CommanderAttack
  pendingFor?: (player: GamePlayer) => LifeCardCommanderDamage["pendingClaims"]
  onPressSword: (player: GamePlayer) => void
}

function strongerCommander(
  first: Record<PlayerId, number>,
  partner: Record<PlayerId, number>,
): Record<PlayerId, number> {
  const incoming = { ...first }
  for (const [playerId, total] of Object.entries(partner) as [PlayerId, number][])
    incoming[playerId] = Math.max(incoming[playerId] ?? 0, total)
  return incoming
}

/** why: a seat hit by both partners of one attacker reads each partner's total, since lethal counts per commander. */
function partnerTotals(first: Record<PlayerId, number>, partner: Record<PlayerId, number>) {
  const split: Record<PlayerId, readonly number[]> = {}
  for (const [playerId, total] of Object.entries(partner) as [PlayerId, number][])
    if (total > 0) split[playerId] = [first[playerId] ?? 0, total]
  return split
}

export interface DiceGridBinding {
  seatFor: (player: GamePlayer) => LifeCardDice["view"]
  chipsFor: (player: GamePlayer) => readonly DiceSeatChip[]
  onPressSeat: (player: GamePlayer) => void
  onChoose: (player: GamePlayer, order: "first" | "second") => void
  onPressChip: (player: GamePlayer, chip: DiceSeatChip) => void
  bag?: {
    tools: readonly DiceTool[]
    rollFor: (player: GamePlayer, tool: DiceTool) => void
    openPlane?: (player: GamePlayer) => void
  }
}

function lifeCardOut(
  reason: OutReason,
  players: readonly GamePlayer[],
  system: PlaySystemId | undefined,
  table: TableRuntime | undefined,
): LifeCardOut {
  switch (reason.cause) {
    case "life":
      return {
        cause: "life",
        reason: translate(`board:lifeCard.outOn.${playSystemRules(system).id}`),
      }
    case "counter":
      return {
        cause: "counter",
        counterId: reason.counterId,
        amount: reason.value,
        reason: counterOutReason({
          id: reason.counterId,
          label:
            table?.tableRules.counters.find(({ id }) => id === reason.counterId)?.label ??
            reason.counterId,
        }),
      }
    case "commanderDamage": {
      const attacker = players.find(({ id }) => id === reason.fromPlayerId)
      return {
        cause: "commanderDamage",
        amount: reason.total,
        attacker: attacker && {
          color: attacker.color,
          shape: attacker.shape,
          seatNumber: players.indexOf(attacker) + 1,
        },
        reason: attacker
          ? translate("board:lifeCard.outFrom", { total: reason.total, name: attacker.name })
          : translate("board:outReason.commanderDamage"),
      }
    }
  }
}

function seatOwnership(
  player: GamePlayer,
  {
    isPlayerOwned,
    isPlayerDisabled,
    disabled,
  }: Pick<PlayerGridProps, "isPlayerOwned" | "isPlayerDisabled" | "disabled">,
) {
  if (isPlayerOwned) return isPlayerOwned(player) ? "owned" : "unowned"
  if (disabled) return "disabled"
  if (isPlayerDisabled) return isPlayerDisabled(player) ? "unowned" : "owned"
  return undefined
}

function seatDiceFor(
  dice: DiceGridBinding | undefined,
  player: GamePlayer,
  stable: ReturnType<typeof useStableCallbacks>,
): LifeCardDice | undefined {
  if (!dice) return undefined
  const { bag } = dice
  return {
    view: dice.seatFor(player),
    chips: dice.chipsFor(player),
    onPress: stable(`dice:${player.id}`, () => dice.onPressSeat(player)),
    bag: bag && {
      tools: bag.tools,
      rollFor: stable(`dice-roll:${player.id}`, (tool: DiceTool) => bag.rollFor(player, tool)),
      ...(bag.openPlane
        ? { openPlane: stable(`open-plane:${player.id}`, () => bag.openPlane?.(player)) }
        : {}),
    },
    onChoose: stable(`dice-choose:${player.id}`, (order: "first" | "second") =>
      dice.onChoose(player, order),
    ),
    onPressChip: stable(`dice-chip:${player.id}`, (chip: DiceSeatChip) =>
      dice.onPressChip(player, chip),
    ),
  }
}

/** why: a team zone shows the team's one roll-off die and turn chip, plus whatever die either teammate rolled from their strip's bag; the bags stay on the strips. Its claim and turn chip come from the teammate this device acts for, since only that seat's chips can claim the turn or roll the planar die. */
function teamDiceFor(
  dice: DiceGridBinding | undefined,
  lead: GamePlayer,
  teammate: GamePlayer,
  stable: ReturnType<typeof useStableCallbacks>,
): LifeCardDice | undefined {
  if (!dice) return undefined
  const acts = (player: GamePlayer) =>
    dice
      .chipsFor(player)
      .some((chip) => chip.kind === "claim" || (chip.kind === "turn" && !!chip.state.beside))
  const actor = !acts(lead) && acts(teammate) ? teammate : lead
  const other = actor === lead ? teammate : lead
  const viewer = dice.seatFor(actor) === undefined && dice.seatFor(other) ? other : actor
  const rolls = dice
    .chipsFor(other)
    .flatMap((chip) => (chip.kind === "roll" ? [{ ...chip, seatId: other.id }] : []))
  return {
    view: dice.seatFor(viewer),
    chips: [...dice.chipsFor(actor), ...rolls],
    onPress: stable(`dice:${viewer.id}`, () => dice.onPressSeat(viewer)),
    onChoose: stable(`dice-choose:${viewer.id}`, (order: "first" | "second") =>
      dice.onChoose(viewer, order),
    ),
    onPressChip: stable(`dice-chip:${lead.id}`, (chip: DiceSeatChip) =>
      dice.onPressChip(chip.kind === "roll" && chip.seatId === other.id ? other : actor, chip),
    ),
  }
}

export interface PlayerGridProps {
  players: GamePlayer[]
  boardOrientation?: Omit<ReturnType<typeof useGameBoardOrientation>, "frameRef" | "nativeFrame"> &
    Partial<Pick<ReturnType<typeof useGameBoardOrientation>, "nativeFrame">> & {
      insets?: LifeCardContentInsets
      touchRotation?: number
    }
  system?: PlaySystemId
  lifeStep?: number
  layoutVariant?: PlayerGridLayoutVariant
  seatOrder?: SeatOrder
  disabled?: boolean
  isPlayerDisabled?: (player: GamePlayer) => boolean
  isPlayerOwned?: (player: GamePlayer) => boolean
  getStaleSince?: (player: GamePlayer) => number | undefined
  /** why: only decks the signed-in user owns can be read, so screens return a version only for seats they control. */
  getSeatDeck?: (player: GamePlayer) => SeatDeck | undefined
  outState?: OutState
  isPlayerFoil?: (player: GamePlayer) => boolean
  commanderDamage?: CommanderDamageGridBinding
  table?: TableRuntime
  dice?: DiceGridBinding
  onOpenRule?: (ruleId: string) => void
  onPlayStart?: () => void
  onChange: (playerId: PlayerId, delta: LifeDelta) => void
  style?: StyleProp<ViewStyle>
  teams?: readonly (readonly string[])[]
}

export function PlayerGrid({
  players,
  boardOrientation,
  system,
  lifeStep,
  layoutVariant = "auto",
  seatOrder,
  disabled,
  isPlayerDisabled,
  isPlayerOwned,
  getStaleSince,
  getSeatDeck,
  outState,
  isPlayerFoil,
  commanderDamage,
  table,
  dice,
  onOpenRule,
  onPlayStart,
  onChange,
  style,
  teams,
}: PlayerGridProps) {
  const dimensions = useWindowDimensions()
  const boardRotation = boardOrientation?.rotation ?? 0
  const { width, height, fontScale } = boardOrientation ?? dimensions
  const nativeFrame = boardOrientation?.nativeFrame
  const nativeBoardStyle = useAnimatedStyle(() => {
    if (!boardOrientation) return {}
    const frame = nativeFrame?.value ?? {
      width: boardOrientation.screenWidth,
      height: boardOrientation.screenHeight,
      rotation: boardRotation,
    }
    const width = Math.min(frame.width, frame.height)
    const height = Math.max(frame.width, frame.height)
    return {
      width,
      height,
      left: (frame.width - width) / 2,
      top: (frame.height - height) / 2,
      transform: [{ rotate: `${frame.rotation}deg` }],
    }
  })
  const screenInsets = useSafeAreaInsets()
  const {
    themed,
    theme: { spacing, colors },
  } = useAppTheme()
  const screenTopEdgeBand = useTopEdgeBand()
  const topEdgeBand = boardRotation === 0 ? screenTopEdgeBand : 0
  const [board, setBoard] = useState({ width: 0, height: 0 })
  const stable = useStableCallbacks()
  const systemId = playSystemRules(system).id
  const tableItemRules = tableItemRulesOf(system)
  const cellCount = teams?.length ?? players.length
  const layout = usePlayerGridLayout({
    playerCount: cellCount,
    width,
    height,
    fontScale,
    layoutVariant,
    teamBoard: !!teams,
  })
  const cellSize = getCellSize({
    board: { width: board.width, height: board.height - topEdgeBand },
    layout,
    gap: spacing.xxs,
  })
  const compact = teams ? teamPanelCompact(layout, teams.length) : layout.compact
  const lifeTargetSize = compact ? COMPACT_LIFE_TARGET_SIZE : LIFE_TARGET_SIZE
  const sidewaysGlyphReserve =
    2 * ((compact ? COMPACT_LIFE_GLYPH_LINE_HEIGHT : LIFE_GLYPH_LINE_HEIGHT) + spacing.xs)
  const lifeFontSizeFor = useCallback(
    (digits: number) =>
      getLifeFontSize({
        cellWidth: cellSize.cellWidth,
        cellHeight: cellSize.cellHeight,
        digits,
        fontScale,
        targetSize: lifeTargetSize,
        sidewaysGlyphReserve,
      }),
    [cellSize.cellWidth, cellSize.cellHeight, fontScale, lifeTargetSize, sidewaysGlyphReserve],
  )

  function measureBoard(event: LayoutChangeEvent) {
    const { width: boardWidth, height: boardHeight } = event.nativeEvent.layout
    setBoard((current) =>
      current.width === boardWidth && current.height === boardHeight
        ? current
        : { width: boardWidth, height: boardHeight },
    )
  }

  const tabsShown = useContext(FirstPlayerTabsShownContext)
  const { insets, rows: frames } = seatFrames({
    playerCount: cellCount,
    layout,
    boardSize: { width, height },
    measuredGrid: board,
    topEdgeBand,
    gap: spacing.xxs,
    insets: boardOrientation?.insets ?? boardInsetsFor(screenInsets, boardRotation),
    tabsShown,
  })
  const rows = getPlayerGridRows(cellCount, layout)
  const rotationAt = (rowIndex: number, columnIndex: number) =>
    frames[rowIndex]?.[columnIndex]?.rotation ?? 0
  const playerIndexOf = new Map<string, number>(players.map(({ id }, index) => [id, index]))
  const teamIndexes = (teams ?? []).map(([first, second]): readonly [number, number] => [
    playerIndexOf.get(first) ?? 0,
    playerIndexOf.get(second) ?? 0,
  ])
  const rowFlexes = rows.map((row) => getPlayerGridRowFlex(row, layout))
  const seated = teams
    ? teamSeatRows(rows, rowFlexes, rotationAt, (slot) => teamIndexes[slot])
    : {
        rows: rows.map((row) =>
          row.map((slot) => (slot === null ? null : (seatOrder?.[slot] ?? slot))),
        ),
        flexes: rowFlexes,
      }
  const seatedRows = seated.rows
  const seatedRowFlexes = seated.flexes
  const panelBoxMap = teams ? panelBoxes(rows, rowFlexes) : undefined
  // why: team rows can differ in height (6 seats), so a team zone sizes its total to its own panel.
  const zoneLifeFontSizeFor = (slot: number) =>
    stable(`zone-font:${slot}`, (digits: number) => {
      const box = panelBoxMap?.get(slot)
      if (!box) return undefined
      return getLifeFontSize({
        cellWidth: (box.x1 - box.x0) * board.width,
        cellHeight: (box.y1 - box.y0) * (board.height - topEdgeBand),
        digits,
        fontScale,
        targetSize: lifeTargetSize,
        sidewaysGlyphReserve,
      })
    })
  const boardSeats = commanderDamage
    ? commanderBoardSeats(
        seatedRows,
        players.map(({ id }) => id),
      )
    : null
  const attack = commanderDamage?.attack
  const armedPlayer = players.find(({ id }) => id === attack?.armedPlayerId)
  const armedIndex = armedPlayer ? players.indexOf(armedPlayer) : -1
  const seatRotations = new Map<number, LifeCardContentRotation>()
  rows.forEach((row, rowIndex) =>
    row.forEach((slot, columnIndex) => {
      if (slot === null) return
      const seated = teams ? teamIndexes[slot] : [seatedRows[rowIndex][columnIndex]]
      for (const index of seated ?? [])
        if (index !== null) seatRotations.set(index, rotationAt(rowIndex, columnIndex))
    }),
  )
  const commanderPlayers = players.map(({ id, name, color, shape }): CommanderBoardPlayer => ({
    id,
    name,
    color,
    shape,
  }))

  /** why: with `members`, the card is a Two-Headed Giant team zone for players[index], the team's first player: it takes the team's hits and reads its commander totals, and turns into the attacker's controls when either teammate's commander attacks. */
  function seatCard(
    index: number,
    place: SeatPlace,
    zone?: {
      members: readonly [number, number]
      heads: readonly [TeamHead, TeamHead]
      shared: readonly string[]
    },
  ) {
    const player = players[index]
    const seatNumber = index + 1
    const playerDisabled = Boolean(isPlayerDisabled?.(player))
    const { contentRotation, screenEdges } = place
    const ownership = seatOwnership(player, { isPlayerOwned, isPlayerDisabled, disabled })
    const out = outState && outReason(outState, player.id)
    const team = zone?.members.map((member) => players[member])
    const teammate = team?.find(({ id }) => id !== player.id)
    const armedTeammate = team?.find(({ id }) => id === armedPlayer?.id)
    const owner = armedTeammate ?? player
    const ownerIndex = players.indexOf(owner)
    const seatDice = teammate
      ? teamDiceFor(dice, player, teammate, stable)
      : seatDiceFor(dice, player, stable)
    const fullTable = seatTableState(table, player.id)
    const seatTable =
      fullTable && teammate
        ? {
            ...fullTable,
            rules: {
              ...fullTable.rules,
              counters: fullTable.rules.counters.filter(({ shared }) => shared),
              designations: [],
              customCounters: undefined,
            },
            held: [],
          }
        : fullTable
    const firstIncoming = commanderDamage?.incomingFor(owner.id) ?? NO_INCOMING
    const partnerIncoming = commanderDamage?.incomingFor(owner.id, PARTNER_COMMANDER) ?? NO_INCOMING
    const strike = attack && armedPlayer ? attack.against(owner.id) : undefined
    const teamIds = team?.map(({ id }) => id)
    const commanderSeats = boardSeats?.seats.filter(
      ({ playerId }) => !teamIds?.includes(playerId) || playerId === armedTeammate?.id,
    )
    const sword = teamIds
      ? armedTeammate && commanderDamage
        ? stable(`sword:${armedTeammate.id}`, () => commanderDamage.onPressSword(armedTeammate))
        : undefined
      : commanderDamage && stable(`sword:${player.id}`, () => commanderDamage.onPressSword(player))
    const staleSince =
      teammate && getStaleSince?.(teammate) === undefined ? undefined : getStaleSince?.(player)
    if (table?.tableRules.pokemon) {
      return (
        <PokemonSeatCard
          playerId={player.id}
          playerName={player.name}
          seatNumber={seatNumber}
          shape={player.shape}
          foil={isPlayerFoil?.(player)}
          prizes={player.life}
          color={player.color}
          compact={compact}
          contentRotation={contentRotation}
          contentInsets={place.contentInsets}
          screenEdges={TUCKS_INTO_SCREEN_CORNERS ? screenEdges : undefined}
          menuCorner={place.menuCorner}
          menuEdgeCenter={place.menuEdgeCenter}
          disabled={disabled || playerDisabled}
          ownership={ownership}
          staleSince={getStaleSince?.(player)}
          deck={getSeatDeck?.(player)}
          opponents={players
            .filter(({ id }) => id !== player.id)
            .map(({ id, name }) => ({ id, name }))}
          table={table}
          dice={seatDice}
          onChangePrizes={stable(`change:${player.id}`, (delta: LifeDelta) =>
            onChange(player.id, delta),
          )}
          onPlayStart={onPlayStart && stable("playStart", onPlayStart)}
          style={place.style}
        />
      )
    }
    return (
      <LifeCard
        playerId={player.id}
        playerName={
          teammate
            ? translate("board:teams.name", { first: player.name, second: teammate.name })
            : player.name
        }
        seatNumber={seatNumber}
        shape={owner.shape}
        foil={!teammate && isPlayerFoil?.(player)}
        life={player.life}
        color={
          team
            ? teamZoneMiddle([team[0].color, team[1].color], colors.board.background)
            : player.color
        }
        team={zone && { heads: zone.heads, shared: zone.shared }}
        compact={compact}
        contentRotation={contentRotation}
        boardRotation={boardOrientation?.touchRotation ?? boardRotation}
        contentInsets={place.contentInsets}
        screenEdges={TUCKS_INTO_SCREEN_CORNERS ? screenEdges : undefined}
        menuCorner={place.menuCorner}
        menuEdgeCenter={place.menuEdgeCenter}
        lifeFontSizeFor={place.lifeFontSizeFor ?? lifeFontSizeFor}
        system={system}
        lifeStep={lifeStep}
        disabled={disabled || playerDisabled}
        ownership={ownership}
        staleSince={staleSince}
        out={out && lifeCardOut(out, players, system, table)}
        commanderDamage={
          commanderDamage && attack && commanderSeats
            ? {
                ownerPlayerId: owner.id,
                players: commanderPlayers,
                seats: commanderSeats,
                incoming: strongerCommander(firstIncoming, partnerIncoming),
                split: partnerTotals(firstIncoming, partnerIncoming),
                lethal: commanderDamage.lethal,
                armedPlayerId: attack.armedPlayerId,
                attackerName: armedPlayer?.name,
                attacker: armedPlayer && {
                  color: armedPlayer.color,
                  shape: armedPlayer.shape,
                  seatNumber: armedIndex + 1,
                  rotation: seatRotations.get(armedIndex),
                },
                commanders: strike?.commanders,
                dealt: strike?.dealt,
                takeBack: strike?.takeBack,
                applied: strike?.applied,
                onPower: stable(`power:${owner.id}`, (power: number, slot: number) =>
                  attack.dispatch({ type: "power", slot, power }),
                ),
                onSit: stable(`sit:${owner.id}`, (slot: number) =>
                  attack.dispatch({ type: "sit", slot }),
                ),
                facing:
                  armedIndex >= 0 ? commanderFacing(seatedRows, armedIndex, ownerIndex) : undefined,
                reach:
                  armedIndex >= 0 && armedIndex !== ownerIndex
                    ? commanderReach({
                        gridRows: seatedRows,
                        rowFlexes: seatedRowFlexes,
                        board: {
                          width: board.width,
                          height: board.height - topEdgeBand,
                        },
                        attackerIndex: armedIndex,
                        defenderIndex: ownerIndex,
                      })
                    : undefined,
                pendingClaims: team
                  ? team.flatMap((member) => commanderDamage.pendingFor?.(member) ?? [])
                  : commanderDamage.pendingFor?.(player),
                onPressSword: sword,
                acted: attack.acted,
                onHit: stable(`hit:${owner.id}`, () =>
                  attack.dispatch({ type: "hit", to: owner.id }),
                ),
                onUndo: stable(`undo:${owner.id}`, () =>
                  attack.dispatch({ type: "undo", to: owner.id }),
                ),
                ...(attack.stagedTargets !== undefined && attack.armedPlayerId === owner.id
                  ? {
                      armBar: {
                        stagedTargets: attack.stagedTargets,
                        onSend: stable("armSend", () => attack.dispatch({ type: "send" })),
                      },
                    }
                  : {}),
              }
            : undefined
        }
        seatTable={
          table && seatTable
            ? {
                ...seatTable,
                editable: !(disabled || playerDisabled),
                adjustCounter: stable(`counter:${player.id}`, (counterId: string, delta: number) =>
                  table.adjustCounter(player.id, counterId, delta),
                ),
                takeDesignation: stable(`take:${player.id}`, (designationId: string) =>
                  table.takeDesignation(player.id, designationId),
                ),
                releaseDesignation: stable(`release:${player.id}`, (designationId: string) =>
                  table.releaseDesignation(player.id, designationId),
                ),
                ...(tableItemRules && onOpenRule
                  ? { tableItemRules, openRule: stable("openRule", onOpenRule) }
                  : {}),
              }
            : undefined
        }
        dice={seatDice}
        onPlayStart={onPlayStart && stable("playStart", onPlayStart)}
        onChange={stable(`change:${player.id}`, (delta: LifeDelta) => onChange(player.id, delta))}
        style={place.style}
      />
    )
  }

  function renderTeamPanel(slot: number, rowIndex: number, columnIndex: number) {
    const team = teamIndexes[slot]
    const frame = frames[rowIndex]?.[columnIndex]
    if (!team || !frame) return null
    const { rotation, contentInsets, screenEdges, menuCorner, menuEdgeCenter } = frame
    const [lead, second] = team
    const head = (index: number): TeamHead => {
      const player = players[index]
      const playerDisabled = disabled || Boolean(isPlayerDisabled?.(player))
      const seatTable = seatTableState(table, player.id)
      const ownership = seatOwnership(player, { isPlayerOwned, isPlayerDisabled, disabled })
      const bag = ownership === "unowned" || playerDisabled ? undefined : dice?.bag
      return {
        seatNumber: index + 1,
        name: player.name,
        color: player.color,
        shape: player.shape,
        foil: isPlayerFoil?.(player),
        staleSince: getStaleSince?.(player),
        ownership,
        seat:
          table && seatTable
            ? {
                ...seatTable,
                editable: !playerDisabled,
                adjustCounter: stable(`counter:${player.id}`, (counterId: string, delta: number) =>
                  table.adjustCounter(player.id, counterId, delta),
                ),
                takeDesignation: stable(`take:${player.id}`, (designationId: string) =>
                  table.takeDesignation(player.id, designationId),
                ),
                releaseDesignation: stable(`release:${player.id}`, (designationId: string) =>
                  table.releaseDesignation(player.id, designationId),
                ),
                ...(tableItemRules && onOpenRule
                  ? { tableItemRules, openRule: stable("openRule", onOpenRule) }
                  : {}),
              }
            : undefined,
        bag: bag && {
          tools: bag.tools,
          rollFor: stable(`dice-roll:${player.id}`, (tool: DiceTool) => bag.rollFor(player, tool)),
          ...(bag.openPlane
            ? { openPlane: stable(`open-plane:${player.id}`, () => bag.openPlane?.(player)) }
            : {}),
        },
        sword: commanderDamage && {
          onPress: stable(`sword:${player.id}`, () => commanderDamage.onPressSword(player)),
          disabled:
            playerDisabled ||
            (!!armedPlayer && !team.includes(armedIndex)) ||
            (!!outState && outReason(outState, player.id) !== undefined),
        },
      }
    }
    return (
      <View key={`team-${slot}`} testID={`player-cell-seat-${lead + 1}`} style={themed($cell)}>
        {seatCard(
          lead,
          {
            contentRotation: rotation,
            screenEdges,
            contentInsets,
            menuCorner,
            menuEdgeCenter,
            lifeFontSizeFor: zoneLifeFontSizeFor(slot),
            style: getScreenCornerSquaringStyle({
              rows,
              rowIndex,
              columnIndex,
              insets: Platform.OS === "web" ? insets : undefined,
            }),
          },
          {
            members: team,
            heads: [head(lead), head(second)],
            shared: (table?.tableRules.counters ?? []).flatMap(({ id, shared }) =>
              shared ? [id] : [],
            ),
          },
        )}
      </View>
    )
  }

  return (
    <View testID="player-grid-frame" style={$frame}>
      <Animated.View
        testID="player-grid"
        accessibilityLabel={translate(`board:grid.label.${systemId}`, { count: players.length })}
        onLayout={measureBoard}
        style={[
          themed($grid),
          topEdgeBand ? { paddingTop: topEdgeBand } : null,
          style,
          boardOrientation && $fixedGrid,
          boardOrientation && {
            width,
            height,
            transform: [
              { translateX: -width / 2 },
              { translateY: -height / 2 },
              { rotate: `${boardRotation}deg` },
            ],
          },
          nativeBoardStyle,
          (cellSize.cellWidth <= 0 || cellSize.cellHeight <= 0) && $unmeasured,
        ]}
      >
        {rows.map((row, rowIndex) => (
          <View
            key={rowIndex}
            testID={`player-grid-row-${rowIndex}`}
            style={[themed($row), { flex: rowFlexes[rowIndex] }]}
          >
            {row.map((slot, columnIndex) => {
              if (slot !== null && teams) return renderTeamPanel(slot, rowIndex, columnIndex)
              const index = seatedRows[rowIndex]?.[columnIndex]
              const frame = frames[rowIndex]?.[columnIndex]
              if (!frame || index === null || index === undefined) {
                return (
                  <View
                    key={`empty-${rowIndex}-${columnIndex}`}
                    testID={`player-grid-empty-${rowIndex}-${columnIndex}`}
                    style={themed($cell)}
                  />
                )
              }
              const player = players[index]
              const seatNumber = index + 1
              const {
                rotation: contentRotation,
                screenEdges,
                contentInsets,
                menuCorner,
                menuEdgeCenter,
              } = frame
              const corners = getScreenCornerSquaringStyle({
                rows,
                rowIndex,
                columnIndex,
                insets: Platform.OS === "web" ? insets : undefined,
              })
              return (
                // why: keyed by seat, not player id, so a rematch reuses cards; remounting every seat kept old native animation memory.
                <View
                  key={table?.tableRules.pokemon ? player.id : `seat-${index}`}
                  testID={`player-cell-seat-${seatNumber}`}
                  style={themed($cell)}
                >
                  {seatCard(index, {
                    contentRotation,
                    screenEdges,
                    contentInsets,
                    menuCorner,
                    menuEdgeCenter,
                    style: corners,
                  })}
                </View>
              )
            })}
          </View>
        ))}
      </Animated.View>
    </View>
  )
}

interface SeatPlace {
  contentRotation: LifeCardContentRotation
  screenEdges: Record<LifeCardEdge, boolean>
  contentInsets: LifeCardContentInsets
  menuCorner?: LifeCardMenuCorner
  menuEdgeCenter?: LifeCardMenuEdge
  lifeFontSizeFor?: (digits: number) => number | undefined
  style?: ViewStyle
}

export { getPlayerGridLayoutOptions } from "@/features/game/playerLayouts"
export type { PlayerGridLayoutVariant } from "@/features/game/playerLayouts"
export {
  getCornerCutout,
  getPlayerContentRotation,
  getPlayerGridFacings,
  getPlayerGridLayout,
  getPlayerGridMenuAnchor,
  getPlayerGridRowFlex,
  getPlayerGridRows,
} from "./playerGridGeometry"

const NO_INCOMING: Record<PlayerId, number> = {}

const LIFE_CONTROL_GUTTER = 32
const LIFE_HEIGHT_RATIO = 0.5

export function getCellSize(input: {
  board: { width: number; height: number }
  layout: ReturnType<typeof getPlayerGridLayout>
  gap: number
}) {
  const { board, layout, gap } = input
  const rowGaps = gap * (layout.rowCount - 1)
  const columnGaps = gap * (layout.columnCount - 1)
  return {
    cellWidth: (board.width - columnGaps) / layout.columnCount,
    cellHeight: (board.height - rowGaps) / layout.rowCount,
  }
}

export function getLifeFontSize(input: {
  cellWidth: number
  cellHeight: number
  digits: number
  fontScale: number
  targetSize: number
  sidewaysGlyphReserve: number
}): number | undefined {
  if (!(input.cellWidth > 0) || !(input.cellHeight > 0)) return undefined
  const targetSpace = getLifeTargetTextSpace(input.targetSize)
  const fit = (availableWidth: number, availableHeight: number) =>
    getLifeFontSizeThatFits({
      availableWidth,
      availableHeight,
      digits: input.digits,
      fontScale: input.fontScale,
    })
  return Math.min(
    fit(
      Math.max(Math.min(input.cellWidth - LIFE_CONTROL_GUTTER * 2, targetSpace), 1),
      Math.max(Math.min(input.cellHeight * LIFE_HEIGHT_RATIO, targetSpace), 1),
    ),
    fit(
      Math.max(Math.min(input.cellHeight - input.sidewaysGlyphReserve, targetSpace), 1),
      Math.max(Math.min(input.cellWidth - LIFE_CONTROL_GUTTER * 2, targetSpace), 1),
    ),
  )
}

/** why: on web, pass insets: the page reaches a rounded screen corner only where the browser reports an inset. */
export function getScreenCornerSquaringStyle(input: {
  rows: (number | null)[][]
  rowIndex: number
  columnIndex: number
  insets?: LifeCardContentInsets
}): ViewStyle | undefined {
  const reachesCorner = (edge: LifeCardEdge, side: LifeCardEdge) =>
    !input.insets || input.insets[edge] > 0 || input.insets[side] > 0
  const touchesTopEdge = input.rowIndex === 0
  const touchesBottomEdge = input.rowIndex === input.rows.length - 1
  const touchesLeftEdge = input.columnIndex === 0
  const touchesRightEdge = input.columnIndex === input.rows[input.rowIndex].length - 1
  const squared: ViewStyle = {
    ...(touchesTopEdge && touchesLeftEdge && reachesCorner("top", "left")
      ? { borderTopLeftRadius: radius.none }
      : null),
    ...(touchesTopEdge && touchesRightEdge && reachesCorner("top", "right")
      ? { borderTopRightRadius: radius.none }
      : null),
    ...(touchesBottomEdge && touchesLeftEdge && reachesCorner("bottom", "left")
      ? { borderBottomLeftRadius: radius.none }
      : null),
    ...(touchesBottomEdge && touchesRightEdge && reachesCorner("bottom", "right")
      ? { borderBottomRightRadius: radius.none }
      : null),
  }
  return Object.keys(squared).length ? squared : undefined
}

const $grid: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  width: "100%",
  gap: spacing.xxs,
  paddingHorizontal: 0,
  paddingBottom: 0,
})

const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  flexDirection: "row",
  gap: spacing.xxs,
})

const $cell: ThemedStyle<ViewStyle> = () => ({ flex: 1 })

const $fixedGrid: ViewStyle = { position: "absolute", left: "50%", top: "50%" }

const $frame: ViewStyle = { flex: 1, width: "100%" }

const $unmeasured: ViewStyle = { opacity: 0 }
