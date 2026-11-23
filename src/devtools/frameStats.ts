// why: every device we measure on (iPhone 12 mini, Pixel 6a, simulators, Revyl) draws at 60 Hz.
export const FRAME_MS = 1000 / 60

export type FrameStats = {
  frames: number
  dropped: number
  hitches: number
  maxGapMs: number
  lastMs: number | null
}

export const NO_FRAMES: FrameStats = {
  frames: 0,
  dropped: 0,
  hitches: 0,
  maxGapMs: 0,
  lastMs: null,
}

export function recordFrame(stats: FrameStats, nowMs: number): FrameStats {
  "worklet"
  if (stats.lastMs === null) return { ...stats, frames: stats.frames + 1, lastMs: nowMs }
  const gapMs = nowMs - stats.lastMs
  const hitch = gapMs > FRAME_MS * 1.5
  return {
    frames: stats.frames + 1,
    dropped: stats.dropped + (hitch ? Math.round(gapMs / FRAME_MS) - 1 : 0),
    hitches: stats.hitches + (hitch ? 1 : 0),
    maxGapMs: Math.max(stats.maxGapMs, gapMs),
    lastMs: nowMs,
  }
}

export function formatFrameStats(thread: string, stats: FrameStats) {
  return `${thread} frames=${stats.frames} dropped=${stats.dropped} hitches=${stats.hitches} max=${Math.round(stats.maxGapMs)}`
}
