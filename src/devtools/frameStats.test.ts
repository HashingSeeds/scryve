import { FRAME_MS, formatFrameStats, NO_FRAMES, recordFrame } from "./frameStats"

const play = (times: number[]) => times.reduce(recordFrame, NO_FRAMES)

describe("recordFrame", () => {
  it("counts on-time frames without drops", () => {
    expect(play([0, FRAME_MS, 2 * FRAME_MS])).toMatchObject({ frames: 3, dropped: 0, hitches: 0 })
  })

  it("counts each missed slot as dropped and each late gap as one hitch", () => {
    const stats = play([0, 4 * FRAME_MS, 5 * FRAME_MS, 7 * FRAME_MS])
    expect(stats).toMatchObject({ frames: 4, dropped: 4, hitches: 2, maxGapMs: 4 * FRAME_MS })
  })

  it("tolerates jitter under one and a half frames", () => {
    expect(play([0, 1.4 * FRAME_MS])).toMatchObject({ dropped: 0, hitches: 0 })
  })
})

it("formats one line an agent can diff", () => {
  expect(formatFrameStats("ui", play([0, 100]))).toBe("ui frames=2 dropped=5 hitches=1 max=100")
})
