import { createClientId } from "./domain"
import type { TableRules } from "./playSystems"
import {
  applyTableAction,
  pokemonBoardOf,
  type PokemonCard,
  type PokemonKnockout,
  type PokemonSlot,
  type TableAction,
  type TableState,
} from "../../../convex/lib/table"

/** why: what the Undo toast needs after a knockout: whose board, which Pokémon, and the prizes the opponent took. */
export type TableKnockout = PokemonKnockout & { playerId: string }

export interface TableActions {
  adjustCounter: (playerId: string, counterId: string, delta: number) => void
  /** why: taking a designation moves it from whoever held it. */
  takeDesignation: (playerId: string, designationId: string) => void
  releaseDesignation: (playerId: string, designationId: string) => void
  /** why: returns the new Pokémon's id, or null when the slot is taken or the bench is full. */
  placePokemon: (playerId: string, slot: PokemonSlot, card: PokemonCard) => string | null
  /** why: evolving or correcting HP keeps the damage on the Pokémon; returns false when the board refused, e.g. HP at or below that damage. */
  updatePokemon: (playerId: string, pokemonId: string, card: PokemonCard) => boolean
  /** why: damage that brings remaining HP to 0 knocks the Pokémon out instead, and returns the knockout for the Undo toast. */
  adjustPokemonDamage: (
    playerId: string,
    pokemonId: string,
    delta: number,
    takerPlayerId?: string,
  ) => TableKnockout | null
  /** why: retreat or switch; the bench Pokémon becomes Active and the old Active takes its bench spot, each keeping its damage. */
  switchActive: (playerId: string, benchPokemonId: string) => void
  removePokemon: (playerId: string, pokemonId: string) => void
  knockOut: (playerId: string, pokemonId: string, takerPlayerId?: string) => TableKnockout | null
  undoKnockout: (playerId: string, knockoutOperationId: string) => void
}

/** why: both board modes expose this, so table UI takes one runtime and never asks whether the game is local or connected. */
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

/**
 * why: local and connected boards share these commands. Each checks the action against the current table first, so a rejected or no-op tap never reaches storage or the outbox; the mode only supplies how an accepted action is applied or queued.
 */
export function createTableActions(
  read: () => TableSource | null,
  /** why: returns false when the action could not be stored or queued, such as a full offline queue. */
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

  // why: Pokémon is a two-player game, so the one opponent takes the prizes unless the UI names a taker.
  const takerFor = (playerId: string, takerPlayerId: string | undefined) => {
    if (takerPlayerId !== undefined) return takerPlayerId
    const others = read()?.playerIds.filter((id) => id !== playerId) ?? []
    return others.length === 1 ? others[0] : undefined
  }

  // why: the shared reducer decides whether damage is lethal, so the knockout is only reported when this very operation made it.
  const runKnockout = ({
    takerPlayerId,
    ...action
  }: TableAction & { kind: "pokemon.damaged" | "pokemon.knockedOut" }) => {
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
  }
}
