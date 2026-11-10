import {
  applyGameCommand,
  asActorId,
  asDeviceId,
  asGameId,
  asOperationId,
  COMMANDER_SLOTS,
  commanderDamageBetween,
  createLocalGame,
  localOutReason,
  localOutState,
} from "./domain"
import type { PlaySystemId } from "./playSystems"
import type { CommanderSlot, GameCommand, LocalGame } from "./types"
import {
  commanderTotals,
  writeMemoryGame,
  type MemoryGame,
} from "../../../convex/lib/gameEngineMemory"
import {
  commanderField,
  commanderLethalDamage,
  PARTNER_COMMANDER,
} from "../../../convex/lib/gameRules"
import { commanderOutState, outReason } from "../../../convex/lib/outReason"

type Hit =
  { life: number; to: 0 | 1 } | { commander: number; from: 0 | 1; to: 0 | 1; slot?: CommanderSlot }

const DEVICE = "device-table-0001"
const NOW = 1_700_000_000_000

function localAfter(game: LocalGame, hits: readonly Hit[]) {
  let sequence = 0
  const context = {
    actorId: asActorId("table"),
    deviceId: asDeviceId(DEVICE),
    now: () => NOW,
    operationId: () => asOperationId(`local-operation-${++sequence}`),
  }
  const id = (seat: 0 | 1) => game.players[seat].id
  return hits.reduce((state, hit) => {
    const command: GameCommand =
      "life" in hit
        ? { type: "life.change", playerId: id(hit.to), delta: hit.life }
        : {
            type: "commanderDamage.assign",
            fromPlayerId: id(hit.from),
            toPlayerId: id(hit.to),
            ...commanderField(hit.slot),
            delta: hit.commander,
          }
    return applyGameCommand(state, command, context)
  }, game)
}

function memoryAfter(game: LocalGame, hits: readonly Hit[]) {
  const memory: MemoryGame = {
    status: "active",
    system: game.system,
    format: game.format,
    designations: {},
    lifeEditing: "anyone",
    seats: new Map(game.players.map(({ id, life }) => [id, { id, currentLife: life }])),
    events: new Map(),
    claims: new Map(),
    pairs: new Map(),
  }
  const id = (seat: 0 | 1) => game.players[seat].id
  hits.forEach((hit, index) => {
    const write = {
      operationId: `memory-operation-${String(index).padStart(4, "0")}`,
      deviceId: DEVICE,
      clientCreatedAt: NOW,
    }
    const result = writeMemoryGame(
      memory,
      { userId: "table", isHost: true },
      "life" in hit
        ? { kind: "life", playerId: id(hit.to), delta: hit.life, ...write }
        : {
            kind: "commander.claim",
            fromPlayerId: id(hit.from),
            toPlayerId: id(hit.to),
            ...commanderField(hit.slot),
            delta: hit.commander,
            ...write,
          },
      NOW,
    )
    expect(result).toMatchObject({ ok: true })
  })
  return memory
}

const commander = { system: "mtg", format: "commander", startingLife: 40 } as const

describe("local rules match the nearby engine", () => {
  it.each<{
    name: string
    system: PlaySystemId
    format?: string
    startingLife: number
    hits: Hit[]
    out?: 0 | 1
  }>([
    { name: "life -3", ...commander, hits: [{ life: -3, to: 0 }] },
    {
      name: "Yu-Gi-Oh! Life Points stop at 0",
      system: "ygo",
      startingLife: 8000,
      hits: [
        { life: -8500, to: 0 },
        { life: -1000, to: 0 },
      ],
    },
    {
      name: "21 commander damage is lethal",
      ...commander,
      hits: [
        { commander: 15, from: 0, to: 1 },
        { commander: 6, from: 0, to: 1 },
      ],
      out: 1,
    },
    {
      name: "a partner's damage stays apart from the first commander's",
      ...commander,
      hits: [
        { commander: 12, from: 0, to: 1 },
        { commander: 12, from: 0, to: 1, slot: PARTNER_COMMANDER },
      ],
    },
    {
      name: "commander damage keeps adding up past 99",
      ...commander,
      hits: [
        { commander: 97, from: 0, to: 1 },
        { commander: 5, from: 0, to: 1 },
      ],
      out: 1,
    },
    {
      name: "a negative correction gives the life back",
      ...commander,
      hits: [
        { commander: 5, from: 1, to: 0 },
        { commander: -2, from: 1, to: 0 },
        { life: -4, to: 1 },
        { life: 1, to: 1 },
      ],
    },
  ])("$name", ({ system, format, startingLife, hits, out }) => {
    const start = createLocalGame({
      gameId: asGameId("parity-game"),
      now: NOW,
      system,
      format,
      startingLife,
      players: [
        { name: "Alex", color: "#7C3AED" },
        { name: "Blair", color: "#2563EB" },
      ],
    })
    const local = localAfter(start, hits)
    const memory = memoryAfter(start, hits)
    const pairs = start.players.flatMap((from) =>
      start.players
        .filter((to) => to.id !== from.id)
        .flatMap((to) => COMMANDER_SLOTS.map((slot) => ({ from: from.id, to: to.id, slot }))),
    )
    const totals = commanderTotals(memory)

    expect(local.players.map(({ life }) => life)).toEqual(
      [...memory.seats.values()].map(({ currentLife }) => currentLife),
    )
    expect(
      pairs.map(({ from, to, slot }) => commanderDamageBetween(local, from, to, slot)),
    ).toEqual(
      pairs.map(
        ({ from, to, slot }) =>
          totals.find(
            (pair) =>
              pair.fromPlayerId === from && pair.toPlayerId === to && pair.commander === slot,
          )?.total ?? 0,
      ),
    )
    const memoryOut = {
      ...localOutState(local),
      lives: [...memory.seats.values()].map(({ id, currentLife }) => ({
        playerId: id,
        life: currentLife,
      })),
      commanderDamage: commanderOutState(
        commanderLethalDamage(memory.system, memory.format),
        totals,
      ),
    }
    const reasons = local.players.map(({ id }) => outReason(memoryOut, id)?.cause)
    expect(local.players.map(({ id }) => localOutReason(local, id)?.cause)).toEqual(reasons)
    if (out !== undefined) expect(reasons[out]).toBe("commanderDamage")
  })
})
