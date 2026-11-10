import { v, type Infer } from "convex/values"

import { PLANAR_DECKS, SCHEME_DECKS, type ModeCard } from "./modeDecks"
import { systemDefinition } from "./systems"
import { sharesTurn, type Turn, type TurnGroups } from "./turns"

// why: these follow Comprehensive Rules 901 (Planechase) and 904 (Archenemy); rule changes start there.

export const planarFaceValidator = v.union(
  v.literal("planeswalk"),
  v.literal("chaos"),
  v.literal("blank"),
)
export type PlanarFace = Infer<typeof planarFaceValidator>

export const PLANAR_DIE: readonly PlanarFace[] = [
  "planeswalk",
  "chaos",
  "blank",
  "blank",
  "blank",
  "blank",
]

const modeLogValidator = v.object({
  kind: v.union(
    v.literal("rolled"),
    v.literal("walked"),
    v.literal("reset"),
    v.literal("revealed"),
    v.literal("abandoned"),
  ),
  playerId: v.string(),
  at: v.number(),
  face: v.optional(planarFaceValidator),
  cost: v.optional(v.number()),
  card: v.optional(v.number()),
  operationId: v.optional(v.string()),
})
export type ModeLogEntry = Infer<typeof modeLogValidator>

export const planechaseValidator = v.object({
  decks: v.optional(v.array(v.string())),
  order: v.optional(v.array(v.number())),
  faceUp: v.optional(v.number()),
  rolls: v.record(v.string(), v.number()),
  rollsTurn: v.optional(v.number()),
  rollsTurnId: v.optional(v.string()),
  previousRolls: v.optional(
    v.object({ turnId: v.string(), rolls: v.record(v.string(), v.number()) }),
  ),
})

export const archenemyValidator = v.object({
  playerId: v.string(),
  deck: v.optional(v.string()),
  order: v.optional(v.array(v.number())),
  ongoing: v.optional(v.array(v.number())),
  shown: v.optional(v.number()),
  revealedTurn: v.optional(v.number()),
})

export const tableModesValidator = v.object({
  planechase: v.optional(planechaseValidator),
  archenemy: v.optional(archenemyValidator),
  log: v.optional(v.array(modeLogValidator)),
})

export const modeSetupValidator = v.object({
  planechase: v.optional(v.object({ decks: v.optional(v.array(v.string())) })),
  archenemy: v.optional(v.object({ seat: v.optional(v.number()), deck: v.optional(v.string()) })),
})

export type Planechase = Infer<typeof planechaseValidator>
export type Archenemy = Infer<typeof archenemyValidator>
export type TableModes = Infer<typeof tableModesValidator>
export type ModeSetup = Infer<typeof modeSetupValidator>

export const modeActionValidators = [
  v.object({ kind: v.literal("planar.rolled"), playerId: v.string(), face: planarFaceValidator }),
  v.object({ kind: v.literal("planar.walked"), playerId: v.string() }),
  v.object({ kind: v.literal("planar.reset"), playerId: v.string() }),
  v.object({ kind: v.literal("scheme.revealed"), playerId: v.string() }),
  v.object({ kind: v.literal("scheme.abandoned"), playerId: v.string(), card: v.number() }),
] as const
export type ModeAction = Infer<(typeof modeActionValidators)[number]>

const MODE_ACTION_KINDS: readonly string[] = modeActionValidators.map(
  (member) => member.fields.kind.value,
)
export const isModeAction = (action: { kind: string }): action is ModeAction =>
  MODE_ACTION_KINDS.includes(action.kind)

/** why: clients list the modes they can play beside variants, so an app from before these modes is asked to update. */
export const PLANECHASE_CAPABILITY = "planechase"
export const CLIENT_VARIANTS: readonly string[] = [
  "treachery",
  "archenemy",
  "twoHeadedGiant",
  PLANECHASE_CAPABILITY,
]
export const ARCHENEMY_LIFE = 40
export const ARCHENEMY_TEAM_LIFE = 20
export const ARCHENEMY_MIN_SEATS = 3
const MAX_LOG = 30

export const planarDeck = (id: string) => PLANAR_DECKS.find((deck) => deck.id === id)
export const schemeDeck = (id: string) => SCHEME_DECKS.find((deck) => deck.id === id)

export function planarCards(decks: readonly string[] | undefined): readonly ModeCard[] {
  return (decks ?? []).flatMap((id) => planarDeck(id)?.cards ?? [])
}

export function schemeCards(deck: string | undefined): readonly ModeCard[] {
  return (deck && schemeDeck(deck)?.cards) || []
}

export function faceUpPlane(planechase: Planechase | undefined) {
  const index = planechase?.order?.[0] ?? planechase?.faceUp
  return index === undefined ? undefined : planarCards(planechase?.decks)[index]
}

const NO_ROLLS: Planechase["rolls"] = {}

function turnRolls(planechase: Planechase, turn: Turn | undefined): Planechase["rolls"] {
  if (!turn) return planechase.rollsTurn === undefined ? planechase.rolls : NO_ROLLS
  if (
    planechase.rollsTurn === turn.number &&
    (planechase.rollsTurnId === undefined || planechase.rollsTurnId === turn.operationId)
  )
    return planechase.rolls
  return planechase.previousRolls?.turnId === turn.operationId
    ? planechase.previousRolls.rolls
    : NO_ROLLS
}

export function rollCost(planechase: Planechase, turn: Turn | undefined, playerId: string) {
  return turnRolls(planechase, turn)[playerId] ?? 0
}

export const mayRoll = (turn: Turn | undefined, groups: TurnGroups | undefined, playerId: string) =>
  !turn || sharesTurn(groups, turn.playerId, playerId)

export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[result[index], result[other]] = [result[other]!, result[index]!]
  }
  return result
}

function startingPlanarOrder(cards: readonly ModeCard[], random: () => number) {
  const order = shuffled(
    cards.map((_, index) => index),
    random,
  )
  const firstPlane = order.findIndex((index) => cards[index]?.kind === "plane")
  return firstPlane <= 0 ? order : [...order.slice(firstPlane), ...order.slice(0, firstPlane)]
}

export interface StartedModes {
  modes?: TableModes
  turnGroups?: string[][]
  archenemyId?: string
}

/** why: every authority starts a game's modes here, so a local game, Convex, and a nearby host shuffle and pick the archenemy the same way. */
export function startModes(
  setup: ModeSetup | undefined,
  playerIds: readonly string[],
  random: () => number = Math.random,
): StartedModes {
  if (!setup?.planechase && !setup?.archenemy) return {}
  const decks = setup.planechase?.decks?.filter((id) => planarDeck(id))
  const planechase: Planechase | undefined = setup.planechase
    ? {
        rolls: {},
        ...(decks?.length ? { decks, order: startingPlanarOrder(planarCards(decks), random) } : {}),
      }
    : undefined
  const chosen = setup.archenemy
  const seat = chosen?.seat
  const archenemyId = !chosen
    ? undefined
    : seat !== undefined && playerIds[seat - 1] !== undefined
      ? playerIds[seat - 1]
      : playerIds[Math.floor(random() * playerIds.length)]
  const deck = chosen?.deck && schemeDeck(chosen.deck) ? chosen.deck : undefined
  const archenemy: Archenemy | undefined = archenemyId
    ? {
        playerId: archenemyId,
        ...(deck
          ? {
              deck,
              order: shuffled(
                schemeCards(deck).map((_, index) => index),
                random,
              ),
            }
          : {}),
      }
    : undefined
  return {
    modes: { ...(planechase ? { planechase } : {}), ...(archenemy ? { archenemy } : {}) },
    ...(archenemyId
      ? {
          archenemyId,
          turnGroups: [[archenemyId], playerIds.filter((id) => id !== archenemyId)],
        }
      : {}),
  }
}

export function modeGameFields(started: StartedModes, now: number, operationId: string) {
  const { modes, turnGroups, archenemyId } = started
  return {
    ...(modes ? { modes } : {}),
    ...(turnGroups ? { turnGroups } : {}),
    ...(archenemyId
      ? {
          turn: {
            playerId: archenemyId,
            number: 1,
            startedAt: now,
            operationId,
            waiting: true as const,
          },
        }
      : {}),
  }
}

export interface ModeContext {
  turn?: Turn
  groups?: TurnGroups
  now: number
  operationId?: string
}

function logged(modes: TableModes, entry: ModeLogEntry): TableModes {
  return { ...modes, log: [...(modes.log ?? []), entry].slice(-MAX_LOG) }
}

function walk(planechase: Planechase): Planechase {
  const [top, ...rest] = planechase.order ?? []
  return top === undefined ? planechase : { ...planechase, order: [...rest, top] }
}

function walkedEntry(planechase: Planechase, playerId: string, at: number): ModeLogEntry {
  const card = planechase.order?.[0]
  return { kind: "walked", playerId, at, ...(card === undefined ? {} : { card }) }
}

/** why: one reducer for every authority and the optimistic overlay, with the die face as an input, so every reducer agrees on a roll. */
export function applyModeAction(
  modes: TableModes | undefined,
  action: ModeAction,
  context: ModeContext,
): TableModes | null {
  const next = appliedModeAction(modes, action, context)
  const { operationId } = context
  if (!next?.log || !operationId || next.log === modes?.log) return next
  const before = new Set(modes?.log)
  return {
    ...next,
    log: next.log.map((entry) => (before.has(entry) ? entry : { ...entry, operationId })),
  }
}

function appliedModeAction(
  modes: TableModes | undefined,
  action: ModeAction,
  context: ModeContext,
): TableModes | null {
  const { playerId } = action
  const at = context.now
  if (action.kind === "scheme.revealed" || action.kind === "scheme.abandoned") {
    const archenemy = modes?.archenemy
    if (!modes || !archenemy || archenemy.playerId !== playerId) return null
    if (action.kind === "scheme.abandoned") {
      if (!archenemy.ongoing?.includes(action.card)) return null
      return logged(
        {
          ...modes,
          archenemy: {
            ...archenemy,
            ongoing: archenemy.ongoing.filter((card) => card !== action.card),
            ...(archenemy.order ? { order: [...archenemy.order, action.card] } : {}),
          },
        },
        { kind: "abandoned", playerId, at, card: action.card },
      )
    }
    const revealedTurn = context.turn ? { revealedTurn: context.turn.number } : {}
    const [top, ...rest] = archenemy.order ?? []
    if (top === undefined)
      return archenemy.order?.length === 0
        ? null
        : logged(
            { ...modes, archenemy: { ...archenemy, ...revealedTurn } },
            {
              kind: "revealed",
              playerId,
              at,
            },
          )
    const ongoing = schemeCards(archenemy.deck)[top]?.kind === "ongoing"
    const { shown: _before, ...kept } = archenemy
    return logged(
      {
        ...modes,
        archenemy: ongoing
          ? { ...kept, ...revealedTurn, order: rest, ongoing: [...(archenemy.ongoing ?? []), top] }
          : { ...kept, ...revealedTurn, order: [...rest, top], shown: top },
      },
      { kind: "revealed", playerId, at, card: top },
    )
  }

  const planechase = modes?.planechase
  if (!modes || !planechase) return null
  if (action.kind === "planar.reset") {
    if (Object.keys(planechase.rolls).length === 0) return modes
    return logged(
      { ...modes, planechase: { ...planechase, rolls: {} } },
      { kind: "reset", playerId, at },
    )
  }
  if (action.kind === "planar.walked") {
    const walked = walk(planechase)
    return logged({ ...modes, planechase: walked }, walkedEntry(walked, playerId, at))
  }
  if (!mayRoll(context.turn, context.groups, playerId)) return null
  if (faceUpPlane(planechase)?.kind === "phenomenon") return null
  const cost = rollCost(planechase, context.turn, playerId)
  const counted = turnRolls(planechase, context.turn)
  const displaced =
    counted !== planechase.rolls && planechase.rollsTurnId !== undefined
      ? { previousRolls: { turnId: planechase.rollsTurnId, rolls: planechase.rolls } }
      : {}
  const rolled: Planechase = {
    ...planechase,
    ...displaced,
    rolls: { ...counted, [playerId]: cost + 1 },
    ...(context.turn
      ? { rollsTurn: context.turn.number, rollsTurnId: context.turn.operationId }
      : {}),
  }
  const afterRoll = logged(
    { ...modes, planechase: rolled },
    { kind: "rolled", playerId, at, face: action.face, cost },
  )
  if (action.face !== "planeswalk") return afterRoll
  const walked = walk(rolled)
  return logged({ ...afterRoll, planechase: walked }, walkedEntry(walked, playerId, at))
}

const isIndexOrder = (order: readonly number[], size: number) =>
  order.every((index) => Number.isInteger(index) && index >= 0 && index < size) &&
  new Set(order).size === order.length

function isValidPlanechase(planechase: Planechase, playerIds: ReadonlySet<string>) {
  const decks = planechase.decks
  if (decks && !decks.every((id) => planarDeck(id))) return false
  const size = planarCards(decks).length
  return (
    Object.keys(planechase.rolls).every((id) => playerIds.has(id)) &&
    [planechase.rolls, planechase.previousRolls?.rolls ?? {}].every(
      (rolls) =>
        Object.keys(rolls).every((id) => playerIds.has(id)) &&
        Object.values(rolls).every((count) => Number.isInteger(count) && count >= 0),
    ) &&
    (planechase.order === undefined ||
      (planechase.order.length === size && isIndexOrder(planechase.order, size)))
  )
}

function isValidArchenemy(archenemy: Archenemy, playerIds: ReadonlySet<string>) {
  if (!playerIds.has(archenemy.playerId)) return false
  if (archenemy.deck === undefined)
    return !archenemy.order && !archenemy.ongoing && archenemy.shown === undefined
  const size = schemeCards(archenemy.deck).length
  const cards = [...(archenemy.order ?? []), ...(archenemy.ongoing ?? [])]
  return (
    size > 0 &&
    cards.length === size &&
    isIndexOrder(cards, size) &&
    (archenemy.shown === undefined || cards.includes(archenemy.shown))
  )
}

export function isValidModes(modes: TableModes, playerIds: ReadonlySet<string>) {
  return (
    (modes.planechase === undefined || isValidPlanechase(modes.planechase, playerIds)) &&
    (modes.archenemy === undefined || isValidArchenemy(modes.archenemy, playerIds)) &&
    (modes.log ?? []).every((entry) => playerIds.has(entry.playerId))
  )
}

/** why: every device but the authority gets this, so no client can read an unrevealed plane or scheme off the wire. */
export function revealedModes(modes: TableModes): TableModes {
  const { planechase, archenemy } = modes
  const faceUp = planechase?.order?.[0]
  return {
    ...modes,
    ...(planechase
      ? {
          planechase: {
            ...withoutOrder(planechase),
            ...(faceUp === undefined ? {} : { faceUp }),
          },
        }
      : {}),
    ...(archenemy ? { archenemy: withoutOrder(archenemy) } : {}),
  }
}

function withoutOrder<Deck extends { order?: number[] }>({ order: _hidden, ...shown }: Deck) {
  return shown
}

const remapRolls = (rolls: Planechase["rolls"], idOf: (playerId: string) => string) =>
  Object.fromEntries(Object.entries(rolls).map(([id, count]) => [idOf(id), count]))

export function remapModes(modes: TableModes, idOf: (playerId: string) => string): TableModes {
  const { planechase, archenemy, log } = modes
  return {
    ...(planechase
      ? {
          planechase: {
            ...planechase,
            rolls: remapRolls(planechase.rolls, idOf),
            ...(planechase.previousRolls
              ? {
                  previousRolls: {
                    ...planechase.previousRolls,
                    rolls: remapRolls(planechase.previousRolls.rolls, idOf),
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(archenemy ? { archenemy: { ...archenemy, playerId: idOf(archenemy.playerId) } } : {}),
    ...(log ? { log: log.map((entry) => ({ ...entry, playerId: idOf(entry.playerId) })) } : {}),
  }
}

export function systemPlaysModeSetup(system: unknown, setup: ModeSetup) {
  const definition = systemDefinition(system)
  return (
    (!setup.planechase || definition?.planechase === true) &&
    (!setup.archenemy || definition?.variants.includes("archenemy") === true)
  )
}

export function isValidModeSetup(setup: ModeSetup, playerCount: number) {
  const seat = setup.archenemy?.seat
  return (
    (setup.planechase?.decks ?? []).every((id) => planarDeck(id)) &&
    (setup.archenemy?.deck === undefined || schemeDeck(setup.archenemy.deck) !== undefined) &&
    (seat === undefined || (Number.isInteger(seat) && seat >= 1 && seat <= playerCount)) &&
    (!setup.archenemy || playerCount >= ARCHENEMY_MIN_SEATS)
  )
}
