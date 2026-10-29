package expo.modules.cardtextreader

import kotlin.math.abs
import kotlin.math.atan
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt
import kotlin.math.tan

// why: an MTG card is 63x88. The area inside its border and a stack with a card peeking out
// are also card-like rectangles, but their shapes are further from it than a sleeve's.
private const val CARD_ASPECT = 63f / 88f
private const val CARD_ASPECT_TOLERANCE = 0.07f
// why: rejects the art box, the text box, and cards only partly in view.
private const val MIN_CARD_SHARE_OF_GUIDE = 0.4f
private const val MAX_TILT_DEGREES = 12
private const val TILT_STEP_DEGREES = 2
private const val LINES_PER_DIRECTION = 10
// why: perspective from a phone held at a slight angle bends the card's corners off 90°.
private val maxSkew = Math.toRadians(8.0).toFloat()
// why: a border 8 grey levels darker or lighter than its surroundings still counts as an edge.
private const val MIN_EDGE_GRADIENT = 32f
private const val MIN_SIDE_COVERAGE = 0.6f
private const val MIN_CORNER_COVERAGE = 0.5f
private const val MAX_OVERRUN_COVERAGE = 0.5f
private const val MAX_RECTANGLES = 6
private const val CLEARLY_CLOSER_ASPECT = 0.02f

data class Point(val x: Float, val y: Float)

data class Box(val x: Float, val y: Float, val width: Float, val height: Float)

enum class Rejection(val label: String) { Shape("shape"), Position("position"), Size("size") }

/** why: the JS keeps only text inside `corners`, so they are in the text recognizer's upright pixels. */
data class Rectangle(val corners: List<Point>, val aspect: Float, val share: Float, val rejected: Rejection?)

data class CardDetection(val card: Rectangle?, val rectangles: List<Rectangle>)

class Luma(
  val width: Int,
  val height: Int,
  val step: Int,
  val values: FloatArray,
  val originX: Int = 0,
  val originY: Int = 0,
) {
  fun toFrame(x: Float, y: Float) = Point((x + 0.5f) * step + originX, (y + 0.5f) * step + originY)

  fun fromFrame(x: Float, y: Float) = Point((x - originX) / step - 0.5f, (y - originY) / step - 0.5f)
}

/** why: turned upright by CameraX's clockwise `rotation`, so its pixels line up with the text recognizer's boxes. */
fun lumaFromPlane(plane: ByteArray, rowStride: Int, width: Int, height: Int, rotation: Int, step: Int): Luma {
  val cols = width / step
  val rows = height / step
  val sideways = rotation == 90 || rotation == 270
  val uprightWidth = if (sideways) rows else cols
  val values = FloatArray(cols * rows)
  // why: four reads per square instead of step², since reading every pixel was most of the cost.
  val half = step / 2
  for (y in 0 until rows) {
    val top = y * step * rowStride
    val middle = top + half * rowStride
    for (x in 0 until cols) {
      val left = x * step
      val sum = (plane[top + left].toInt() and 0xFF) + (plane[top + left + half].toInt() and 0xFF) +
        (plane[middle + left].toInt() and 0xFF) + (plane[middle + left + half].toInt() and 0xFF)
      val upright = when (rotation) {
        90 -> x * uprightWidth + rows - 1 - y
        180 -> (rows - 1 - y) * uprightWidth + cols - 1 - x
        270 -> (cols - 1 - x) * uprightWidth + y
        else -> y * uprightWidth + x
      }
      values[upright] = sum / 4f
    }
  }
  val spareX = width - cols * step
  val spareY = height - rows * step
  val (originX, originY) = when (rotation) {
    90 -> spareY to 0
    180 -> spareX to spareY
    270 -> 0 to spareX
    else -> 0 to 0
  }
  return Luma(uprightWidth, if (sideways) cols else rows, step, values, originX, originY)
}

/**
 * why: horizontal borders reuse the vertical search on transposed gradients, so both are
 * `across = offset + slope * (along - center)`, where across is x for a vertical line.
 */
private class Line(val vertical: Boolean, val offset: Float, val slope: Float, val center: Float) {
  val angle = atan(slope)
  private val norm = sqrt(1 + slope * slope)
  val normalX = if (vertical) 1 / norm else -slope / norm
  val normalY = if (vertical) -slope / norm else 1 / norm
}

private class Gradients(val width: Int, val height: Int, val x: FloatArray, val y: FloatArray) {
  fun transposed(): Gradients {
    val tx = FloatArray(x.size)
    val ty = FloatArray(y.size)
    for (row in 0 until height) {
      for (col in 0 until width) {
        tx[col * height + row] = y[row * width + col]
        ty[col * height + row] = x[row * width + col]
      }
    }
    return Gradients(height, width, tx, ty)
  }
}

private class Span(val start: Int, val end: Int) {
  val center = (start + end) / 2f
}

/**
 * why: Android has no rectangle detector like Vision's and OpenCV adds megabytes, so this
 * searches near the guide for straight borders, each allowed a small tilt, and keeps the quads
 * whose four sides lie on edges.
 */
object CardDetector {
  fun detect(luma: Luma, guide: Box?): CardDetection {
    val gradients = sobel(luma)
    val (columns, rows) = searchArea(luma, guide)
    val verticals = findLines(gradients, columns, rows, vertical = true)
    val horizontals = findLines(gradients.transposed(), rows, columns, vertical = false)
    val minWidth = min(luma.width, luma.height) * 0.25f
    val quads = mutableListOf<List<Point>>()
    for ((left, right) in pairs(verticals)) {
      if (right.offset - left.offset < minWidth || abs(left.angle - right.angle) > maxSkew) continue
      for ((top, bottom) in pairs(horizontals)) {
        if (bottom.offset - top.offset < minWidth || abs(top.angle - bottom.angle) > maxSkew) continue
        if (abs(left.angle + right.angle + top.angle + bottom.angle) / 2 > maxSkew) continue
        val corners = listOf(meet(left, top), meet(right, top), meet(right, bottom), meet(left, bottom))
        if (widthOverHeight(corners) !in 0.55f..0.9f) continue
        val sides = listOf(top, right, bottom, left)
        if (sides.withIndex().all { (side, line) -> onEdges(gradients, corners[side], corners[(side + 1) % 4], line) }) {
          quads += corners
        }
      }
    }
    val kept = mutableListOf<Rectangle>()
    val candidates = quads
      .map { corners -> describe(corners.map { luma.toFrame(it.x, it.y) }, guide) }
      .sortedByDescending { polygonArea(it.corners) }
    for (candidate in candidates) {
      val rival = kept.indexOfFirst { overlap(it.corners, candidate.corners) > 0.5f }
      // why: the area inside a card's border is the same shape but smaller, so the larger wins.
      // A quad joining the front card to the stack of sleeves around it is larger too, but its
      // shape is further from a card's, so a clearly closer shape replaces it.
      if (rival < 0) {
        if (kept.size < MAX_RECTANGLES) kept += candidate
      } else if (fitsCardBetter(candidate, kept[rival])) {
        kept[rival] = candidate
      }
    }
    val rectangles = kept.toList()
    val card = rectangles.filter { it.rejected == null }.minByOrNull { abs(it.aspect - CARD_ASPECT) }
    return CardDetection(card, rectangles)
  }

  private fun fitsCardBetter(candidate: Rectangle, current: Rectangle): Boolean {
    if (candidate.rejected == Rejection.Shape) return false
    if (current.rejected == Rejection.Shape) return true
    return abs(candidate.aspect - CARD_ASPECT) < abs(current.aspect - CARD_ASPECT) - CLEARLY_CLOSER_ASPECT
  }

  private fun describe(corners: List<Point>, guide: Box?): Rectangle {
    val aspect = widthOverHeight(corners)
    val share = if (guide == null || guide.width <= 0) 0f else polygonArea(corners) / (guide.width * guide.height)
    val rejected = when {
      abs(aspect - CARD_ASPECT) > CARD_ASPECT_TOLERANCE -> Rejection.Shape
      guide == null || guide.width <= 0 -> null
      !grown(guide, 0.1f).contains(midpoint(corners)) -> Rejection.Position
      share < MIN_CARD_SHARE_OF_GUIDE -> Rejection.Size
      else -> null
    }
    return Rectangle(corners, aspect, share, rejected)
  }

  private fun sobel(luma: Luma): Gradients {
    val w = luma.width
    val v = luma.values
    val gx = FloatArray(v.size)
    val gy = FloatArray(v.size)
    for (y in 1 until luma.height - 1) {
      for (x in 1 until w - 1) {
        val i = y * w + x
        gx[i] = (v[i - w + 1] + 2 * v[i + 1] + v[i + w + 1]) - (v[i - w - 1] + 2 * v[i - 1] + v[i + w - 1])
        gy[i] = (v[i + w - 1] + 2 * v[i + w] + v[i + w + 1]) - (v[i - w - 1] + 2 * v[i - w] + v[i - w + 1])
      }
    }
    return Gradients(w, luma.height, gx, gy)
  }

  // why: a card that passes sits within the guide grown by 10% and is at least 40% of its area,
  // so its borders can only be a little outside the guide.
  private fun searchArea(luma: Luma, guide: Box?): Pair<Span, Span> {
    if (guide == null || guide.width <= 0) return Span(1, luma.width - 2) to Span(1, luma.height - 2)
    val area = grown(guide, 0.3f)
    val from = luma.fromFrame(area.x, area.y)
    val to = luma.fromFrame(area.x + area.width, area.y + area.height)
    val columns = Span(from.x.toInt().coerceIn(1, luma.width - 2), to.x.toInt().coerceIn(1, luma.width - 2))
    val rows = Span(from.y.toInt().coerceIn(1, luma.height - 2), to.y.toInt().coerceIn(1, luma.height - 2))
    return columns to rows
  }

  private fun findLines(g: Gradients, columns: Span, rows: Span, vertical: Boolean): List<Line> {
    val slopes = (-MAX_TILT_DEGREES..MAX_TILT_DEGREES step TILT_STEP_DEGREES)
      .map { tan(Math.toRadians(it.toDouble())).toFloat() }
    val count = columns.end - columns.start + 1
    val best = FloatArray(count)
    val bestSlope = IntArray(count)
    val sums = FloatArray(count)
    for ((s, slope) in slopes.withIndex()) {
      sums.fill(0f)
      // why: every other row finds the same borders in half the time.
      for (y in rows.start..rows.end step 2) {
        val shift = (slope * (y - rows.center)).roundToInt()
        val row = y * g.width
        val from = max(columns.start, 1 - shift)
        val to = min(columns.end, g.width - 2 - shift)
        for (x in from..to) {
          val i = row + x + shift
          sums[x - columns.start] += g.x[i] - slope * g.y[i]
        }
      }
      val scale = 2 / (sqrt(1 + slope * slope) * (rows.end - rows.start + 1))
      for (k in 0 until count) {
        val strength = sums[k] * scale
        if (abs(strength) > abs(best[k])) {
          best[k] = strength
          bestSlope[k] = s
        }
      }
    }
    val peaks = (0 until count).filter { k ->
      val strength = abs(best[k])
      strength > 1 && (max(0, k - 1)..min(count - 1, k + 1)).all { abs(best[it]) <= strength }
    }.sortedByDescending { abs(best[it]) }
    val lines = mutableListOf<Int>()
    for (k in peaks) {
      if (lines.size == LINES_PER_DIRECTION) break
      if (lines.none { abs(it - k) < 2 }) lines += k
    }
    return lines.sorted().map { k ->
      Line(vertical, (k + columns.start).toFloat(), slopes[bestSlope[k]], rows.center)
    }
  }

  /**
   * why: a quad joining a card to one peeking out behind it has a corner where neither card has
   * one, so its edges stop short of that corner. The first and last 4% are skipped because card
   * corners are rounded.
   */
  private fun onEdges(g: Gradients, a: Point, b: Point, line: Line) =
    coverage(g, a, b, line, 0.04f, 0.14f) >= MIN_CORNER_COVERAGE &&
      coverage(g, a, b, line, 0.86f, 0.96f) >= MIN_CORNER_COVERAGE &&
      coverage(g, a, b, line, 0.04f, 0.96f) >= MIN_SIDE_COVERAGE &&
      endsAtCorners(g, a, b, line)

  /**
   * why: a card's border stops at its corners, while a quad that borrows a side from the stack
   * of sleeves behind it, or from the frame inside the card, has a side whose edge runs on past
   * one of its corners.
   */
  private fun endsAtCorners(g: Gradients, a: Point, b: Point, line: Line) =
    coverage(g, a, b, line, -0.14f, -0.04f) < MAX_OVERRUN_COVERAGE &&
      coverage(g, a, b, line, 1.04f, 1.14f) < MAX_OVERRUN_COVERAGE

  private fun coverage(g: Gradients, a: Point, b: Point, line: Line, from: Float, to: Float): Float {
    val samples = (hypot(b.x - a.x, b.y - a.y) * (to - from)).toInt()
    if (samples <= 0) return 0f
    var hits = 0
    for (n in 0 until samples) {
      val t = from + (to - from) * n / samples
      val x = a.x + (b.x - a.x) * t
      val y = a.y + (b.y - a.y) * t
      for (offset in -1..1) {
        val px = (x + offset * line.normalX).roundToInt()
        val py = (y + offset * line.normalY).roundToInt()
        if (px !in 0 until g.width || py !in 0 until g.height) continue
        val i = py * g.width + px
        if (abs(g.x[i] * line.normalX + g.y[i] * line.normalY) >= MIN_EDGE_GRADIENT) {
          hits++
          break
        }
      }
    }
    return hits.toFloat() / samples
  }
}

private fun pairs(lines: List<Line>) = lines.indices.flatMap { i -> (i + 1 until lines.size).map { lines[i] to lines[it] } }

private fun meet(vertical: Line, horizontal: Line): Point {
  val t = vertical.slope
  val u = horizontal.slope
  val x = (vertical.offset + t * (horizontal.offset - vertical.center - u * horizontal.center)) / (1 - t * u)
  return Point(x, horizontal.offset + u * (x - horizontal.center))
}

private fun widthOverHeight(corners: List<Point>): Float {
  val ends = distance(corners[0], corners[1]) + distance(corners[3], corners[2])
  val sides = distance(corners[0], corners[3]) + distance(corners[1], corners[2])
  return if (sides > 0) ends / sides else 0f
}

private fun polygonArea(points: List<Point>) =
  abs(points.indices.sumOf { i ->
    val a = points[i]
    val b = points[(i + 1) % points.size]
    (a.x * b.y - b.x * a.y).toDouble()
  }).toFloat() / 2

private fun midpoint(points: List<Point>) = Point(points.map { it.x }.average().toFloat(), points.map { it.y }.average().toFloat())

private fun distance(a: Point, b: Point) = hypot(a.x - b.x, a.y - b.y)

private fun grown(box: Box, by: Float) =
  Box(box.x - box.width * by, box.y - box.height * by, box.width * (1 + 2 * by), box.height * (1 + 2 * by))

private fun Box.contains(point: Point) = point.x in x..(x + width) && point.y in y..(y + height)

/** why: bounding boxes are close enough for cards tilted a few degrees. */
private fun overlap(a: List<Point>, b: List<Point>): Float {
  val left = max(a.minOf { it.x }, b.minOf { it.x })
  val right = min(a.maxOf { it.x }, b.maxOf { it.x })
  val top = max(a.minOf { it.y }, b.minOf { it.y })
  val bottom = min(a.maxOf { it.y }, b.maxOf { it.y })
  if (right <= left || bottom <= top) return 0f
  val shared = (right - left) * (bottom - top)
  val areaOf = { quad: List<Point> -> (quad.maxOf { it.x } - quad.minOf { it.x }) * (quad.maxOf { it.y } - quad.minOf { it.y }) }
  return shared / (areaOf(a) + areaOf(b) - shared)
}
