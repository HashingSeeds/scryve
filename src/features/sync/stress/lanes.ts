import type { ConvexReactClient } from "convex/react"
import { makeFunctionReference } from "convex/server"

import type {
  ConnectedProjection,
  FailedLifeAction,
  PendingLifeAction,
} from "@/features/connected/model"
import * as currentConnected from "@/features/connected/persistence"
import * as currentMetadata from "@/features/decks/decksSyncWrites"
import type { FailedDeckWrite, PendingDeckWrite } from "@/features/decks/decksSyncWrites"
import * as currentVersions from "@/features/decks/decksVersionWrites"
import type { FailedVersionWrite, PendingVersionWrite } from "@/features/decks/decksVersionWrites"
import { asActorId, asDeviceId, asGameId, asOperationId, asPlayerId } from "@/features/game/domain"
import {
  DURABLE_OUTBOX_LIMITS,
  type DurableOutboxLimits,
  type DurableStringStorage,
} from "@/features/sync/durableOutbox"

import * as mainMetadata from "./legacy/main/decksSyncWrites"
import * as mainVersions from "./legacy/main/decksVersionWrites"
import * as mainConnected from "./legacy/main/persistence"
import * as v011Metadata from "./legacy/v0_1_1/decksSyncWrites"
import * as v011Versions from "./legacy/v0_1_1/decksVersionWrites"
import * as v011Connected from "./legacy/v0_1_1/persistence"
import type { Random } from "./storage"

export const OWNER = "stress-owner"
export const DEPLOYMENT = "stress.convex.cloud"

export type BuildName = "branch" | "main" | "v0.1.1"
export type LaneName = "connected" | "deckMetadata" | "deckVersions"

export interface ServerIds {
  publicId: string
  playerIds: [string, string]
  deckId: string
  versionId: string
}

export const FAKE_IDS: ServerIds = {
  publicId: "public-game-id-123456",
  playerIds: ["player-one-id", "player-two-id"],
  deckId: "stress-deck-id",
  versionId: "stress-version-id",
}

type Client = Pick<ConvexReactClient, "mutation">

// why: method syntax keeps these bivariant, so typed lanes share one `Lane` list while values only ever flow from a lane back into itself.
export interface LaneRepo<Pending = unknown, Failed = unknown> {
  enqueue(action: Pending, current?: readonly Pending[]): boolean
  pending(): Pending[]
  failed(): Failed[]
  ack(operationId: string): void
  attempt(operationId: string, at: number): void
  fail(
    action: Pending,
    reason: string,
    at: number,
    failed: readonly Failed[],
    pending: readonly Pending[],
  ): boolean
  dismiss(operationId: string): void
  /** why: lane-specific write that skips the kernel: connected cleanup (settles everything) or version rebase. */
  extra?: { settlesAll: boolean; run(random: Random, pending: readonly Pending[]): void }
}

export interface Lane<Pending = unknown, Failed = unknown> {
  name: LaneName
  limits: DurableOutboxLimits
  pendingPrefix: string
  failedPrefix: string
  operationId(action: Pending): string
  failedOperationId(failure: Failed): string
  makeAction(random: Random, at: number, ids: ServerIds): Pending
  open(storage: DurableStringStorage, build?: BuildName): LaneRepo<Pending, Failed>
  /** why: drains every pending record through the build's real send code, so callers can prove each queued record reached a validator. */
  send(
    storage: DurableStringStorage,
    client: Client,
    ids: ServerIds,
    build?: BuildName,
  ): Promise<SendResult>
}

export interface SendResult {
  queued: number
  remaining: number
  /** why: `mirror` means the build exports no connected sender, so the harness used its copy of the app closure. */
  sender: "app" | "mirror" | "controller"
}

const uuid = (random: Random) => {
  const hex = () => random.int(16).toString(16)
  const run = (length: number) => Array.from({ length }, hex).join("")
  return `${run(8)}-${run(4)}-4${run(3)}-8${run(3)}-${run(12)}`
}

// why: tests can't wait on the controller's internal drain promise, so they yield until the queue stops moving; callers fail on whatever is left.
async function settle(pending: () => number): Promise<number> {
  let last = -1
  for (let idle = 0; idle < 200;) {
    await new Promise((resolve) => setImmediate(resolve))
    const now = pending()
    idle = now === last ? idle + 1 : 0
    last = now
    if (now === 0) return 0
  }
  return last
}

const CONNECTED_MUTATIONS = {
  changeLife: "games:changeLife",
  submitCommanderDamage: "games:submitCommanderDamage",
  confirmCommanderDamage: "games:confirmCommanderDamage",
  declineCommanderDamage: "games:declineCommanderDamage",
} as const

// why: the app's connected sender lives in a hook module and only some branches export it, so it is looked up at runtime.
async function appConnectedSender() {
  const module = await import("@/features/connected/useConnectedGame")
  const sender: unknown = Reflect.get(module, "sendQueuedAction")
  if (typeof sender !== "function") return undefined
  return (client: Client, publicId: string, action: PendingLifeAction): Promise<unknown> => {
    const mutations = Object.fromEntries(
      Object.entries(CONNECTED_MUTATIONS).map(([key, name]) => [
        key,
        (args: Record<string, unknown>) =>
          client.mutation(makeFunctionReference<"mutation">(name), args),
      ]),
    )
    const sent: unknown = Reflect.apply(sender, undefined, [mutations, publicId, action])
    return Promise.resolve(sent)
  }
}

const connectedBuilds = {
  "branch": currentConnected.ConnectedGameRepository,
  "main": mainConnected.ConnectedGameRepository,
  "v0.1.1": v011Connected.ConnectedGameRepository,
}

interface ConnectedLike {
  enqueue(action: PendingLifeAction, current?: readonly PendingLifeAction[]): { accepted: boolean }
  loadOutbox(gameId: string): PendingLifeAction[]
  loadFailed(gameId: string): FailedLifeAction[]
  acknowledge(gameId: string, operationId: string): void
  updateAttempt(gameId: string, operationId: string, at: number): unknown
  failAction(
    action: PendingLifeAction,
    reason: string,
    at: number,
    failed: readonly FailedLifeAction[],
    pending: readonly PendingLifeAction[],
  ): { accepted: boolean }
  dismissFailed(gameId: string, operationId: string): void
  cleanupTerminalGame(
    projection: ConnectedProjection,
    pending: readonly PendingLifeAction[],
    failed: readonly FailedLifeAction[],
  ): boolean
}

const finishedProjection = (publicId: string): ConnectedProjection => ({
  schemaVersion: 1,
  publicId,
  status: "finished",
  playerCount: 2,
  startingLife: 40,
  ruleset: "commander",
  isHost: true,
  eventSequence: 0,
  serverUpdatedAt: 0,
  recentOperationIds: [],
  players: [],
})

/** why: mirrors the send closure in useConnectedGame.ts; keep in sync with it. */
export function connectedMutation(publicId: string, action: PendingLifeAction) {
  const { event } = action
  if (event.type === "life.changed")
    return {
      name: "games:changeLife",
      args: {
        publicId,
        playerId: event.playerId,
        operationId: event.operationId,
        delta: event.delta,
        deviceId: event.deviceId,
        clientCreatedAt: event.clientCreatedAt,
      },
    }
  if (event.type === "commanderDamage.submitted")
    return {
      name: "games:submitCommanderDamage",
      args: {
        publicId,
        fromPlayerId: event.fromPlayerId,
        toPlayerId: event.toPlayerId,
        operationId: event.operationId,
        delta: event.delta,
        deviceId: event.deviceId,
        clientCreatedAt: event.clientCreatedAt,
      },
    }
  return {
    name: event.accepted ? "games:confirmCommanderDamage" : "games:declineCommanderDamage",
    args: {
      publicId,
      operationId: event.claimOperationId,
      resolutionOperationId: event.operationId,
      deviceId: event.deviceId,
      clientCreatedAt: event.clientCreatedAt,
    },
  }
}

export const connectedLane: Lane<PendingLifeAction, FailedLifeAction> = {
  name: "connected",
  limits: DURABLE_OUTBOX_LIMITS,
  pendingPrefix: currentConnected.CONNECTED_KEYS.outboxRecord(FAKE_IDS.publicId, "", OWNER),
  failedPrefix: currentConnected.CONNECTED_KEYS.failedRecord(FAKE_IDS.publicId, "", OWNER),
  operationId: (action) => action.event.operationId,
  failedOperationId: (failure) => failure.action.event.operationId,
  makeAction(random, at, ids) {
    const base = {
      operationId: asOperationId(random.id(24)),
      gameId: asGameId(ids.publicId),
      actorId: asActorId(OWNER),
      deviceId: asDeviceId("device-host-0001"),
      clientCreatedAt: at,
    }
    const roll = random.next()
    const [first, second] = ids.playerIds
    const event: PendingLifeAction["event"] =
      roll < 0.7
        ? {
            ...base,
            type: "life.changed",
            playerId: asPlayerId(random.pick(ids.playerIds) ?? first),
            delta: (random.int(9) + 1) * (random.next() < 0.5 ? -1 : 1),
          }
        : roll < 0.9
          ? {
              ...base,
              type: "commanderDamage.submitted",
              fromPlayerId: asPlayerId(first),
              toPlayerId: asPlayerId(second),
              delta: random.int(5) + 1,
            }
          : {
              ...base,
              type: "commanderDamage.resolved",
              claimOperationId: asOperationId(random.id(24)),
              toPlayerId: asPlayerId(first),
              accepted: random.next() < 0.5,
            }
    return { schemaVersion: 1, event, queuedAt: at, attempts: 0 }
  },
  open(storage, build = "branch") {
    const repo: ConnectedLike = new connectedBuilds[build](storage, OWNER, {}, DEPLOYMENT)
    const game = FAKE_IDS.publicId
    return {
      enqueue: (action, current) => repo.enqueue(action, current).accepted,
      pending: () => repo.loadOutbox(game),
      failed: () => repo.loadFailed(game),
      ack: (operationId) => repo.acknowledge(game, operationId),
      attempt: (operationId, at) => void repo.updateAttempt(game, operationId, at),
      fail: (action, reason, at, failed, pending) =>
        repo.failAction(action, reason, at, failed, pending).accepted,
      dismiss: (operationId) => repo.dismissFailed(game, operationId),
      // why: a finished game is cleaned once its queue settles; the app acks or dismisses everything first.
      extra: {
        settlesAll: true,
        run(_random, pending) {
          for (const action of pending) repo.acknowledge(game, action.event.operationId)
          for (const failure of repo.loadFailed(game))
            repo.dismissFailed(game, failure.action.event.operationId)
          repo.cleanupTerminalGame(finishedProjection(game), [], [])
        },
      },
    }
  },
  async send(storage, client, ids, build = "branch") {
    const repo = connectedLane.open(storage, build)
    const queued = repo.pending()
    const app = build === "branch" ? await appConnectedSender() : undefined
    for (const action of queued) {
      const { name, args } = connectedMutation(ids.publicId, action)
      const sending = app
        ? app(client, ids.publicId, action)
        : client.mutation(makeFunctionReference<"mutation">(name), args)
      const sent = await sending.then(
        () => true,
        () => false,
      )
      if (sent) repo.ack(connectedLane.operationId(action))
    }
    return {
      queued: queued.length,
      remaining: repo.pending().length,
      sender: app ? "app" : "mirror",
    }
  },
}

interface DeckLike<Pending, Failed> {
  enqueue(action: Pending, current?: readonly Pending[]): { accepted: boolean }
  loadPending(): Pending[]
  loadFailed(): Failed[]
  acknowledge(operationId: string): void
  updateAttempt(operationId: string, at: number): unknown
  failAction(
    action: Pending,
    reason: string,
    at: number,
    failed: readonly Failed[],
    pending: readonly Pending[],
  ): { accepted: boolean }
  dismissFailed(operationId: string): void
}

function deckRepo<Pending, Failed>(repo: DeckLike<Pending, Failed>): LaneRepo<Pending, Failed> {
  return {
    enqueue: (action, current) => repo.enqueue(action, current).accepted,
    pending: () => repo.loadPending(),
    failed: () => repo.loadFailed(),
    ack: (operationId) => repo.acknowledge(operationId),
    attempt: (operationId, at) => void repo.updateAttempt(operationId, at),
    fail: (action, reason, at, failed, current) =>
      repo.failAction(action, reason, at, failed, current).accepted,
    dismiss: (operationId) => repo.dismissFailed(operationId),
  }
}

interface Startable {
  start(): () => void
}

// why: each build's controller only accepts its own repository class, so every build gets its own typed pair instead of a union.
function deckBuild<Repo extends DeckLike<unknown, unknown>>(
  Repository: new (ownerId: string, storage: DurableStringStorage) => Repo,
  Controller: new (client: Client, repository: Repo) => Startable,
) {
  return {
    open: (storage: DurableStringStorage) => new Repository(OWNER, storage),
    async send(storage: DurableStringStorage, client: Client): Promise<SendResult> {
      const repo = new Repository(OWNER, storage)
      const queued = repo.loadPending().length
      const stop = new Controller(client, repo).start()
      const remaining = await settle(() => repo.loadPending().length)
      stop()
      return { queued, remaining, sender: "controller" }
    },
  }
}

const metadataBuilds = {
  "branch": deckBuild(
    currentMetadata.DeckSyncWriteRepository,
    currentMetadata.DeckMetadataWriteController,
  ),
  "main": deckBuild(mainMetadata.DeckSyncWriteRepository, mainMetadata.DeckMetadataWriteController),
  "v0.1.1": deckBuild(
    v011Metadata.DeckSyncWriteRepository,
    v011Metadata.DeckMetadataWriteController,
  ),
}

const versionBuilds = {
  "branch": deckBuild(
    currentVersions.DeckVersionWriteRepository,
    currentVersions.DeckVersionWriteController,
  ),
  "main": deckBuild(
    mainVersions.DeckVersionWriteRepository,
    mainVersions.DeckVersionWriteController,
  ),
  "v0.1.1": deckBuild(
    v011Versions.DeckVersionWriteRepository,
    v011Versions.DeckVersionWriteController,
  ),
}

const sentinel = (random: Random, label: string) => `SENTINEL-${label}-${random.id(10)}`

export const metadataLane: Lane<PendingDeckWrite, FailedDeckWrite> = {
  name: "deckMetadata",
  limits: DURABLE_OUTBOX_LIMITS,
  pendingPrefix: `scryve.decks.pendingRecord.v1.${OWNER}.`,
  failedPrefix: `scryve.decks.failedRecord.v1.${OWNER}.`,
  operationId: (action) => action.operationId,
  failedOperationId: (failure) => failure.action.operationId,
  makeAction: (random, at, ids) => ({
    schemaVersion: 1,
    ownerId: OWNER,
    deckId: ids.deckId as PendingDeckWrite["deckId"],
    id: uuid(random),
    operationId: uuid(random),
    expectedRevision: 0,
    name: sentinel(random, "name"),
    format: "commander",
    game: "mtg",
    note: sentinel(random, "note"),
    deleted: false,
    queuedAt: at,
    attempts: 0,
  }),
  open: (storage, build = "branch") =>
    deckRepo<PendingDeckWrite, FailedDeckWrite>(metadataBuilds[build].open(storage)),
  send: (storage, client, _ids, build = "branch") => metadataBuilds[build].send(storage, client),
}

const VERSION_LIMITS: DurableOutboxLimits = {
  ...DURABLE_OUTBOX_LIMITS,
  maxPendingBytes: 512 * 1024,
  maxFailedBytes: 512 * 1024,
}

const versionOps = ["cards", "cards", "create", "rename", "delete"] as const

export const versionsLane: Lane<PendingVersionWrite, FailedVersionWrite> = {
  name: "deckVersions",
  limits: VERSION_LIMITS,
  pendingPrefix: `scryve.decks.pendingVersionRecord.v1.${OWNER}.`,
  failedPrefix: `scryve.decks.failedVersionRecord.v1.${OWNER}.`,
  operationId: (action) => action.operationId,
  failedOperationId: (failure) => failure.action.operationId,
  makeAction(random, at, ids) {
    const op = random.pick(versionOps) ?? "cards"
    const withCards = op === "cards" || op === "create"
    const cards = Array.from({ length: withCards ? random.int(4) + 1 : 0 }, () => ({
      name: sentinel(random, "card"),
      quantity: random.int(3) + 1,
    }))
    const action: PendingVersionWrite = {
      schemaVersion: 1,
      ownerId: OWNER,
      deckId: ids.deckId as PendingVersionWrite["deckId"],
      versionId: ids.versionId as PendingVersionWrite["versionId"],
      operationId: uuid(random),
      expectedRevision: op === "create" ? 1 : random.int(3) + 1,
      cards,
      queuedAt: at,
      attempts: 0,
    }
    if (op !== "cards") action.op = op
    if (op === "create" || op === "rename") action.name = sentinel(random, "version")
    if (op === "rename") action.note = sentinel(random, "note")
    return action
  },
  open(storage, build = "branch") {
    const repo = versionBuilds[build].open(storage)
    return {
      ...deckRepo<PendingVersionWrite, FailedVersionWrite>(repo),
      extra: {
        settlesAll: false,
        run(random, pending) {
          const target = random.pick(pending)
          if (target) repo.rebasePending(target.versionId, random.int(4) + 1)
        },
      },
    }
  },
  send: (storage, client, _ids, build = "branch") => versionBuilds[build].send(storage, client),
}

export const LANES: readonly Lane[] = [connectedLane, metadataLane, versionsLane]
