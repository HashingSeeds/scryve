import { captureAnalytics } from "@/utils/analytics"

import { latencyStats, SyncLatency } from "./syncLatency"

jest.mock("@/utils/analytics", () => ({ captureAnalytics: jest.fn() }))

function meter() {
  let time = 0
  const latency = new SyncLatency({ transport: "nearby", role: "guest" }, () => time)
  return { latency, at: (next: number) => (time = next) }
}

describe("latencyStats", () => {
  it("reports nearest-rank percentiles and how many samples ran slow", () => {
    const samples = Array.from({ length: 100 }, (_, index) => (index + 1) * 12)
    expect(latencyStats(samples)).toEqual({
      count: 100,
      p50: 600,
      p90: 1_080,
      p99: 1_188,
      over500: 59,
      over1000: 17,
    })
    expect(latencyStats([])).toBeUndefined()
  })
})

describe("SyncLatency", () => {
  it("times a paint on the authority's clock, even one painted before the first ping landed", () => {
    const { latency, at } = meter()
    latency.remoteChange(10_050, 1)
    at(1_100)
    latency.painted(1)
    expect(latency.summary().delivery).toBeUndefined()

    latency.clockSample(2_000, 2_080, 11_000)
    latency.clockSample(3_000, 3_020, 12_000)
    latency.clockSample(4_000, 4_200, 13_500)

    expect(latency.summary()).toMatchObject({ delivery: { count: 1, p50: 40 }, ping: 20 })
  })

  it("waits for the frame that shows the change", () => {
    const { latency, at } = meter()
    latency.setAuthority()
    latency.remoteChange(100, 3)
    at(130)
    latency.painted(2)
    at(160)
    latency.painted(3)
    expect(latency.summary()).toEqual({ delivery: expect.objectContaining({ count: 1, p50: 60 }) })
  })

  it.each(["reply first", "projection first"] as const)(
    "pairs a cloud write with its server time: %s",
    (order) => {
      const { latency, at } = meter()
      const reply = { sentAt: 1_000, returnedAt: 1_040 }
      const projection = { authorityAt: 5_020 }
      latency.ownWrite("op", order === "reply first" ? reply : projection)
      latency.ownWrite("op", order === "reply first" ? projection : reply)
      latency.remoteChange(5_500, 2)
      at(1_600)
      latency.painted(2)
      expect(latency.summary()).toMatchObject({ delivery: { p50: 100 }, ping: 40 })
    },
  )

  it("reports a stretch of play once", () => {
    const { latency } = meter()
    latency.acknowledged(45)
    latency.report()
    latency.report()
    expect(captureAnalytics).toHaveBeenCalledTimes(1)
    expect(captureAnalytics).toHaveBeenCalledWith("sync_latency", {
      transport: "nearby",
      role: "guest",
      ack_count: 1,
      ack_p50: 45,
      ack_p90: 45,
      ack_p99: 45,
    })
  })
})
