import { randomUUID as secureRandomUUID } from "expo-crypto"

import { translate } from "@/i18n/translate"

import { COMMANDER_SLOTS, commanderDamageKey, writeLocalGame } from "./localEngine"
import {
  isSeatOrder,
  playerGridLayoutForCount,
  type PlayerGridLayoutVariant,
  type SeatOrder,
} from "./playerLayouts"
import {
  isPlaySystemId,
  playCommanderLethal,
  playSystemFormat,
  playSystemRules,
  playTableRules,
  startingValueRangeMessage,
  type PlaySystemId,
} from "./playSystems"
import { isRoundClockSetup, startRoundClock, type RoundClockSetup } from "./roundClock"
import { turnsPassed } from "./turnTab"
import type {
  ActorId,
  CommanderDamageAssignedEvent,
  CommanderSlot,
  CommandContext,
  DeviceId,
  GameCommand,
  GameEvent,
  GameId,
  GamePlayer,
  LifeChangedEvent,
  LifeDelta,
  LocalGame,
  LocalGameAccount,
  LocalGameMatch,
  LocalGameResult,
  LocalMatchResult,
  NewPlayerInput,
  OperationId,
  PlayerId,
  TurnLogEntry,
} from "./types"
import {
  PLAYER_COLOR_CHOICES,
  PLAYER_MARK_SHAPES,
  shapeForSeat,
} from "../../../convex/lib/appearance"
import {
  isCommanderDamageDelta,
  isCommanderSlot,
  isLifeDelta,
  MAX_COMMANDER_DAMAGE,
  MAX_LIFE_DELTA,
  PARTNER_COMMANDER,
} from "../../../convex/lib/gameRules"
import { MAX_GAMES_PER_MATCH, winsNeeded, type MatchBestOf } from "../../../convex/lib/matchResults"
import {
  commanderOutState,
  outReason,
  standingWinners,
  type OutState,
} from "../../../convex/lib/outReason"
import { MAX_PLAYERS, MIN_PLAYERS } from "../../../convex/lib/policy"
import {
  attachesDecks,
  flooredLifeDelta,
  startingValueRange,
  variantCounter,
} from "../../../convex/lib/systems"
import {
  applyTableAction,
  customCounterId,
  EMPTY_TABLE,
  findCustomCounter,
  playerTableOf,
  tableHasState,
  type TableAction,
  type TableState,
} from "../../../convex/lib/table"
import {
  applyModeAction,
  ARCHENEMY_LIFE,
  isModeAction,
  isValidModeSetup,
  modeGameFields,
  startModes,
  systemPlaysModeSetup,
  type ModeAction,
  type ModeSetup,
} from "../../../convex/lib/tableModes"
import {
  isTeamPlayerCount,
  isTeamVariant,
  teamSeatsMessage,
  type TeamVariant,
} from "../../../convex/lib/teamVariants"
import {
  applyTurnAction,
  isTurnAction,
  startedByChange,
  turnGroupOf,
  turnLead,
  type Turn,
} from "../../../convex/lib/turns"
import { isValidTeams, teamTableRules, TWO_HEADED_GIANT } from "../../../convex/lib/twoHeadedGiant"

export {
  isCommanderDamageDelta,
  isCommanderSlot,
  isLifeDelta,
  MAX_COMMANDER_DAMAGE,
  MAX_LIFE_DELTA,
  PARTNER_COMMANDER,
}

export const PLAYER_COLORS = PLAYER_COLOR_CHOICES
export { MAX_PLAYERS, MIN_PLAYERS }
export const MAX_PLAYER_NAME_LENGTH = 24

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

// why: nearby hosts upload every seat's name, and Convex refuses a blank name or broken UTF-16 for the whole game.
export const wellFormedPlayerName = (raw: string) =>
  raw
    .replace(LONE_SURROGATE, "")
    .trim()
    .slice(0, MAX_PLAYER_NAME_LENGTH)
    .replace(LONE_SURROGATE, "")
    .trim()

export function validatePlayerNames(values: readonly string[]): {
  valid: boolean
  names: string[]
  errors: Array<string | undefined>
} {
  const names = values.map((value) => value.trim())
  const duplicateKeys = new Set<string>()
  const counts = new Map<string, number>()
  for (const name of names) {
    if (!name) continue
    const key = name.toLocaleLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  for (const [key, count] of counts) if (count > 1) duplicateKeys.add(key)
  const errors = names.map((name) => {
    if (!name) return translate("board:playerNames.required")
    if (name.length > MAX_PLAYER_NAME_LENGTH)
      return translate("board:playerNames.tooLong", { max: MAX_PLAYER_NAME_LENGTH })
    if (duplicateKeys.has(name.toLocaleLowerCase())) return translate("board:playerNames.unique")
    return undefined
  })
  return { valid: errors.every((error) => error === undefined), names, errors }
}

export function createClientId(
  prefix: string,
  _now = Date.now(),
  randomUUID: () => string = secureRandomUUID,
): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`
}

export const asGameId = (value: string) => value as GameId
export const asPlayerId = (value: string) => value as PlayerId
export const asOperationId = (value: string) => value as OperationId
export const asActorId = (value: string) => value as ActorId
export const asDeviceId = (value: string) => value as DeviceId

export function validatePlayerCount(count: number): boolean {
  return Number.isInteger(count) && count >= MIN_PLAYERS && count <= MAX_PLAYERS
}

export function validateStartingLife(life: number, system?: PlaySystemId): boolean {
  const { min, max } = startingValueRange(system)
  return Number.isInteger(life) && life >= min && life <= max
}

export function createLocalGame(input: {
  players: NewPlayerInput[]
  startingLife: number
  system?: PlaySystemId
  format?: string
  layout?: PlayerGridLayoutVariant
  seatOrder?: SeatOrder
  lifeStep?: number
  now?: number
  gameId?: GameId
  account?: Omit<LocalGameAccount, "mePlayerId"> & { meSeat?: number }
  match?: { bestOf: MatchBestOf }
  clock?: RoundClockSetup
  modeSetup?: ModeSetup
  teams?: readonly (readonly number[])[]
  /** why: setups saved before 2v2 carry teams and no variant, and they are Two-Headed Giant. */
  teamVariant?: TeamVariant
}): LocalGame {
  const system = isPlaySystemId(input.system) ? input.system : undefined
  const format = system ? playSystemFormat(system, input.format) : undefined
  const counter = playSystemRules(system).counter
  const lifeStep = input.lifeStep ?? counter.tapStep
  if (!validatePlayerCount(input.players.length)) {
    throw new Error(`A local game requires ${MIN_PLAYERS}–${MAX_PLAYERS} players.`)
  }
  if (
    [input.startingLife, ...input.players.map((player) => player.startingLife)].some(
      (life) => life !== undefined && !validateStartingLife(life, system),
    )
  ) {
    throw new Error(startingValueRangeMessage(system))
  }
  if (!isLifeDelta(lifeStep) || lifeStep < 1)
    throw new Error("Life step must be a positive whole number.")
  const validatedNames = validatePlayerNames(input.players.map(({ name }) => name))
  if (!validatedNames.valid) {
    throw new Error(validatedNames.errors.find(Boolean) ?? "Enter valid player names.")
  }

  const teamVariant = input.teamVariant ?? TWO_HEADED_GIANT
  if (input.teams && !isTeamPlayerCount(teamVariant, input.players.length))
    throw new Error(teamSeatsMessage(teamVariant))
  const now = input.now ?? Date.now()
  const id = input.gameId ?? asGameId(createClientId("game", now))
  const colorOf = (seat: number) => input.players[seat]?.color || PLAYER_COLORS[seat]
  const created: GamePlayer[] = input.players.map((player, seat) => ({
    id: asPlayerId(createClientId("player", now + seat)),
    name: validatedNames.names[seat],
    color: colorOf(input.teams?.find((team) => team.includes(seat))?.[0] ?? seat),
    shape: player.shape ?? shapeForSeat(seat + 1, PLAYER_MARK_SHAPES),
    life: player.startingLife ?? input.startingLife,
    seat,
    ...(player.startingLife !== undefined && player.startingLife !== input.startingLife
      ? { startingLife: player.startingLife }
      : {}),
  }))
  const modeSetup =
    input.modeSetup &&
    systemPlaysModeSetup(system, input.modeSetup) &&
    isValidModeSetup(input.modeSetup, created.length)
      ? input.modeSetup
      : undefined
  const started = startModes(
    modeSetup,
    created.map(({ id: playerId }) => playerId),
  )
  const players = created.map((player) =>
    player.id === started.archenemyId
      ? { ...player, life: ARCHENEMY_LIFE, startingLife: ARCHENEMY_LIFE }
      : player,
  )
  const { modes, ...turnFields } = modeGameFields(started, now, createClientId("operation", now))

  return {
    schemaVersion: 1,
    id,
    status: "active",
    ...(system ? { system, format } : {}),
    layout: playerGridLayoutForCount(
      input.teams ? input.teams.length : input.players.length,
      input.layout,
    ),
    ...(isSeatOrder(input.seatOrder, players.length) ? { seatOrder: input.seatOrder } : {}),
    lifeStep,
    startingLife: input.startingLife,
    players,
    events: [],
    createdAt: now,
    updatedAt: now,
    ...(input.account
      ? { account: accountForSystem(system, localGameAccount(players, input.account)) }
      : {}),
    ...(input.match ? { match: newMatch(input.match.bestOf, players.length, now) } : {}),
    ...(isRoundClockSetup(input.clock) ? { clock: startRoundClock(input.clock, now) } : {}),
    ...(modeSetup ? { modeSetup } : {}),
    ...(modes ? { table: { ...EMPTY_TABLE, modes } } : {}),
    ...turnFields,
    ...(started.archenemyId
      ? { firstPlayerId: asPlayerId(started.archenemyId), firstPlayerOffered: true as const }
      : {}),
    ...teamsFor(players, teamVariant, input.teams),
  }
}

function teamsFor(
  players: readonly GamePlayer[],
  variant: TeamVariant,
  seats?: readonly (readonly number[])[],
) {
  if (!seats) return {}
  const turnGroups = seats.map((team) => team.flatMap((seat) => players[seat]?.id ?? []))
  if (!isValidTeams(turnGroups, new Set(players.map(({ id }) => id))))
    throw new Error(teamSeatsMessage(variant))
  return { variant, turnGroups }
}

export const localTeams = (game: Pick<LocalGame, "variant" | "turnGroups">) =>
  isTeamVariant(game.variant) ? game.turnGroups : undefined

const sharesLife = (game: LocalGame, playerId: PlayerId, other: PlayerId) =>
  turnGroupOf(localTeams(game), playerId).includes(other)

function newMatch(bestOf: MatchBestOf, seatCount: number, now: number): LocalGameMatch {
  return {
    id: createClientId("match", now),
    bestOf,
    gameNumber: 1,
    wins: Array.from({ length: seatCount }, () => 0),
    draws: 0,
  }
}

export function matchScoreAfter(game: Pick<LocalGame, "players" | "match" | "result">) {
  const match = game.match
  if (!match) throw new Error("This game is not part of a match.")
  const result = game.result
  return {
    wins: game.players.map(
      (player, seat) =>
        (match.wins[seat] ?? 0) +
        (result?.kind === "win" && result.winnerPlayerIds.includes(player.id) ? 1 : 0),
    ),
    draws: match.draws + (result?.kind === "draw" ? 1 : 0),
  }
}

export function completedMatchResult(
  game: Pick<LocalGame, "players" | "match" | "result">,
): LocalMatchResult | undefined {
  if (!game.match) return undefined
  const { wins } = matchScoreAfter(game)
  const winner = wins.findIndex((count) => count >= winsNeeded(game.match!.bestOf))
  if (winner === -1) return undefined
  return { outcomes: wins.map((_, seat) => (seat === winner ? "win" : "loss")) }
}

export function drawsLabel(draws: number) {
  return translate("board:match.draws", { count: draws })
}

export function matchScoreLabel(score: { wins: number[]; draws: number }) {
  return score.draws === 0
    ? score.wins.join("-")
    : `${score.wins.join("-")} · ${drawsLabel(score.draws)}`
}

export function matchContextLabel(game: Pick<LocalGame, "match">) {
  const match = game.match
  if (!match) return undefined
  return translate("board:match.context", {
    number: match.gameNumber,
    score: matchScoreLabel(match),
  })
}

export function canContinueMatch(game: Pick<LocalGame, "status" | "match">) {
  return (
    game.status === "finished" &&
    game.match !== undefined &&
    game.match.result === undefined &&
    game.match.gameNumber < MAX_GAMES_PER_MATCH
  )
}

export function createNextMatchGame(game: LocalGame, now?: number): LocalGame {
  if (!game.match || !canContinueMatch(game))
    throw new Error("This match cannot continue to another game.")
  const next = createRematch(game, now)
  return {
    ...next,
    match: {
      ...game.match,
      gameNumber: game.match.gameNumber + 1,
      ...matchScoreAfter(game),
    },
    ...(game.clock ? { clock: game.clock } : {}),
  }
}

export function isMatchInProgress(game: LocalGame) {
  return game.match !== undefined && (game.match.gameNumber > 1 || hasLocalGameStarted(game))
}

export function leaveMatch(game: LocalGame): LocalGame {
  if (isMatchInProgress(game)) throw new Error("A match in progress ends with End match.")
  const { match: _match, ...board } = game
  return board
}

export function restartMatchGame(game: LocalGame, now?: number): LocalGame {
  if (!game.match) throw new Error("This game is not part of a match.")
  return withFirstChooser(
    {
      ...createRematchBoard(game, now),
      match: game.match,
      ...(game.clock ? { clock: game.clock } : {}),
    },
    game.firstChooserSeat,
  )
}

export function localGameAccount(
  players: readonly GamePlayer[],
  account: Omit<LocalGameAccount, "mePlayerId"> & { meSeat?: number },
): LocalGameAccount {
  const me = account.meSeat === undefined ? undefined : players[account.meSeat]
  return {
    ownerId: account.ownerId,
    ...(me ? { mePlayerId: me.id } : {}),
    ...(me && account.deckVersionId ? { deckVersionId: account.deckVersionId } : {}),
    ...(me && account.deckKey ? { deckKey: account.deckKey } : {}),
    ...(me && account.deckFingerprint ? { deckFingerprint: account.deckFingerprint } : {}),
    ...(me && account.deckName ? { deckName: account.deckName } : {}),
  }
}

export function accountForSystem(system: unknown, account: LocalGameAccount): LocalGameAccount {
  if (attachesDecks(system)) return account
  const { ownerId, mePlayerId } = account
  return { ownerId, ...(mePlayerId ? { mePlayerId } : {}) }
}

export function meSeatOf(game: Pick<LocalGame, "players" | "account">): number | undefined {
  const index = game.players.findIndex((player) => player.id === game.account?.mePlayerId)
  return index === -1 ? undefined : index
}

export function soleLoserSeat(game: Pick<LocalGame, "players" | "result">): number | undefined {
  if (game.result?.kind !== "win") return undefined
  const losers = game.players.flatMap((player, seat) =>
    game.result?.kind === "win" && game.result.winnerPlayerIds.includes(player.id) ? [] : [seat],
  )
  return losers.length === 1 ? losers[0] : undefined
}

export function createRematch(game: LocalGame, now?: number): LocalGame {
  return withFirstChooser(createRematchBoard(game, now), soleLoserSeat(game))
}

export function withFirstChooser(game: LocalGame, seat: number | undefined): LocalGame {
  return seat === undefined ? game : { ...game, firstChooserSeat: seat }
}

function createRematchBoard(game: LocalGame, now?: number): LocalGame {
  return createLocalGame({
    players: game.players.map(({ name, color, shape, startingLife }) => ({
      name,
      color,
      shape,
      startingLife,
    })),
    startingLife: game.startingLife,
    system: game.system,
    format: game.format,
    layout: game.layout,
    seatOrder: game.seatOrder,
    lifeStep: game.lifeStep,
    now,
    ...(game.account ? { account: { ...game.account, meSeat: meSeatOf(game) } } : {}),
    ...(game.match ? { match: { bestOf: game.match.bestOf } } : {}),
    ...(game.clock ? { clock: game.clock.setup } : {}),
    ...(game.modeSetup ? { modeSetup: rematchModeSetup(game, game.modeSetup) } : {}),
    ...(localTeams(game) && isTeamVariant(game.variant)
      ? { teams: teamSeats(game), teamVariant: game.variant }
      : {}),
  })
}

function rematchModeSetup(game: LocalGame, setup: ModeSetup): ModeSetup {
  const archenemyId = game.table?.modes?.archenemy?.playerId
  const seat = game.players.findIndex(({ id }) => id === archenemyId)
  return setup.archenemy && seat >= 0
    ? { ...setup, archenemy: { ...setup.archenemy, seat: seat + 1 } }
    : setup
}

export const teamSeats = (game: Pick<LocalGame, "players" | "variant" | "turnGroups">) =>
  (localTeams(game) ?? []).map((team) =>
    team.map((playerId) => game.players.findIndex(({ id }) => id === playerId)),
  )

export { COMMANDER_SLOTS, commanderDamageKey }

// why: the old local rules stay for a week as the fallback an update can switch back to. Remove with the legacy branches after 2026-11-20.
export const localRules = { engine: true }

export const clampedCommanderDelta = (total: number, delta: number) =>
  Math.max(0, Math.min(MAX_COMMANDER_DAMAGE, total + delta)) - total

/** why: the partner's key keeps its marker before the `>`, so builds that split a key on `>` find no seat named `id#1` and skip it instead of misreading it. */
export function commanderDamageBetween(
  game: LocalGame,
  fromPlayerId: PlayerId,
  toPlayerId: PlayerId,
  commander?: CommanderSlot,
): number {
  return game.commanderDamage?.[commanderDamageKey(fromPlayerId, toPlayerId, commander)] ?? 0
}

export function incomingCommanderDamage(
  game: LocalGame,
  toPlayerId: PlayerId,
  commander?: CommanderSlot,
): Record<PlayerId, number> {
  const incoming = {} as Record<PlayerId, number>
  for (const player of game.players) {
    if (player.id === toPlayerId) continue
    incoming[player.id] = commanderDamageBetween(game, player.id, toPlayerId, commander)
  }
  return incoming
}

export function localOutState(game: LocalGame): OutState<PlayerId> {
  return {
    ...(localTeams(game) ? { sharedFate: true as const } : {}),
    counter: variantCounter(playSystemRules(game.system).counter, game.system, game.variant),
    tableRules: localTableRules(game),
    table: game.table,
    lives: game.players.map(({ id, life }) => ({ playerId: id, life })),
    commanderDamage: commanderOutState(
      playCommanderLethal(game.system, game.format),
      game.players.flatMap((from) =>
        game.players.flatMap((to) =>
          COMMANDER_SLOTS.map((commander) => ({
            fromPlayerId: from.id,
            toPlayerId: to.id,
            ...(commander ? { commander } : {}),
            total: commanderDamageBetween(game, from.id, to.id, commander),
          })),
        ),
      ),
    ),
    ...(game.turnGroups ? { groups: game.turnGroups } : {}),
  }
}

export function localOutReason(game: LocalGame, playerId: PlayerId) {
  return outReason(localOutState(game), playerId)
}

export function localTableRules(game: Pick<LocalGame, "system" | "format" | "variant">) {
  const rules = playTableRules(game.system, game.format)
  return isTeamVariant(game.variant) ? teamTableRules(rules) : rules
}

const MAX_TURN_LOG = 400

export function withTurn(game: LocalGame, turn: Turn | undefined, now: number): LocalGame {
  if (turn === game.turn) return game
  const { turn: _turn, turnLog: log = [], ...rest } = game
  const turnLog: TurnLogEntry[] = !turn
    ? []
    : turn.operationId === game.turn?.operationId
      ? log.map((entry) =>
          entry.operationId === turn.operationId ? { ...entry, at: turn.startedAt } : entry,
        )
      : log.some(({ operationId }) => operationId === turn.operationId)
        ? log.filter(({ operationId }) => operationId !== game.turn?.operationId)
        : [
            ...log,
            {
              operationId: turn.operationId,
              playerId: turn.playerId as PlayerId,
              number: turn.number,
              at: turn.startedAt,
            },
          ]
  return {
    ...rest,
    ...(turn ? { turn } : {}),
    ...(turnLog.length > 0 ? { turnLog: turnLog.slice(-MAX_TURN_LOG) } : {}),
    updatedAt: Math.max(game.updatedAt, now),
  }
}

export function withFirstTurn(
  game: LocalGame,
  playerId: PlayerId | undefined,
  context: { operationId: string; now: number },
): LocalGame {
  const turn = game.turn
  if (turn && (turn.number > 1 || turn.previous)) return game
  if (!playerId) return withTurn(game, undefined, context.now)
  const lead = turnLead(game.turnGroups, playerId)
  if (turn?.playerId === lead) return game
  const { turnLog: _log, turn: _turn, ...board } = game
  return withTurn(
    board,
    {
      playerId: lead,
      number: 1,
      startedAt: context.now,
      operationId: context.operationId,
      waiting: true,
    },
    context.now,
  )
}

export function applyLocalTableAction(
  game: LocalGame,
  action: TableAction,
  context: { operationId: string; now: number },
): LocalGame {
  if (game.status !== "active") return game
  if (localRules.engine) return engineTableAction(game, action, context)
  if (isTurnAction(action)) {
    const turn = applyTurnAction(game.turn, action, {
      ...context,
      isSeat: (playerId) => game.players.some(({ id }) => id === playerId),
      groups: game.turnGroups,
    })
    return turn === null ? game : withLogged(withTurn(game, turn, context.now), context.operationId)
  }
  const applied = isModeAction(action)
    ? applyLocalModeAction(game, action, context)
    : applyBoardTableAction(game, action, context)
  return applied === game
    ? game
    : withLogged(startTurnOnChange(applied, context.now), context.operationId)
}

function engineTableAction(
  game: LocalGame,
  action: TableAction,
  context: { operationId: string; now: number },
): LocalGame {
  const outcome = writeLocalGame(
    game,
    { kind: "table", action, operationId: context.operationId },
    context.now,
  )
  if (!outcome) return game
  const counted =
    outcome.table && outcome.table !== game.table
      ? countedChange(game.table ?? EMPTY_TABLE, outcome.table, action)
      : undefined
  const { table: _table, ...rest } = game
  const changed = withTurn(
    {
      ...rest,
      ...(outcome.table ? { table: outcome.table } : {}),
      players: outcome.players,
      ...(counted?.delta
        ? {
            counterLog: [
              ...(game.counterLog ?? []),
              {
                ...counted,
                operationId: context.operationId,
                playerId: action.playerId as PlayerId,
                at: context.now,
              },
            ].slice(-MAX_COUNTER_LOG),
          }
        : {}),
    },
    outcome.turn,
    context.now,
  )
  if (
    outcome.table === game.table &&
    outcome.players === game.players &&
    changed.turn === game.turn
  )
    return game
  return withLogged(
    { ...changed, updatedAt: Math.max(game.updatedAt, context.now) },
    context.operationId,
  )
}

function engineEvent(game: LocalGame, event: CompensatableEvent): LocalGame {
  const sent = {
    operationId: event.operationId,
    delta: event.delta,
    ...(event.compensatesOperationId ? { undoOf: event.compensatesOperationId } : {}),
  }
  const outcome = writeLocalGame(
    game,
    event.type === "life.changed"
      ? { kind: "life", playerId: event.playerId, ...sent }
      : {
          kind: "commander.claim",
          commanderLimit: MAX_COMMANDER_DAMAGE,
          fromPlayerId: event.fromPlayerId,
          toPlayerId: event.toPlayerId,
          ...(event.commander ? { commander: event.commander } : {}),
          ...sent,
        },
    event.clientCreatedAt,
  )
  if (!outcome) return game
  const { table: _table, ...rest } = game
  return withTurn(
    {
      ...rest,
      ...(outcome.table ? { table: outcome.table } : {}),
      players: outcome.players,
      ...(event.type === "commanderDamage.assigned" && outcome.total !== undefined
        ? {
            commanderDamage: {
              ...game.commanderDamage,
              [commanderDamageKey(event.fromPlayerId, event.toPlayerId, event.commander)]:
                outcome.total,
            },
          }
        : {}),
      events: [...game.events, event],
      updatedAt: Math.max(game.updatedAt, event.clientCreatedAt),
    },
    outcome.turn,
    event.clientCreatedAt,
  )
}

function withLogged(game: LocalGame, operationId: string): LocalGame {
  const logged = { ...game, logOrder: [...(game.logOrder ?? []), operationId] }
  return { ...logged, logOrder: retainedLogOrder(logged) }
}

export function retainedLogOrder(
  game: Pick<LocalGame, "logOrder" | "events" | "turnLog" | "counterLog" | "table">,
) {
  const retained = new Set([
    ...[...game.events, ...(game.turnLog ?? []), ...(game.counterLog ?? [])].map(
      ({ operationId }) => operationId,
    ),
    ...(game.table?.modes?.log ?? []).flatMap(({ operationId }) => operationId ?? []),
  ])
  return (game.logOrder ?? []).filter((id) => retained.has(id))
}

/** why: a game saved before `logOrder`, or by an older build after a rollback, has changes missing from it, which go right after the last logged change before them in their own list. */
export function localLogPositions(
  game: Pick<LocalGame, "logOrder" | "events" | "turnLog" | "counterLog">,
  extra: readonly { operationId: string; at: number }[] = [],
): (operationId: string) => number | undefined {
  const positions = new Map((game.logOrder ?? []).map((id, index) => [id, index]))
  const unlogged = [
    game.events.map(({ operationId, clientCreatedAt }) => ({ operationId, at: clientCreatedAt })),
    (game.turnLog ?? []).map(({ operationId, at }) => ({ operationId, at })),
    (game.counterLog ?? []).map(({ operationId, at }) => ({ operationId, at })),
    extra,
  ].flatMap((list) => {
    let after = -1
    let at = -Infinity
    return list.flatMap(({ operationId, at: stamped }) => {
      const logged = positions.get(operationId)
      if (logged !== undefined) {
        after = logged
        at = -Infinity
        return []
      }
      at = Math.max(at, stamped)
      return [{ operationId, after, at }]
    })
  })
  unlogged.sort((left, right) => left.after - right.after || left.at - right.at)
  unlogged.forEach(({ operationId, after }, index) =>
    positions.set(operationId, after + (index + 1) / (unlogged.length + 1)),
  )
  return (operationId) => positions.get(operationId)
}

function applyLocalModeAction(
  game: LocalGame,
  action: ModeAction,
  context: { operationId: string; now: number },
): LocalGame {
  const table = game.table ?? EMPTY_TABLE
  const modes = applyModeAction(table.modes, action, {
    turn: game.turn,
    now: context.now,
    operationId: context.operationId,
  })
  if (!modes || modes === table.modes) return game
  return {
    ...game,
    table: { ...table, modes },
    updatedAt: Math.max(game.updatedAt, context.now),
  }
}

export function startTurnOnChange(game: LocalGame, now: number): LocalGame {
  const turn = startedByChange(game.turn, now)
  return turn ? withTurn(game, turn, now) : game
}

function applyBoardTableAction(
  game: LocalGame,
  action: TableAction,
  context: { operationId: string; now: number },
): LocalGame {
  const table = game.table ?? EMPTY_TABLE
  const teams = localTeams(game)
  const change = applyTableAction(teams ? { ...table, turnGroups: teams } : table, action, {
    rules: localTableRules(game),
    operationId: context.operationId,
    lifeOf: (playerId) => game.players.find(({ id }) => id === playerId)?.life,
  })
  if (
    !change ||
    (change.table.players === table.players && change.table.designations === table.designations)
  )
    return game
  const counted = countedChange(table, change.table, action)
  const { turnGroups: _groups, ...changed } = change.table
  const players = game.players.map((player) => {
    const delta = change.life
      .filter((life) => life.playerId === player.id)
      .reduce((total, life) => total + life.delta, 0)
    return delta === 0 ? player : { ...player, life: player.life + delta }
  })
  return {
    ...game,
    table: changed,
    players,
    ...(counted
      ? {
          counterLog: [
            ...(game.counterLog ?? []),
            {
              ...counted,
              operationId: context.operationId,
              playerId: action.playerId as PlayerId,
              at: context.now,
            },
          ].slice(-MAX_COUNTER_LOG),
        }
      : {}),
    updatedAt: Math.max(game.updatedAt, context.now),
  }
}

const MAX_COUNTER_LOG = 400

function countedChange(before: TableState, after: TableState, action: TableAction) {
  if (action.kind === "counter.changed") {
    const was = playerTableOf(before, action.playerId).counters?.[action.counterId] ?? 0
    const now = playerTableOf(after, action.playerId).counters?.[action.counterId] ?? 0
    return { counterId: action.counterId, delta: now - was, value: now }
  }
  if (action.kind !== "customCounter.changed") return undefined
  const was = findCustomCounter(playerTableOf(before, action.playerId), action.name)
  const now = findCustomCounter(playerTableOf(after, action.playerId), action.name)
  const name = now?.name ?? was?.name
  if (!name) return undefined
  const value = now?.value ?? 0
  return { counterId: customCounterId(name), delta: value - (was?.value ?? 0), value }
}

export function localStandingWinners(game: LocalGame) {
  return standingWinners(localOutState(game))
}

type CompensatableEvent = LifeChangedEvent | CommanderDamageAssignedEvent

function isCompensatable(event: GameEvent): event is CompensatableEvent {
  return event.type === "life.changed" || event.type === "commanderDamage.assigned"
}

function compensatedOperationIds(game: LocalGame): Set<OperationId> {
  return new Set(
    game.events.flatMap((event) =>
      isCompensatable(event) && event.compensatesOperationId ? [event.compensatesOperationId] : [],
    ),
  )
}

export function reduceGameEvent(game: LocalGame, event: GameEvent): LocalGame {
  if (
    event.gameId !== game.id ||
    game.events.some(({ operationId }) => operationId === event.operationId)
  ) {
    return game
  }
  if (game.status !== "active") return game
  if (localRules.engine && isCompensatable(event)) return engineEvent(game, event)

  if (event.type === "life.changed") {
    if (!isLifeDelta(event.delta)) return game
    const playerIndex = game.players.findIndex(({ id }) => id === event.playerId)
    if (playerIndex < 0) return game
    if (event.compensatesOperationId) {
      const target = game.events.find(
        (candidate): candidate is LifeChangedEvent =>
          candidate.type === "life.changed" &&
          candidate.operationId === event.compensatesOperationId &&
          candidate.playerId === event.playerId &&
          candidate.delta === -event.delta,
      )
      if (
        !target ||
        target.compensatesOperationId ||
        compensatedOperationIds(game).has(event.compensatesOperationId)
      )
        return game
    }

    const players = game.players.map((player) =>
      sharesLife(game, event.playerId, player.id)
        ? { ...player, life: player.life + event.delta }
        : player,
    )
    return {
      ...game,
      players,
      events: [...game.events, event],
      updatedAt: Math.max(game.updatedAt, event.clientCreatedAt),
    }
  }

  if (event.type === "commanderDamage.assigned") {
    if (event.fromPlayerId === event.toPlayerId) return game
    if (!Number.isInteger(event.delta) || event.delta === 0) return game
    const source = game.players.some(({ id }) => id === event.fromPlayerId)
    const targetIndex = game.players.findIndex(({ id }) => id === event.toPlayerId)
    if (!source || targetIndex < 0) return game
    if (event.compensatesOperationId) {
      const compensated = game.events.find(
        (candidate): candidate is CommanderDamageAssignedEvent =>
          candidate.type === "commanderDamage.assigned" &&
          candidate.operationId === event.compensatesOperationId &&
          candidate.fromPlayerId === event.fromPlayerId &&
          candidate.toPlayerId === event.toPlayerId &&
          candidate.commander === event.commander &&
          candidate.delta === -event.delta,
      )
      if (
        !compensated ||
        compensated.compensatesOperationId ||
        compensatedOperationIds(game).has(event.compensatesOperationId)
      )
        return game
    }

    const key = commanderDamageKey(event.fromPlayerId, event.toPlayerId, event.commander)
    const total = (game.commanderDamage?.[key] ?? 0) + event.delta
    if (total < 0 || total > MAX_COMMANDER_DAMAGE) return game

    const players = game.players.map((player) =>
      sharesLife(game, event.toPlayerId, player.id)
        ? { ...player, life: player.life - event.delta }
        : player,
    )
    return {
      ...game,
      players,
      commanderDamage: { ...game.commanderDamage, [key]: total },
      events: [...game.events, event],
      updatedAt: Math.max(game.updatedAt, event.clientCreatedAt),
    }
  }

  const status = event.type === "game.finished" ? "finished" : "abandoned"
  const result = event.type === "game.finished" ? sanitizeGameResult(game, event.result) : undefined
  const finished: LocalGame = {
    ...game,
    status,
    events: [...game.events, event],
    updatedAt: Math.max(game.updatedAt, event.clientCreatedAt),
    finishedAt: event.clientCreatedAt,
    ...(result ? { result } : {}),
  }
  const matchResult = status === "finished" ? completedMatchResult(finished) : undefined
  return matchResult
    ? { ...finished, match: { ...finished.match!, result: matchResult } }
    : finished
}

export function sanitizeGameResult(
  game: LocalGame,
  result: LocalGameResult | undefined,
): LocalGameResult | undefined {
  if (!result) return undefined
  if (result.kind === "draw") return { kind: "draw" }
  const playerIds = new Set(game.players.map(({ id }) => id))
  const winnerPlayerIds = [...new Set(result.winnerPlayerIds)].filter((id) => playerIds.has(id))
  return winnerPlayerIds.length > 0 ? { kind: "win", winnerPlayerIds } : undefined
}

export function commandToEvent(
  game: LocalGame,
  command: GameCommand,
  context: CommandContext,
): GameEvent | null {
  if (game.status !== "active") return null
  const base = {
    operationId: context.operationId(),
    gameId: game.id,
    actorId: context.actorId,
    deviceId: context.deviceId,
    clientCreatedAt: context.now(),
  }

  if (command.type === "life.change") {
    const player = game.players.find(({ id }) => id === command.playerId)
    if (!isLifeDelta(command.delta) || !player) return null
    const delta = flooredLifeDelta(game.system, player.life, command.delta)
    if (!isLifeDelta(delta)) return null
    return { ...base, type: "life.changed", playerId: command.playerId, delta }
  }
  if (command.type === "commanderDamage.assign") {
    const { fromPlayerId, toPlayerId, commander } = command
    if (fromPlayerId === toPlayerId) return null
    if (!Number.isInteger(command.delta) || command.delta === 0) return null
    if (
      !game.players.some(({ id }) => id === fromPlayerId) ||
      !game.players.some(({ id }) => id === toPlayerId)
    )
      return null
    const delta = clampedCommanderDelta(
      commanderDamageBetween(game, fromPlayerId, toPlayerId, commander),
      command.delta,
    )
    if (delta === 0) return null
    return {
      ...base,
      type: "commanderDamage.assigned",
      fromPlayerId,
      toPlayerId,
      ...(commander ? { commander } : {}),
      delta,
    }
  }
  if (command.type === "life.undo") {
    const compensated = compensatedOperationIds(game)
    const target = game.events.findLast(
      (event): event is CompensatableEvent =>
        isCompensatable(event) &&
        !event.compensatesOperationId &&
        (command.operationId === undefined
          ? event.actorId === context.actorId
          : event.operationId === command.operationId) &&
        !compensated.has(event.operationId),
    )
    if (!target) return null
    if (target.type === "commanderDamage.assigned")
      return {
        ...base,
        type: "commanderDamage.assigned",
        fromPlayerId: target.fromPlayerId,
        toPlayerId: target.toPlayerId,
        ...(target.commander ? { commander: target.commander } : {}),
        delta: -target.delta,
        compensatesOperationId: target.operationId,
      }
    return {
      ...base,
      type: "life.changed",
      playerId: target.playerId,
      delta: -target.delta as LifeDelta,
      compensatesOperationId: target.operationId,
    }
  }
  if (command.type === "game.finish") {
    const result = sanitizeGameResult(game, command.result)
    return { ...base, type: "game.finished", ...(result ? { result } : {}) }
  }
  return { ...base, type: "game.abandoned" }
}

export function applyGameCommand(
  game: LocalGame,
  command: GameCommand,
  context: CommandContext,
): LocalGame {
  const event = commandToEvent(game, command, context)
  if (!event) return game
  const next = reduceGameEvent(game, event)
  return next === game ? game : withLogged(next, event.operationId)
}

export function hasPlayBegun(game: LocalGame): boolean {
  if (turnsPassed(game.turn) > 0) return true
  if (
    game.events.some(({ type }) => type === "life.changed" || type === "commanderDamage.assigned")
  )
    return true
  if (game.players.some((player) => player.life !== (player.startingLife ?? game.startingLife)))
    return true
  const table = game.table
  if (!table) return false
  if (Object.keys(table.designations).length > 0) return true
  return Object.values(table.players).some(
    ({ counters, pokemon }) =>
      Object.values(counters ?? {}).some((value) => value !== 0) ||
      [pokemon?.active, ...(pokemon?.bench ?? [])].some((card) => (card?.damage ?? 0) > 0),
  )
}

export function hasLocalGameStarted(game: LocalGame): boolean {
  return (
    game.events.length > 0 ||
    turnsPassed(game.turn) > 0 ||
    game.players.some((player) => player.life !== (player.startingLife ?? game.startingLife)) ||
    Object.values(game.commanderDamage ?? {}).some((damage) => damage !== 0) ||
    tableHasState(game.table)
  )
}

export function canUndo(game: LocalGame, actorId: ActorId): boolean {
  const compensated = compensatedOperationIds(game)
  return game.events.some(
    (event) =>
      isCompensatable(event) &&
      !event.compensatesOperationId &&
      event.actorId === actorId &&
      !compensated.has(event.operationId),
  )
}

export function undoableTurn(game: LocalGame, actorId: ActorId) {
  const turn = game.turn
  if (!turn?.previous) return undefined
  const compensated = compensatedOperationIds(game)
  const lastChange = game.events.findLast(
    (event): event is CompensatableEvent =>
      isCompensatable(event) &&
      !event.compensatesOperationId &&
      event.actorId === actorId &&
      !compensated.has(event.operationId),
  )
  const positionOf = localLogPositions(game)
  if (
    lastChange &&
    (positionOf(lastChange.operationId) ?? -Infinity) > (positionOf(turn.operationId) ?? -Infinity)
  )
    return undefined
  return { playerId: turn.previous.playerId, turnOperationId: turn.operationId }
}

export function defaultCommandContext(deviceId: DeviceId): CommandContext {
  return {
    actorId: asActorId(`actor_${deviceId}`),
    deviceId,
    now: Date.now,
    operationId: () => asOperationId(createClientId("operation")),
  }
}
