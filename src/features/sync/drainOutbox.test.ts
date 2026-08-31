import { drainOutbox, type DurableOutboxRepository } from "./drainOutbox"
import type { DurableFailResult, DurableFailedRecord, DurablePendingRecord } from "./durableOutbox"

interface Operation extends DurablePendingRecord {
  id: string
}

interface Failure extends DurableFailedRecord<Operation> {
  schemaVersion: 1
}

class InMemoryRepository implements DurableOutboxRepository<Operation, Failure> {
  pending: Operation[] = []
  failures: Failure[] = []

  loadPending() {
    return [...this.pending]
  }

  updateAttempt(operationId: string, attemptedAt: number) {
    const index = this.pending.findIndex((operation) => operation.id === operationId)
    if (index < 0) return null
    const updated = {
      ...this.pending[index],
      attempts: this.pending[index].attempts + 1,
      lastAttemptAt: attemptedAt,
    }
    this.pending[index] = updated
    return updated
  }

  acknowledge(operationId: string) {
    this.pending = this.pending.filter((operation) => operation.id !== operationId)
  }

  failAction(
    action: Operation,
    reason: string,
    failedAt: number,
    currentFailed: readonly Failure[],
    currentPending: readonly Operation[],
  ): DurableFailResult<Operation, Failure> {
    const failure: Failure = { schemaVersion: 1, action, reason, failedAt }
    this.failures = [...currentFailed, failure]
    this.pending = currentPending.filter((operation) => operation.id !== action.id)
    return { accepted: true, failed: this.failures, pending: this.pending }
  }
}

const operation = (id: string): Operation => ({ schemaVersion: 1, id, queuedAt: 1, attempts: 0 })

const retryOrReject = (kind: "retry" | "reject") => () =>
  kind === "retry" ? { kind: "retry" as const } : { kind: "reject" as const, reason: "rejected" }

describe("generic outbox drain", () => {
  it("leaves transient failures pending for an at-least-once replay", async () => {
    const repository = new InMemoryRepository()
    repository.pending = [operation("op-retry")]
    const first = await drainOutbox({
      repository,
      operationId: (item) => item.id,
      classifyFailure: retryOrReject("retry"),
      send: async () => {
        throw new Error("offline")
      },
      now: () => 10,
    })
    expect(first).toMatchObject({ stoppedForRetry: true, acknowledged: [] })
    expect(repository.pending[0]).toMatchObject({ id: "op-retry", attempts: 1 })

    const second = await drainOutbox({
      repository,
      operationId: (item) => item.id,
      classifyFailure: retryOrReject("retry"),
      send: async (item) => ({ operationId: item.id }),
    })
    expect(second.acknowledged).toEqual(["op-retry"])
    expect(repository.pending).toEqual([])
  })

  it("moves terminal failures out of pending and retains the rejection", async () => {
    const repository = new InMemoryRepository()
    repository.pending = [operation("op-reject")]
    const result = await drainOutbox({
      repository,
      operationId: (item) => item.id,
      classifyFailure: retryOrReject("reject"),
      send: async () => {
        throw new Error("server rejected")
      },
      now: () => 20,
    })

    expect(result).toMatchObject({ failed: ["op-reject"], stoppedForRetry: false })
    expect(repository.pending).toEqual([])
    expect(repository.failures).toMatchObject([{ action: { id: "op-reject" }, reason: "rejected" }])
  })
})
