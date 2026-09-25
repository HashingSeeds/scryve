import type { DrainOutboxResult } from "./drainOutbox"
import type { DurableFailedRecord, DurablePendingRecord } from "./durableOutbox"
import { createOutboxController, type OutboxControllerOptions } from "./outboxController"

type Pending = DurablePendingRecord
type Failed = DurableFailedRecord<Pending>
type Result = DrainOutboxResult<Pending, Failed>

const result = (overrides: Partial<Result> = {}): Result => ({
  acknowledged: [],
  failed: [],
  stoppedForRetry: false,
  blockedByFailureCapacity: false,
  pending: [],
  failures: [],
  ...overrides,
})

const pendingWith = (attempts: number): Pending => ({ schemaVersion: 1, queuedAt: 0, attempts })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const flush = () => new Promise(setImmediate)

function setup(overrides: Partial<OutboxControllerOptions<Pending, Failed, number>> = {}) {
  let published = 0
  const drain = jest.fn<Promise<Result>, [() => boolean]>(async () => result())
  const controller = createOutboxController<Pending, Failed, number>({
    snapshot: () => (published += 1),
    drain,
    retryDelay: (drained) => 1_000 * 2 ** (drained.pending[0]?.attempts ?? 0),
    ...overrides,
  })
  return { controller, drain: (overrides.drain as typeof drain | undefined) ?? drain }
}

describe("createOutboxController", () => {
  afterEach(() => jest.useRealTimers())

  it("drains only while started and fences the pass a stop interrupts", async () => {
    const pass = deferred<Result>()
    let shouldContinue: () => boolean = () => true
    const { controller, drain } = setup({
      drain: jest.fn((current: () => boolean) => {
        shouldContinue = current
        return pass.promise
      }),
    })

    await controller.drain()
    expect(drain).not.toHaveBeenCalled()

    controller.start()
    expect(drain).toHaveBeenCalledTimes(1)
    expect(shouldContinue()).toBe(true)
    controller.stop()
    expect(shouldContinue()).toBe(false)
    pass.resolve(result())
    await flush()
    expect(drain).toHaveBeenCalledTimes(1)
  })

  it("coalesces drains requested mid-pass into one follow-up pass", async () => {
    const first = deferred<Result>()
    const drain = jest
      .fn<Promise<Result>, [() => boolean]>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(result())
    const { controller } = setup({ drain })

    controller.start()
    void controller.drain()
    void controller.drain()
    first.resolve(result())
    await flush()

    expect(drain).toHaveBeenCalledTimes(2)
  })

  it("retries the queue head with the domain's backoff", async () => {
    jest.useFakeTimers()
    const drain = jest
      .fn<Promise<Result>, [() => boolean]>()
      .mockResolvedValueOnce(result({ stoppedForRetry: true, pending: [pendingWith(2)] }))
      .mockResolvedValue(result())
    const { controller } = setup({ drain })

    controller.start()
    await Promise.resolve()
    await Promise.resolve()
    jest.advanceTimersByTime(3_999)
    expect(drain).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(1)
    expect(drain).toHaveBeenCalledTimes(2)
  })

  it("holds retries when the domain returns no delay and cancels them on stop", async () => {
    jest.useFakeTimers()
    const retrying = result({ stoppedForRetry: true, pending: [pendingWith(0)] })
    const delays: (number | undefined)[] = [undefined, 500]
    const drain = jest.fn<Promise<Result>, [() => boolean]>().mockResolvedValue(retrying)
    const { controller } = setup({ drain, retryDelay: () => delays.shift() })

    controller.start()
    await Promise.resolve()
    await Promise.resolve()
    jest.advanceTimersByTime(60_000)
    expect(drain).toHaveBeenCalledTimes(1)

    await controller.drain()
    controller.stop()
    jest.advanceTimersByTime(60_000)
    expect(drain).toHaveBeenCalledTimes(2)
  })

  it("pauses at failure capacity until unblocked", async () => {
    const drain = jest
      .fn<Promise<Result>, [() => boolean]>()
      .mockResolvedValueOnce(result({ blockedByFailureCapacity: true }))
      .mockResolvedValue(result())
    const snapshot = jest.fn(({ capacityBlocked }: { capacityBlocked: boolean }) =>
      capacityBlocked ? 1 : 0,
    )
    const controller = createOutboxController<Pending, Failed, number>({
      snapshot,
      drain,
      retryDelay: () => 0,
    })

    controller.start()
    await flush()
    controller.publish()
    expect(controller.getSnapshot()).toBe(1)
    await controller.drain()
    expect(drain).toHaveBeenCalledTimes(1)

    controller.unblock()
    await controller.drain()
    expect(drain).toHaveBeenCalledTimes(2)
  })

  it("runs another pass when work remains after a clean pass and the gate allows it", async () => {
    let queued = 2
    let open = true
    const drain = jest.fn<Promise<Result>, [() => boolean]>(async () => {
      queued -= 1
      return result()
    })
    const { controller } = setup({
      drain,
      hasPending: () => queued > 0,
      canDrain: () => open,
    })

    controller.start()
    await flush()
    expect(drain).toHaveBeenCalledTimes(2)

    queued = 1
    open = false
    await controller.drain()
    expect(drain).toHaveBeenCalledTimes(2)
  })
})
