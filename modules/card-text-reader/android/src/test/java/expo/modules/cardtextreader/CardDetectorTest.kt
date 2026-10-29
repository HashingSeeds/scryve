package expo.modules.cardtextreader

import kotlin.math.cos
import kotlin.math.sin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

private const val TABLE = 25f
private const val BORDER = 70f
private const val FRAME = 170f

class CardDetectorTest {
  private val guide = Box(55f, 65f, 130f, 182f)

  @Test
  fun findsACardOnADarkTable() {
    val card = card(60f, 70f, 120f)
    val luma = scene { paintCard(card) }

    assertCorners(card, CardDetector.detect(luma, guide).card?.corners)
  }

  @Test
  fun followsASlightlyRotatedCard() {
    val card = rotate(card(60f, 70f, 120f), degrees = 7f)
    val luma = scene { paintCard(card) }

    assertCorners(card, CardDetector.detect(luma, guide).card?.corners)
  }

  @Test
  fun picksTheFrontCardOverOnePeekingOutBehindIt() {
    val behind = card(80f, 52f, 120f)
    val front = card(60f, 70f, 120f)
    val luma = scene {
      paintCard(behind)
      paintCard(front)
    }

    assertCorners(front, CardDetector.detect(luma, guide).card?.corners)
  }

  @Test
  fun neverPicksTheArtOrTextBoxInsideACard() {
    val card = card(60f, 70f, 120f)
    val luma = scene {
      paintCard(card)
      // why: boxes far bolder than the card's own border, as on a full-art card.
      paint(box(68f, 88f, 104f, 76f), 5f)
      paint(box(68f, 172f, 104f, 54f), 250f)
    }

    assertCorners(card, CardDetector.detect(luma, guide).card?.corners)
  }

  @Test
  fun placesCornersInTheRecognizersUprightPixels() {
    // why: the back camera's sensor is landscape, and CameraX asks for a 90° turn to stand it up.
    val sensorWidth = 1280
    val sensorHeight = 960
    val card = card(240f, 280f, 480f)
    val plane = ByteArray(sensorWidth * sensorHeight)
    for (sy in 0 until sensorHeight) {
      for (sx in 0 until sensorWidth) {
        val upright = Point((sensorHeight - 1 - sy).toFloat(), sx.toFloat())
        plane[sy * sensorWidth + sx] = cardShade(card, upright).toInt().toByte()
      }
    }
    val luma = lumaFromPlane(plane, sensorWidth, sensorWidth, sensorHeight, rotation = 90, step = 4)

    assertCorners(card, CardDetector.detect(luma, Box(220f, 260f, 520f, 728f)).card?.corners, tolerance = 6f)
  }
}

private class Scene(val width: Int, val height: Int) {
  val values = FloatArray(width * height) { TABLE }

  fun paint(quad: List<Point>, shade: Float) {
    for (y in 0 until height) {
      for (x in 0 until width) {
        if (inside(quad, Point(x + 0.5f, y + 0.5f))) values[y * width + x] = shade
      }
    }
  }

  fun paintCard(card: List<Point>) {
    paint(card, BORDER)
    paint(inset(card, 0.1f), FRAME)
  }
}

private fun scene(draw: Scene.() -> Unit): Luma {
  val scene = Scene(240, 320).apply(draw)
  return Luma(scene.width, scene.height, 1, scene.values)
}

private fun cardShade(card: List<Point>, point: Point) = when {
  inside(inset(card, 0.1f), point) -> FRAME
  inside(card, point) -> BORDER
  else -> TABLE
}

private fun box(x: Float, y: Float, width: Float, height: Float) =
  listOf(Point(x, y), Point(x + width, y), Point(x + width, y + height), Point(x, y + height))

private fun card(x: Float, y: Float, width: Float) = box(x, y, width, width * 88f / 63f)

private fun rotate(quad: List<Point>, degrees: Float): List<Point> {
  val radians = Math.toRadians(degrees.toDouble())
  val cx = quad.map { it.x }.average()
  val cy = quad.map { it.y }.average()
  return quad.map {
    Point(
      (cx + (it.x - cx) * cos(radians) - (it.y - cy) * sin(radians)).toFloat(),
      (cy + (it.x - cx) * sin(radians) + (it.y - cy) * cos(radians)).toFloat(),
    )
  }
}

private fun inset(quad: List<Point>, by: Float): List<Point> {
  val cx = quad.map { it.x }.average().toFloat()
  val cy = quad.map { it.y }.average().toFloat()
  return quad.map { Point(cx + (it.x - cx) * (1 - by), cy + (it.y - cy) * (1 - by)) }
}

private fun inside(quad: List<Point>, point: Point) = quad.indices.all { i ->
  val a = quad[i]
  val b = quad[(i + 1) % quad.size]
  (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) >= 0
}

private fun assertCorners(expected: List<Point>, actual: List<Point>?, tolerance: Float = 2f) {
  assertNotNull("no card found", actual)
  expected.zip(actual!!).forEach { (want, got) ->
    assertEquals("x of $got, wanted $want", want.x, got.x, tolerance)
    assertEquals("y of $got, wanted $want", want.y, got.y, tolerance)
  }
}
