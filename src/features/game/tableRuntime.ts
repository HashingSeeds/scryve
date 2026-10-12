import { createClientId } from "./domain"
import type { TableRules } from "./playSystems"
import {
  applyTableAction,
  pokemonBoardOf,
  type Coin,
  type PokemonCard,
  type PokemonCondition,
  type PokemonKnockout,
  type PokemonSlot,
  type TableAction,
  type TableState,
} from "../../../convex/lib/table"

export type TableKnockout = PokemonKnockout & { playerId: string }

export interface TableActions {
  adjustCounter: (playerId: string, counterId: string, delta: number) => void
  takeDesignation: (playerId: string, designationId: string) => void
  releaseDesignation: (playerId: string, designationId: string) => void
  placePokemon: (playerId: string, slot: PokemonSlot, card: PokemonCard) => string | null
  updatePokemon: (playerId: string, pokemonId: string, card: PokemonCard) => boolean
  adjustPokemonDamage: (
    playerId: string,
    pokemonId: string,
    delta: number,
    takerPlayerId?: string,
  ) => TableKnockout | null
  switchActive: (playerId: string, benchPokemonId: string) => void
  removePokemon: (playerId: string, pokemonId: string) => void
  knockOut: (playerId: string, pokemonId: string, takerPlayerId?: string) => TableKnockout | null
  undoKnockout: (playerId: string, knockoutOperationId: string) => void
  setPokemonCondition: (
    playerId: string,
    pokemonId: string,
    condition: PokemonCondition,
    on: boolean,
  ) => void
  checkupPokemon: (
    playerId: string,
    pokemonId: string,
    coin?: Coin,
    takerPlayerId?: string,
  ) => TableKnockout | null
}

export interface TableRuntime extends TableActions {
  table: TableState
  tableRules: TableRules
}

export interface TableSource {
  table: TableState
  rules: TableRules
  playerIds: readonly string[]
  lifeOf: (playerId: string) => number | undefined
  canAct: (playerId: string) => boolean
}

export function createTableActions(
  read: () => TableSource | null,
  submit: (action: TableAction, operationId: string) => boolean,
  newOperationId: () => string = () => createClientId("operation"),
): TableActions {
  const run = (action: TableAction) => {
    const source = read()
    if (!source?.canAct(action.playerId)) return null
    const operationId = newOperationId()
    const change = applyTableAction(source.table, action, {
      rules: source.rules,
      operationId,
      lifeOf: source.lifeOf,
    })
    if (!change || change.table === source.table) return null
    return submit(action, operationId) ? { change, operationId } : null
  }

  const takerFor = (playerId: string, takerPlayerId: string | undefined) => {
    if (takerPlayerId !== undefined) return takerPlayerId
    const others = read()?.playerIds.filter((id) => id !== playerId) ?? []
    return others.length === 1 ? others[0] : undefined
  }

  const runKnockout = ({
    takerPlayerId,
    ...action
  }: TableAction & { kind: "pokemon.damaged" | "pokemon.knockedOut" | "pokemon.checkedUp" }) => {
    const taker = takerFor(action.playerId, takerPlayerId)
    const result = run({ ...action, ...(taker === undefined ? {} : { takerPlayerId: taker }) })
    if (!result) return null
    const knockout = pokemonBoardOf(result.change.table, action.playerId).lastKnockout
    return knockout?.operationId === result.operationId
      ? { ...knockout, playerId: action.playerId }
      : null
  }

  return {
    adjustCounter: (playerId, counterId, delta) => {
      run({ kind: "counter.changed", playerId, counterId, delta })
    },
    takeDesignation: (playerId, designationId) => {
      run({ kind: "designation.taken", playerId, designationId })
    },
    releaseDesignation: (playerId, designationId) => {
      run({ kind: "designation.released", playerId, designationId })
    },
    placePokemon: (playerId, slot, card) => {
      const pokemonId = createClientId("pokemon")
      return run({ kind: "pokemon.placed", playerId, pokemonId, slot, card }) ? pokemonId : null
    },
    updatePokemon: (playerId, pokemonId, card) =>
      run({ kind: "pokemon.updated", playerId, pokemonId, card }) !== null,
    adjustPokemonDamage: (playerId, pokemonId, delta, takerPlayerId) =>
      runKnockout({ kind: "pokemon.damaged", playerId, pokemonId, delta, takerPlayerId }),
    switchActive: (playerId, benchPokemonId) => {
      run({ kind: "pokemon.switched", playerId, pokemonId: benchPokemonId })
    },
    removePokemon: (playerId, pokemonId) => {
      run({ kind: "pokemon.removed", playerId, pokemonId })
    },
    knockOut: (playerId, pokemonId, takerPlayerId) =>
      runKnockout({ kind: "pokemon.knockedOut", playerId, pokemonId, takerPlayerId }),
    undoKnockout: (playerId, knockoutOperationId) => {
      run({ kind: "pokemon.knockoutUndone", playerId, knockoutOperationId })
    },
    setPokemonCondition: (playerId, pokemonId, condition, on) => {
      run({ kind: "pokemon.conditionChanged", playerId, pokemonId, condition, on })
    },
    checkupPokemon: (playerId, pokemonId, coin, takerPlayerId) =>
      runKnockout({
        kind: "pokemon.checkedUp",
        playerId,
        pokemonId,
        ...(coin === undefined ? {} : { coin }),
        takerPlayerId,
      }),
  }
}
