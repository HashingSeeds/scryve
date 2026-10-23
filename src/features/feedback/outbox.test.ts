import type { ConvexReactClient } from "convex/react"
import { ConvexError } from "convex/values"

import type { DurableStringStorage } from "@/features/sync/durableOutbox"

import { FeedbackOutbox } from "./outbox"

class MemoryStorage implements DurableStringStorage {
  values = new Map<string, string>()
  getString(key: string) {
    return this.values.get(key)
  }
  getAllKeys() {
    return [...this.values.keys()]
  }
  set(key: string, value: string) {
    this.values.set(key, value)
  }
  delete(key: string) {
    this.values.delete(key)
  }
}

const KEY = "k".repeat(64)
const submit = {
  type: "submit" as const,
  kind: "feature" as const,
  body: "Round timer, 50 minutes",
  includeAccount: false,
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

function outboxWith(mutation: jest.Mock, local = new MemoryStorage()) {
  const client = { mutation } as unknown as ConvexReactClient
  const outbox = new FeedbackOutbox(
    client,
    "https://dev.example.convex.cloud",
    local,
    async () => KEY,
  )
  const stop = outbox.start()
  return { outbox, local, stop }
}

describe("FeedbackOutbox", () => {
  it("keeps a send made offline until a later launch delivers it once", async () => {
    const mutation = jest.fn(async (_reference: unknown, _args: unknown) => "request-1")
    const first = outboxWith(mutation)
    const operationId = first.outbox.enqueue(submit)
    await flush()
    expect(mutation).not.toHaveBeenCalled()
    first.stop()

    const second = outboxWith(mutation, first.local)
    expect(second.outbox.getSnapshot().pending).toHaveLength(1)
    second.outbox.setReady(true)
    await flush()
    expect(mutation).toHaveBeenCalledTimes(1)
    expect(mutation.mock.calls[0]?.[1]).toMatchObject({
      key: KEY,
      clientId: operationId,
      body: "Round timer, 50 minutes",
    })
    expect(second.outbox.getSnapshot().pending).toEqual([])
    second.stop()
  })

  it("answers a waiting screen with the new request's id", async () => {
    const { outbox, stop } = outboxWith(jest.fn(async () => "request-2"))
    outbox.setReady(true)
    const operationId = outbox.enqueue(submit)
    await expect(outbox.waitFor(operationId, 1_000)).resolves.toBe("request-2")
    stop()
  })

  it("hands a refusal to the waiting screen and keeps no failure behind", async () => {
    const refusal = new ConvexError({
      code: "rate_limited",
      message: "Slow down",
      retryAfterMs: 120_000,
    })
    const { outbox, stop } = outboxWith(jest.fn(async () => Promise.reject(refusal)))
    outbox.setReady(true)
    const operationId = outbox.enqueue(submit)
    await expect(outbox.waitFor(operationId, 1_000)).rejects.toBe(refusal)
    await flush()
    expect(outbox.getSnapshot()).toMatchObject({ pending: [], failures: [] })
    stop()
  })

  it("keeps a refused background send to show, and retries a dropped connection", async () => {
    const mutation = jest
      .fn()
      .mockRejectedValueOnce(new Error("socket closed"))
      .mockRejectedValueOnce(
        new ConvexError({ code: "invalid_text", message: "Message must be 1 to 2000 characters" }),
      )
    const { outbox, stop } = outboxWith(mutation)
    outbox.enqueue(submit)
    outbox.setReady(true)
    await flush()
    expect(outbox.getSnapshot().pending).toHaveLength(1)
    outbox.setReady(true)
    await flush()
    expect(outbox.getSnapshot().failures).toMatchObject([
      { reason: "Message must be 1 to 2000 characters", action: { body: submit.body } },
    ])
    stop()
  })

  it("never sends a request queued with one account under another", async () => {
    const mutation = jest.fn(async (_reference: unknown, _args: unknown) => "request-1")
    const { outbox, stop } = outboxWith(mutation)
    outbox.setReady(false, "user_a")
    outbox.enqueue({ ...submit, includeAccount: true })
    outbox.setReady(true, "user_b")
    await flush()
    expect(mutation).not.toHaveBeenCalled()
    expect(outbox.getSnapshot().failures).toMatchObject([
      { reason: "You switched accounts before it sent", action: { accountId: "user_a" } },
    ])
    stop()
  })
})
