import { useMemo, useSyncExternalStore } from "react"
import { randomUUID } from "expo-crypto"
import { useConvex, type ConvexReactClient } from "convex/react"

import { scopedOwnerId } from "@/features/decks/decksSync"
import { drainOutbox } from "@/features/sync/drainOutbox"
import {
  DurableOutbox,
  type DurableFailedRecord,
  type DurableOutboxCodec,
  type DurablePendingRecord,
  type DurableStringStorage,
} from "@/features/sync/durableOutbox"
import { createOutboxController, type OutboxController } from "@/features/sync/outboxController"
import { translate } from "@/i18n/translate"
import {
  convexErrorCode,
  convexErrorMessage,
  convexRetryAfterMs,
  isArgumentValidationError,
} from "@/utils/convexError"
import { storage } from "@/utils/storage"

import { loadFeedbackKey } from "./feedbackKey"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

type Kind = "feature" | "bug"

export type FeedbackSend =
  | {
      type: "submit"
      kind: Kind
      title: string
      body: string
      includeAccount: boolean
      accountId?: string
      appVersion?: string
      platform?: string
      sentryEventId?: string
    }
  | { type: "reply"; requestId: string; body: string }

export type PendingFeedbackSend = FeedbackSend &
  DurablePendingRecord & { schemaVersion: 1; operationId: string }

export interface FailedFeedbackSend extends DurableFailedRecord<PendingFeedbackSend> {
  schemaVersion: 1
}

export interface FeedbackOutboxSnapshot {
  pending: PendingFeedbackSend[]
  failures: FailedFeedbackSend[]
}

const OWNER = "install"
const SCOPE = "sends"
const RETRY_DELAY_MS = 2_000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const optionalString = (value: unknown) => value === undefined || typeof value === "string"

function parsePending(value: unknown): PendingFeedbackSend | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.operationId !== "string" ||
    typeof value.body !== "string" ||
    typeof value.queuedAt !== "number" ||
    typeof value.attempts !== "number" ||
    (value.lastAttemptAt !== undefined && typeof value.lastAttemptAt !== "number")
  )
    return null
  if (value.type === "reply" && typeof value.requestId === "string")
    return value as unknown as PendingFeedbackSend
  if (
    value.type === "submit" &&
    (value.kind === "feature" || value.kind === "bug") &&
    typeof value.title === "string" &&
    typeof value.includeAccount === "boolean" &&
    optionalString(value.accountId) &&
    optionalString(value.appVersion) &&
    optionalString(value.platform) &&
    optionalString(value.sentryEventId)
  )
    return value as unknown as PendingFeedbackSend
  return null
}

function parseFailed(value: unknown): FailedFeedbackSend | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.reason !== "string" ||
    typeof value.failedAt !== "number"
  )
    return null
  const action = parsePending(value.action)
  return action
    ? { schemaVersion: 1, action, reason: value.reason, failedAt: value.failedAt }
    : null
}

const codec: DurableOutboxCodec<PendingFeedbackSend, FailedFeedbackSend> = {
  parsePending,
  parseFailed,
  createFailure: (action, reason, failedAt) => ({ schemaVersion: 1, action, reason, failedAt }),
  operationId: (action) => action.operationId,
  belongsToScope: (_action, ownerId, scope) => ownerId === OWNER && scope === SCOPE,
  operationTypes: ["submit", "reply"],
  knownKeys: [
    "operationId",
    "type",
    "kind",
    "title",
    "body",
    "includeAccount",
    "accountId",
    "appVersion",
    "platform",
    "sentryEventId",
    "requestId",
  ],
}

class AccountChanged extends Error {}

type Waiter = { resolve: (requestId: string | null) => void; reject: (cause: unknown) => void }

// why: a send made offline or just before the app is killed must still go out; its operation id is the clientId, so one delivered by both this and Convex's own queue lands once.
export class FeedbackOutbox {
  private readonly store: DurableOutbox<PendingFeedbackSend, FailedFeedbackSend>
  private readonly controller: OutboxController<
    FeedbackOutboxSnapshot & { capacityBlocked: boolean }
  >
  private readonly waiters = new Map<string, Waiter>()
  private readonly results = new Map<string, string | null>()
  private readonly causes = new Map<string, unknown>()
  private sending: string | undefined
  private retryAfterMs = 0
  private ready = false
  private account: string | undefined

  constructor(
    private readonly client: Pick<ConvexReactClient, "mutation">,
    deploymentUrl: string | undefined,
    local: DurableStringStorage = storage,
    private readonly loadKey: () => Promise<string> = loadFeedbackKey,
    private readonly now: () => number = Date.now,
  ) {
    const owner = (name: string) =>
      `scryve.feedback.${name}.v1.${scopedOwnerId(OWNER, deploymentUrl)}`
    this.store = new DurableOutbox(
      local,
      OWNER,
      {
        pendingIndex: () => owner("pending"),
        pendingRecord: (_scope, operationId) => `${owner("pendingRecord")}.${operationId}`,
        failedIndex: () => owner("failed"),
        failedRecord: (_scope, operationId) => `${owner("failedRecord")}.${operationId}`,
      },
      codec,
    )
    this.controller = createOutboxController({
      snapshot: ({ capacityBlocked }) => ({
        pending: this.store.loadPending(SCOPE),
        failures: this.store.loadFailed(SCOPE),
        capacityBlocked,
      }),
      drain: (shouldContinue) => this.drainOnce(shouldContinue),
      retryDelay: (result) => {
        const backoff = Math.min(
          60_000,
          RETRY_DELAY_MS * 2 ** Math.min(result.pending[0]?.attempts ?? 0, 5),
        )
        const delay = Math.max(backoff, this.retryAfterMs)
        this.retryAfterMs = 0
        return delay
      },
      canDrain: () => this.ready,
      hasPending: () => this.store.loadPending(SCOPE).length > 0,
      onResult: (result) => {
        for (const operationId of result.failed) {
          const waiter = this.waiters.get(operationId)
          if (!waiter) continue
          // why: a screen is waiting on this send and shows the error with the draft, so the failure isn't kept twice.
          this.store.dismissFailed(SCOPE, operationId)
          this.waiters.delete(operationId)
          waiter.reject(this.causes.get(operationId))
        }
        this.causes.clear()
        this.controller.publish()
      },
    })
  }

  get subscribe() {
    return this.controller.subscribe
  }

  get getSnapshot() {
    return this.controller.getSnapshot
  }

  start() {
    return this.controller.start()
  }

  // why: a send with the account made before auth settles would be refused as signed out.
  setReady(ready: boolean, account?: string) {
    this.ready = ready
    this.account = account
    if (ready) void this.controller.drain()
  }

  enqueue(send: FeedbackSend) {
    const operationId = randomUUID()
    const owned =
      send.type === "submit" && send.includeAccount && this.account
        ? { ...send, accountId: this.account }
        : send
    const result = this.store.enqueue(
      { ...owned, schemaVersion: 1, operationId, queuedAt: this.now(), attempts: 0 },
      SCOPE,
    )
    if (!result.accepted) throw new Error("Too much feedback is waiting to send. Reconnect first.")
    this.controller.publish()
    void this.controller.drain()
    return operationId
  }

  waitFor(operationId: string, timeoutMs: number) {
    if (this.results.has(operationId)) return Promise.resolve(this.results.get(operationId))
    return new Promise<string | null | undefined>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(operationId)
        resolve(undefined)
      }, timeoutMs)
      this.waiters.set(operationId, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (cause) => {
          clearTimeout(timer)
          reject(cause)
        },
      })
    })
  }

  discard(operationId: string) {
    this.store.dismissFailed(SCOPE, operationId)
    this.store.acknowledge(SCOPE, operationId)
    this.resume()
  }

  clear() {
    const { pending, failures } = this.controller.getSnapshot()
    for (const action of pending) this.store.acknowledge(SCOPE, action.operationId)
    for (const failure of failures) this.store.dismissFailed(SCOPE, failure.action.operationId)
    this.resume()
  }

  // why: a full failure list stops the queue; freeing room must restart it without an app restart.
  private resume() {
    this.controller.unblock()
    this.controller.publish()
    void this.controller.drain()
  }

  private async send(action: PendingFeedbackSend) {
    const key = await this.loadKey()
    if (action.type === "reply")
      return await this.client
        .mutation(api.feedback.reply, {
          key,
          // why: the id came from the server and only round-tripped through MMKV.
          requestId: action.requestId as Id<"feedbackRequests">,
          body: action.body,
          clientId: action.operationId,
        })
        .then(() => null)
    if (action.includeAccount && action.accountId !== this.account) throw new AccountChanged()
    return await this.client.mutation(api.feedback.submit, {
      key,
      kind: action.kind,
      title: action.title,
      body: action.body,
      includeAccount: action.includeAccount,
      clientId: action.operationId,
      ...(action.appVersion ? { appVersion: action.appVersion } : {}),
      ...(action.platform ? { platform: action.platform } : {}),
      ...(action.sentryEventId ? { sentryEventId: action.sentryEventId } : {}),
    })
  }

  private classify(cause: unknown) {
    const code = convexErrorCode(cause)
    const operationId = this.sending
    if (operationId) this.causes.set(operationId, cause)
    if (cause instanceof AccountChanged)
      return { kind: "reject", reason: translate("feedback:mine.otherAccount") } as const
    if (code === "rate_limited" && !(operationId && this.waiters.has(operationId))) {
      this.retryAfterMs = convexRetryAfterMs(cause) ?? 60_000
      return { kind: "retry" } as const
    }
    if (code !== undefined || isArgumentValidationError(cause))
      return { kind: "reject", reason: convexErrorMessage(cause, "Feedback was refused") } as const
    return { kind: "retry" } as const
  }

  private drainOnce(shouldContinue: () => boolean) {
    return drainOutbox<PendingFeedbackSend, FailedFeedbackSend>({
      repository: {
        loadPending: () => this.store.loadPending(SCOPE),
        updateAttempt: (operationId, attemptedAt) =>
          this.store.updateAttempt(SCOPE, operationId, attemptedAt),
        acknowledge: (operationId) => this.store.acknowledge(SCOPE, operationId),
        failAction: (action, reason, failedAt, currentFailed, currentPending) =>
          this.store.failAction(action, SCOPE, reason, failedAt, currentFailed, currentPending),
      },
      send: async (action) => {
        this.sending = action.operationId
        this.results.set(action.operationId, await this.send(action))
        return { operationId: action.operationId }
      },
      operationId: (action) => action.operationId,
      classifyFailure: (cause) => this.classify(cause),
      now: this.now,
      failed: this.store.loadFailed(SCOPE),
      onAcknowledged: (action) => {
        const waiter = this.waiters.get(action.operationId)
        this.waiters.delete(action.operationId)
        waiter?.resolve(this.results.get(action.operationId) ?? null)
      },
      onChange: () => this.controller.publish(),
      shouldContinue,
    })
  }
}

const outboxes = new WeakMap<object, FeedbackOutbox>()

export function feedbackOutbox(client: ConvexReactClient) {
  let outbox = outboxes.get(client)
  if (!outbox) {
    outbox = new FeedbackOutbox(client, client.url)
    outboxes.set(client, outbox)
  }
  return outbox
}

export function useFeedbackOutbox() {
  const client = useConvex()
  return useMemo(() => feedbackOutbox(client), [client])
}

export function useFeedbackSends() {
  const outbox = useFeedbackOutbox()
  return useSyncExternalStore(outbox.subscribe, outbox.getSnapshot)
}
