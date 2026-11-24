package expo.modules.cardtextreader

import kotlin.math.abs

private const val SIG_COLS = 16
private const val SIG_ROWS = 22
private const val FALLBACK_PROBE_MS = 600L
private const val MAX_MOTION_WAIT_MS = 450L

data class GateDecision(val shouldRead: Boolean, val sceneChanged: Boolean)

/**
 * why: in bulk/stand mode, pausing OCR while an accepted card stays stationary prevents thermal
 * throttling, and emitting sceneChanged once a new card settles lets duplicate copies scan
 * back-to-back. Handheld mode runs OCR continuously because natural hand motion keeps frame diffs
 * high and would otherwise stall reads or emit false swap events.
 */
class CardMotionGate {
  private var acceptedToken = 0
  private var waitingForSwap = false
  private var sawMotion = false
  private var stableFrames = 0
  private var motionStartedAtMs = 0L
  private var lastProbeAtMs = 0L
  private var acceptedSignature: IntArray? = null
  private var lastSignature: IntArray? = null

  @Synchronized
  fun onAccepted(token: Int) {
    if (token <= acceptedToken) return
    acceptedToken = token
    acceptedSignature = lastSignature?.copyOf()
    waitingForSwap = acceptedSignature != null
    sawMotion = false
    stableFrames = 0
    motionStartedAtMs = 0L
    lastProbeAtMs = android.os.SystemClock.elapsedRealtime()
  }

  @Synchronized
  fun reset() {
    waitingForSwap = false
    sawMotion = false
    stableFrames = 0
    motionStartedAtMs = 0L
    lastProbeAtMs = 0L
    acceptedSignature = null
    lastSignature = null
  }

  @Synchronized
  fun evaluate(luma: Luma, bulkMode: Boolean): GateDecision {
    val current = sampleSignature(luma) ?: return GateDecision(shouldRead = true, sceneChanged = false)
    val accepted = acceptedSignature
    if (!bulkMode || !waitingForSwap || accepted == null) {
      waitingForSwap = false
      sawMotion = false
      stableFrames = 0
      lastSignature = current
      return GateDecision(shouldRead = true, sceneChanged = false)
    }

    val motionThreshold = 14.0
    val settleThreshold = 14.0
    val neededStable = 2
    val diffFromAccepted = meanAbsDiff(current, accepted)
    val now = android.os.SystemClock.elapsedRealtime()

    if (!sawMotion) {
      lastSignature = current
      if (diffFromAccepted < motionThreshold) {
        if (now - lastProbeAtMs >= FALLBACK_PROBE_MS) {
          lastProbeAtMs = now
          return GateDecision(shouldRead = true, sceneChanged = false)
        }
        return GateDecision(shouldRead = false, sceneChanged = false)
      }
      sawMotion = true
      stableFrames = 0
      motionStartedAtMs = now
      return GateDecision(shouldRead = false, sceneChanged = false)
    }

    val frameDiff = lastSignature?.let { meanAbsDiff(current, it) } ?: 255.0
    lastSignature = current
    if (frameDiff < settleThreshold) {
      stableFrames += 1
      if (stableFrames >= neededStable) {
        waitingForSwap = false
        sawMotion = false
        stableFrames = 0
        return GateDecision(shouldRead = true, sceneChanged = true)
      }
    } else {
      stableFrames = 0
    }
    if (now - motionStartedAtMs >= MAX_MOTION_WAIT_MS) {
      waitingForSwap = false
      sawMotion = false
      stableFrames = 0
      return GateDecision(shouldRead = true, sceneChanged = true)
    }
    return GateDecision(shouldRead = false, sceneChanged = false)
  }

  private fun sampleSignature(luma: Luma): IntArray? {
    if (luma.width <= SIG_COLS || luma.height <= SIG_ROWS) return null
    val out = IntArray(SIG_COLS * SIG_ROWS)
    val xStart = luma.width / 6
    val xSpan = (luma.width * 2) / 3
    val yStart = luma.height / 6
    val ySpan = (luma.height * 2) / 3
    for (row in 0 until SIG_ROWS) {
      val y = yStart + (row * ySpan) / SIG_ROWS
      for (col in 0 until SIG_COLS) {
        val x = xStart + (col * xSpan) / SIG_COLS
        out[row * SIG_COLS + col] = luma.values[y * luma.width + x].toInt() and 0xff
      }
    }
    return out
  }

  private fun meanAbsDiff(a: IntArray, b: IntArray): Double {
    val count = minOf(a.size, b.size)
    if (count == 0) return 255.0
    var sum = 0
    for (i in 0 until count) {
      sum += abs(a[i] - b[i])
    }
    return sum.toDouble() / count
  }
}
