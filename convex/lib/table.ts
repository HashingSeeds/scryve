import { v, type GenericValidator, type Infer } from "convex/values"

import type { PokemonBoardDefinition, TableDefinition } from "./systems"

export const MAX_POKEMON_HP = 999
export const MAX_POKEMON_DAMAGE = 999
export const POKEMON_HP_FACET = "hp"
const MAX_POKEMON_CARD_ID_LENGTH = 200
const MAX_POKEMON_NAME_LENGTH = 100
const POKEMON_ID = /^[A-Za-z0-9_-]{8,64}$/
const OPERATION_ID = /^[A-Za-z0-9_-]{16,128}$/

export const pokemonSlotValidator = v.union(v.literal("active"), v.literal("bench"))

/** why: what a player chose to put in play; HP comes from the catalog or is typed in by hand. */
export const pokemonCardValidator = v.object({
  cardId: v.optional(v.string()),
  name: v.optional(v.string()),
  hp: v.number(),
  prizes: v.number(),
})

export const pokemonValidator = pokemonCardValidator.extend({ id: v.string(), damage: v.number() })

/** why: only the latest knockout on a board can be undone, so the board keeps just enough to put it back. */
export const pokemonKnockoutValidator = v.object({
  operationId: v.string(),
  pokemon: pokemonValidator,
  slot: pokemonSlotValidator,
  takerPlayerId: v.optional(v.string()),
  prizesTaken: v.number(),
})

export const pokemonBoardValidator = v.object({
  active: v.optional(pokemonValidator),
  bench: v.array(pokemonValidator),
  lastKnockout: v.optional(pokemonKnockoutValidator),
})

export const playerTableValidator = v.object({
  counters: v.optional(v.record(v.string(), v.number())),
  pokemon: v.optional(pokemonBoardValidator),
})

/** why: designations map a designation id to its holder; players map a player id to their counters and Pokémon. */
export const tableStateValidator = v.object({
  designations: v.record(v.string(), v.string()),
  players: v.record(v.string(), playerTableValidator),
})

export const tableActionValidator = v.union(
  v.object({
    kind: v.literal("counter.changed"),
    playerId: v.string(),
    counterId: v.string(),
    delta: v.number(),
  }),
  v.object({
    kind: v.literal("designation.taken"),
    playerId: v.string(),
    designationId: v.string(),
  }),
  v.object({
    kind: v.literal("designation.released"),
    playerId: v.string(),
    designationId: v.string(),
  }),
  v.object({
    kind: v.literal("pokemon.placed"),
    playerId: v.string(),
    pokemonId: v.string(),
    slot: pokemonSlotValidator,
    card: pokemonCardValidator,
  }),
  v.object({
    kind: v.literal("pokemon.updated"),
    playerId: v.string(),
    pokemonId: v.string(),
    card: pokemonCardValidator,
  }),
  v.object({
    kind: v.literal("pokemon.damaged"),
    playerId: v.string(),
    pokemonId: v.string(),
    delta: v.number(),
    /** why: damage that turns out lethal on the current table knocks out, and this seat takes the prizes. */
    takerPlayerId: v.optional(v.string()),
  }),
  v.object({ kind: v.literal("pokemon.switched"), playerId: v.string(), pokemonId: v.string() }),
  v.object({ kind: v.literal("pokemon.removed"), playerId: v.string(), pokemonId: v.string() }),
  v.object({
    kind: v.literal("pokemon.knockedOut"),
    playerId: v.string(),
    pokemonId: v.string(),
    takerPlayerId: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("pokemon.knockoutUndone"),
    playerId: v.string(),
    knockoutOperationId: v.string(),
  }),
)

export type PokemonSlot = Infer<typeof pokemonSlotValidator>
export type PokemonCard = Infer<typeof pokemonCardValidator>
export type PokemonInPlay = Infer<typeof pokemonValidator>
export type PokemonKnockout = Infer<typeof pokemonKnockoutValidator>
export type PokemonBoard = Infer<typeof pokemonBoardValidator>
export type PlayerTable = Infer<typeof playerTableValidator>
export type TableState = Infer<typeof tableStateValidator>
export type TableAction = Infer<typeof tableActionValidator>
export type TableActionKind = TableAction["kind"]

export const TABLE_ACTION_KINDS = tableActionValidator.members.map(
  (member) => member.fields.kind.value,
)
export const EMPTY_TABLE: TableState = { designations: {}, players: {} }
const EMPTY_BOARD: PokemonBoard = { bench: [] }

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function matches(validator: GenericValidator, value: unknown): boolean {
  switch (validator.kind) {
    case "string":
    case "id":
      return typeof value === "string"
    case "float64":
      return typeof value === "number" && Number.isFinite(value)
    case "boolean":
      return typeof value === "boolean"
    case "null":
      return value === null
    case "literal":
      return value === validator.value
    case "array":
      return Array.isArray(value) && value.every((item) => matches(validator.element, item))
    case "record":
      return (
        isPlainRecord(value) &&
        Object.entries(value).every(
          ([key, item]) => matches(validator.key, key) && matches(validator.value, item),
        )
      )
    case "object": {
      if (!isPlainRecord(value)) return false
      const fields: Record<string, GenericValidator> = validator.fields
      return (
        Object.keys(value).every((key) => key in fields) &&
        Object.entries(fields).every(([key, field]) =>
          value[key] === undefined ? field.isOptional === "optional" : matches(field, value[key]),
        )
      )
    }
    case "union":
      return validator.members.some((member) => matches(member, value))
    default:
      return false
  }
}

/** why: stored records and server payloads are checked against the same validators the backend enforces, so the client never trusts a shape the server would reject. */
export function matchesValidator<V extends GenericValidator>(
  validator: V,
  value: unknown,
): value is Infer<V> {
  return matches(validator, value)
}

export function parseTableState(value: unknown): TableState | undefined {
  return matchesValidator(tableStateValidator, value) ? value : undefined
}

export function playerTableOf(table: TableState, playerId: string): PlayerTable {
  return table.players[playerId] ?? {}
}

export function counterValue(table: TableState, playerId: string, counterId: string): number {
  return playerTableOf(table, playerId).counters?.[counterId] ?? 0
}

export function pokemonBoardOf(table: TableState, playerId: string): PokemonBoard {
  return playerTableOf(table, playerId).pokemon ?? EMPTY_BOARD
}

export function remainingHp(pokemon: Pick<PokemonInPlay, "hp" | "damage">): number {
  return Math.max(0, pokemon.hp - pokemon.damage)
}

export function findPokemon(
  board: PokemonBoard,
  pokemonId: string,
): { pokemon: PokemonInPlay; slot: PokemonSlot } | undefined {
  if (board.active?.id === pokemonId) return { pokemon: board.active, slot: "active" }
  const benched = board.bench.find((pokemon) => pokemon.id === pokemonId)
  return benched ? { pokemon: benched, slot: "bench" } : undefined
}

/** why: a counter like poison at its losing count knocks the player out of the game. */
export function isOutByTableCounters(
  table: TableState,
  playerId: string,
  rules: TableDefinition,
): boolean {
  return rules.counters.some(
    (counter) =>
      counter.losesAt !== undefined && counterValue(table, playerId, counter.id) >= counter.losesAt,
  )
}

export function tableHasState(table: TableState | undefined): boolean {
  if (!table) return false
  return (
    Object.keys(table.designations).length > 0 ||
    Object.values(table.players).some(
      (player) =>
        Object.values(player.counters ?? {}).some((value) => value !== 0) ||
        player.pokemon?.active !== undefined ||
        (player.pokemon?.bench.length ?? 0) > 0,
    )
  )
}

/**
 * why: Pokémon rules give up extra Prize cards for rule-box Pokémon. Names carry the mechanic across every era, while TCGdex's suffix and stage fields are filled in unevenly.
 * 3: Mega Evolution Pokémon ex, VMAX, V-UNION, TAG TEAM. 2: ex, EX (including XY Megas), GX, V, VSTAR, LEGEND. 1: everything else.
 */
export function pokemonPrizeValue(name: string): 1 | 2 | 3 {
  const trimmed = name.trim()
  if (
    /^Mega\s.+\sex$/.test(trimmed) ||
    /\s(VMAX|V-UNION)$/.test(trimmed) ||
    /\s&\s.+\sGX$/.test(trimmed)
  )
    return 3
  if (/\s(ex|EX|GX|V|VSTAR|LEGEND)$/.test(trimmed)) return 2
  return 1
}

/** why: the board places a catalog card with its printed HP; HP stays undefined when the catalog lacks it so the player can type it in. */
export function pokemonCardFromCatalog(card: {
  cardId: string
  name: string
  facets: readonly { key: string; value: string }[]
}): Omit<PokemonCard, "hp"> & { hp?: number } {
  const hp = Number(card.facets.find((facet) => facet.key === POKEMON_HP_FACET)?.value)
  return {
    cardId: card.cardId,
    name: card.name,
    prizes: pokemonPrizeValue(card.name),
    ...(Number.isInteger(hp) && hp > 0 && hp <= MAX_POKEMON_HP ? { hp } : {}),
  }
}

function isWholeNumber(value: number, min: number, max: number) {
  return Number.isInteger(value) && value >= min && value <= max
}

function isValidCard(card: PokemonCard) {
  return (
    isWholeNumber(card.hp, 1, MAX_POKEMON_HP) &&
    isWholeNumber(card.prizes, 1, 3) &&
    (card.cardId === undefined ||
      (card.cardId.length > 0 && card.cardId.length <= MAX_POKEMON_CARD_ID_LENGTH)) &&
    (card.name === undefined || card.name.length <= MAX_POKEMON_NAME_LENGTH)
  )
}

function isNonZeroStep(delta: number, max: number) {
  return Number.isInteger(delta) && delta !== 0 && Math.abs(delta) <= max
}

/** why: the operation id becomes the undo handle of a knockout; `lifeOf` reads a seat's main counter, and returns undefined for ids that are not seats in this game. */
export type TableContext = {
  rules: TableDefinition
  operationId: string
  lifeOf: (playerId: string) => number | undefined
}

/** why: a knockout also moves the taker's prize counter, which lives with life outside the table state. */
export type TableChange = {
  table: TableState
  life: { playerId: string; delta: number }[]
}

function withPlayer(table: TableState, playerId: string, player: PlayerTable): TableState {
  return { ...table, players: { ...table.players, [playerId]: player } }
}

function withBoard(table: TableState, playerId: string, board: PokemonBoard): TableState {
  return withPlayer(table, playerId, { ...playerTableOf(table, playerId), pokemon: board })
}

function withoutPokemon(board: PokemonBoard, pokemonId: string): PokemonBoard {
  if (board.active?.id !== pokemonId)
    return { ...board, bench: board.bench.filter((pokemon) => pokemon.id !== pokemonId) }
  const { active: _removed, ...rest } = board
  return rest
}

function replacePokemon(board: PokemonBoard, next: PokemonInPlay): PokemonBoard {
  return board.active?.id === next.id
    ? { ...board, active: next }
    : { ...board, bench: board.bench.map((pokemon) => (pokemon.id === next.id ? next : pokemon)) }
}

/**
 * why: one reducer for local games, the connected optimistic overlay, and the Convex mutation, so every device lands on the same table. Returns null for an action the table rejects, and the same table for a no-op.
 */
export function applyTableAction(
  table: TableState,
  action: TableAction,
  context: TableContext,
): TableChange | null {
  const { rules } = context
  const unchanged = { table, life: [] }
  if (context.lifeOf(action.playerId) === undefined) return null

  if (action.kind === "counter.changed") {
    const counter = rules.counters.find(({ id }) => id === action.counterId)
    if (!counter || !isNonZeroStep(action.delta, counter.max)) return null
    const current = counterValue(table, action.playerId, counter.id)
    const next = Math.max(0, Math.min(counter.max, current + action.delta))
    if (next === current) return unchanged
    const player = playerTableOf(table, action.playerId)
    return {
      table: withPlayer(table, action.playerId, {
        ...player,
        counters: { ...player.counters, [counter.id]: next },
      }),
      life: [],
    }
  }

  if (action.kind === "designation.taken" || action.kind === "designation.released") {
    if (!rules.designations.some(({ id }) => id === action.designationId)) return null
    const holder = table.designations[action.designationId]
    if (action.kind === "designation.taken") {
      if (holder === action.playerId) return unchanged
      return {
        table: {
          ...table,
          designations: { ...table.designations, [action.designationId]: action.playerId },
        },
        life: [],
      }
    }
    if (holder !== action.playerId) return unchanged
    const { [action.designationId]: _released, ...designations } = table.designations
    return { table: { ...table, designations }, life: [] }
  }

  const pokemonRules = rules.pokemon
  if (!pokemonRules) return null
  const board = pokemonBoardOf(table, action.playerId)

  if (action.kind === "pokemon.knockoutUndone") {
    const knockout = board.lastKnockout
    if (knockout?.operationId !== action.knockoutOperationId) return null
    if (findPokemon(board, knockout.pokemon.id)) return null
    const { lastKnockout: _undone, ...rest } = board
    // why: the Pokémon goes back where it was; if a new Active was promoted meanwhile, it returns to the bench instead.
    const restored: PokemonBoard | null =
      knockout.slot === "active" && !rest.active
        ? { ...rest, active: knockout.pokemon }
        : rest.bench.length < pokemonRules.benchSize
          ? { ...rest, bench: [...rest.bench, knockout.pokemon] }
          : null
    if (!restored) return null
    return {
      table: withBoard(table, action.playerId, restored),
      life:
        knockout.takerPlayerId && knockout.prizesTaken > 0
          ? [{ playerId: knockout.takerPlayerId, delta: knockout.prizesTaken }]
          : [],
    }
  }

  if (action.kind === "pokemon.placed") {
    if (!POKEMON_ID.test(action.pokemonId) || !isValidCard(action.card)) return null
    if (findPokemon(board, action.pokemonId)) return null
    const pokemon: PokemonInPlay = { ...action.card, id: action.pokemonId, damage: 0 }
    if (action.slot === "active") {
      if (board.active) return null
      return { table: withBoard(table, action.playerId, { ...board, active: pokemon }), life: [] }
    }
    if (board.bench.length >= pokemonRules.benchSize) return null
    return {
      table: withBoard(table, action.playerId, { ...board, bench: [...board.bench, pokemon] }),
      life: [],
    }
  }

  const found = findPokemon(board, action.pokemonId)
  if (!found) return null
  const { pokemon, slot } = found

  if (action.kind === "pokemon.updated") {
    if (!isValidCard(action.card)) return null
    const next: PokemonInPlay = { ...action.card, id: pokemon.id, damage: pokemon.damage }
    return { table: withBoard(table, action.playerId, replacePokemon(board, next)), life: [] }
  }

  if (action.kind === "pokemon.damaged") {
    if (!isNonZeroStep(action.delta, MAX_POKEMON_DAMAGE)) return null
    const damage = Math.max(0, Math.min(MAX_POKEMON_DAMAGE, pokemon.damage + action.delta))
    if (damage === pokemon.damage) return unchanged
    // why: lethal damage is judged against the damage already on the table, so two devices adding damage at once still knock the Pokémon out.
    if (action.delta > 0 && damage >= pokemon.hp)
      return knockOut(table, action.playerId, board, found, action.takerPlayerId, context)
    return {
      table: withBoard(table, action.playerId, replacePokemon(board, { ...pokemon, damage })),
      life: [],
    }
  }

  if (action.kind === "pokemon.switched") {
    if (slot !== "bench") return null
    const bench = board.active
      ? board.bench.map((benched) => (benched.id === pokemon.id ? board.active! : benched))
      : board.bench.filter((benched) => benched.id !== pokemon.id)
    return {
      table: withBoard(table, action.playerId, { ...board, active: pokemon, bench }),
      life: [],
    }
  }

  if (action.kind === "pokemon.removed")
    return { table: withBoard(table, action.playerId, withoutPokemon(board, pokemon.id)), life: [] }

  return knockOut(table, action.playerId, board, found, action.takerPlayerId, context)
}

// why: the board keeps the Pokémon as it stood before the knockout, so undo puts it back with its earlier damage.
function knockOut(
  table: TableState,
  playerId: string,
  board: PokemonBoard,
  { pokemon, slot }: { pokemon: PokemonInPlay; slot: PokemonSlot },
  taker: string | undefined,
  context: TableContext,
): TableChange | null {
  if (taker !== undefined && taker === playerId) return null
  const takerLife = taker === undefined ? undefined : context.lifeOf(taker)
  if (taker !== undefined && takerLife === undefined) return null
  const prizesTaken = Math.min(pokemon.prizes, Math.max(0, takerLife ?? 0))
  const knockout: PokemonKnockout = {
    operationId: context.operationId,
    pokemon,
    slot,
    ...(taker === undefined ? {} : { takerPlayerId: taker }),
    prizesTaken,
  }
  return {
    table: withBoard(table, playerId, {
      ...withoutPokemon(board, pokemon.id),
      lastKnockout: knockout,
    }),
    life: taker !== undefined && prizesTaken > 0 ? [{ playerId: taker, delta: -prizesTaken }] : [],
  }
}

function isValidPokemon(pokemon: PokemonInPlay) {
  return (
    POKEMON_ID.test(pokemon.id) &&
    isValidCard(pokemon) &&
    isWholeNumber(pokemon.damage, 0, MAX_POKEMON_DAMAGE)
  )
}

function isValidBoard(
  board: PokemonBoard,
  owner: string,
  rules: PokemonBoardDefinition,
  playerIds: ReadonlySet<string>,
) {
  const inPlay = [...(board.active ? [board.active] : []), ...board.bench]
  const knockout = board.lastKnockout
  const ids = new Set(inPlay.map(({ id }) => id))
  return (
    board.bench.length <= rules.benchSize &&
    ids.size === inPlay.length &&
    inPlay.every(isValidPokemon) &&
    (knockout === undefined ||
      (OPERATION_ID.test(knockout.operationId) &&
        isValidPokemon(knockout.pokemon) &&
        !ids.has(knockout.pokemon.id) &&
        isWholeNumber(knockout.prizesTaken, 0, knockout.pokemon.prizes) &&
        (knockout.takerPlayerId === undefined
          ? knockout.prizesTaken === 0
          : knockout.takerPlayerId !== owner && playerIds.has(knockout.takerPlayerId))))
  )
}

/** why: a local game handed to a connected one brings its table along, and the server accepts only what its own reducer could have produced. */
export function isValidTableSnapshot(
  table: TableState,
  rules: TableDefinition,
  playerIds: ReadonlySet<string>,
): boolean {
  return (
    Object.entries(table.designations).every(
      ([designationId, holder]) =>
        rules.designations.some(({ id }) => id === designationId) && playerIds.has(holder),
    ) &&
    Object.entries(table.players).every(
      ([playerId, player]) =>
        playerIds.has(playerId) &&
        Object.entries(player.counters ?? {}).every(([counterId, value]) => {
          const counter = rules.counters.find(({ id }) => id === counterId)
          return counter !== undefined && isWholeNumber(value, 0, counter.max)
        }) &&
        (player.pokemon === undefined ||
          (rules.pokemon !== undefined &&
            isValidBoard(player.pokemon, playerId, rules.pokemon, playerIds))),
    )
  )
}

/** why: local seats and connected seats have different ids; every place a table names a seat moves to the new id. */
export function remapTableState(table: TableState, idOf: (playerId: string) => string): TableState {
  return {
    designations: Object.fromEntries(
      Object.entries(table.designations).map(([designationId, holder]) => [
        designationId,
        idOf(holder),
      ]),
    ),
    players: Object.fromEntries(
      Object.entries(table.players).map(([playerId, player]) => {
        const knockout = player.pokemon?.lastKnockout
        return [
          idOf(playerId),
          knockout?.takerPlayerId && player.pokemon
            ? {
                ...player,
                pokemon: {
                  ...player.pokemon,
                  lastKnockout: { ...knockout, takerPlayerId: idOf(knockout.takerPlayerId) },
                },
              }
            : player,
        ]
      }),
    ),
  }
}

/** why: JSON whose key order and absent optional fields do not matter, for comparing replayed payloads. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (isPlainRecord(value))
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`
  return JSON.stringify(value)
}

/** why: a replayed operation must carry the exact action it was first sent with; key order and absent optional fields do not change the identity. */
export function tableActionIdentity(action: TableAction): string {
  return canonicalJson(action)
}

export function tableActionDelta(action: TableAction): number | undefined {
  return action.kind === "counter.changed" || action.kind === "pokemon.damaged"
    ? action.delta
    : undefined
}
