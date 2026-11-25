package expo.modules.cardtextreader

import android.media.Image
import kotlin.math.ceil
import kotlin.math.floor

/**
 * why: the text recognizer gets only the card, cut from the sensor frame, and reports boxes
 * relative to that cut, so `uprightX`/`uprightY` move them back into the whole upright frame.
 */
data class SensorCrop(
  val left: Int,
  val top: Int,
  val width: Int,
  val height: Int,
  val uprightX: Int,
  val uprightY: Int,
)

private const val TOP_BAND_SHARE = 0.30f
private const val BOTTOM_BAND_SHARE = 0.22f

private fun cropRect(
  ux0: Float,
  uy0: Float,
  ux1: Float,
  uy1: Float,
  sensorWidth: Int,
  sensorHeight: Int,
  rotation: Int,
): SensorCrop {
  val (sx0, sx1, sy0, sy1) = when (rotation) {
    90 -> listOf(uy0, uy1, sensorHeight - ux1, sensorHeight - ux0)
    180 -> listOf(sensorWidth - ux1, sensorWidth - ux0, sensorHeight - uy1, sensorHeight - uy0)
    270 -> listOf(sensorWidth - uy1, sensorWidth - uy0, ux0, ux1)
    else -> listOf(ux0, ux1, uy0, uy1)
  }
  // why: chroma is stored at half resolution, so the cut starts and ends on even pixels.
  val left = even(floor(sx0).toInt(), sensorWidth)
  val right = even(ceil(sx1).toInt() + 1, sensorWidth)
  val top = even(floor(sy0).toInt(), sensorHeight)
  val bottom = even(ceil(sy1).toInt() + 1, sensorHeight)
  val width = maxOf(2, right - left)
  val height = maxOf(2, bottom - top)
  val clampedLeft = minOf(left, maxOf(0, sensorWidth - width))
  val clampedTop = minOf(top, maxOf(0, sensorHeight - height))
  val clampedRight = clampedLeft + width
  val clampedBottom = clampedTop + height
  val (uprightX, uprightY) = when (rotation) {
    90 -> (sensorHeight - clampedBottom) to clampedLeft
    180 -> (sensorWidth - clampedRight) to (sensorHeight - clampedBottom)
    270 -> clampedTop to (sensorWidth - clampedRight)
    else -> clampedLeft to clampedTop
  }
  return SensorCrop(clampedLeft, clampedTop, width, height, uprightX, uprightY)
}

/** why: `margin` is a share of the upright frame, so a name touching the card's edge stays whole. */
fun cropAround(corners: List<Point>, sensorWidth: Int, sensorHeight: Int, rotation: Int, margin: Float): SensorCrop {
  val sideways = rotation == 90 || rotation == 270
  val uprightWidth = if (sideways) sensorHeight else sensorWidth
  val uprightHeight = if (sideways) sensorWidth else sensorHeight
  val padX = uprightWidth * margin
  val padY = uprightHeight * margin
  val ux0 = (corners.minOf { it.x } - padX).coerceIn(0f, uprightWidth.toFloat())
  val ux1 = (corners.maxOf { it.x } + padX).coerceIn(0f, uprightWidth.toFloat())
  val uy0 = (corners.minOf { it.y } - padY).coerceIn(0f, uprightHeight.toFloat())
  val uy1 = (corners.maxOf { it.y } + padY).coerceIn(0f, uprightHeight.toFloat())
  return cropRect(ux0, uy0, ux1, uy1, sensorWidth, sensorHeight, rotation)
}

private fun lerpPoint(a: Point, b: Point, t: Float) =
  Point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)

private fun cropAroundPoints(
  points: List<Point>,
  sensorWidth: Int,
  sensorHeight: Int,
  rotation: Int,
  margin: Float,
): SensorCrop {
  val sideways = rotation == 90 || rotation == 270
  val uprightWidth = if (sideways) sensorHeight else sensorWidth
  val uprightHeight = if (sideways) sensorWidth else sensorHeight
  val padX = uprightWidth * margin
  val padY = uprightHeight * margin
  val ux0 = (points.minOf { it.x } - padX).coerceIn(0f, uprightWidth.toFloat())
  val ux1 = (points.maxOf { it.x } + padX).coerceIn(0f, uprightWidth.toFloat())
  val uy0 = (points.minOf { it.y } - padY).coerceIn(0f, uprightHeight.toFloat())
  val uy1 = (points.maxOf { it.y } + padY).coerceIn(0f, uprightHeight.toFloat())
  return cropRect(ux0, uy0, ux1, uy1, sensorWidth, sensorHeight, rotation)
}

/** why: cropping only the title band and bottom collector-number band cuts ML Kit pixels ~60% and avoids rules text. */
fun cropCardBands(
  corners: List<Point>,
  sensorWidth: Int,
  sensorHeight: Int,
  rotation: Int,
  margin: Float,
): Pair<SensorCrop, SensorCrop> {
  if (corners.size >= 4) {
    val tl = corners[0]
    val tr = corners[1]
    val br = corners[2]
    val bl = corners[3]
    val topPoints = listOf(
      tl,
      tr,
      lerpPoint(tl, bl, TOP_BAND_SHARE),
      lerpPoint(tr, br, TOP_BAND_SHARE),
    )
    val bottomPoints = listOf(
      lerpPoint(tl, bl, 1f - BOTTOM_BAND_SHARE),
      lerpPoint(tr, br, 1f - BOTTOM_BAND_SHARE),
      bl,
      br,
    )
    return cropAroundPoints(topPoints, sensorWidth, sensorHeight, rotation, margin) to
      cropAroundPoints(bottomPoints, sensorWidth, sensorHeight, rotation, margin)
  }
  val sideways = rotation == 90 || rotation == 270
  val uprightWidth = if (sideways) sensorHeight else sensorWidth
  val uprightHeight = if (sideways) sensorWidth else sensorHeight
  val padX = uprightWidth * margin
  val padY = uprightHeight * margin
  val ux0 = (corners.minOf { it.x } - padX).coerceIn(0f, uprightWidth.toFloat())
  val ux1 = (corners.maxOf { it.x } + padX).coerceIn(0f, uprightWidth.toFloat())
  val uy0 = (corners.minOf { it.y } - padY).coerceIn(0f, uprightHeight.toFloat())
  val uy1 = (corners.maxOf { it.y } + padY).coerceIn(0f, uprightHeight.toFloat())
  val cardHeight = maxOf(4f, uy1 - uy0)
  val topCrop = cropRect(ux0, uy0, ux1, minOf(uy1, uy0 + cardHeight * TOP_BAND_SHARE), sensorWidth, sensorHeight, rotation)
  val bottomCrop = cropRect(ux0, maxOf(uy0, uy1 - cardHeight * BOTTOM_BAND_SHARE), ux1, uy1, sensorWidth, sensorHeight, rotation)
  return topCrop to bottomCrop
}

private fun even(value: Int, limit: Int) = (value.coerceIn(0, limit) / 2) * 2

/** why: ML Kit reads NV21 byte arrays; reusing a buffer avoids per-frame allocations during bulk scans. */
fun nv21(image: Image, crop: SensorCrop, reuseBuffer: ByteArray? = null): ByteArray {
  val needed = crop.width * crop.height * 3 / 2
  val out = if (reuseBuffer != null && reuseBuffer.size >= needed) reuseBuffer else ByteArray(needed)
  val y = image.planes[0]
  val yBuffer = y.buffer
  for (row in 0 until crop.height) {
    yBuffer.position((crop.top + row) * y.rowStride + crop.left)
    yBuffer.get(out, row * crop.width, crop.width)
  }
  val u = image.planes[1]
  val v = image.planes[2]
  var index = crop.width * crop.height
  for (row in 0 until crop.height / 2) {
    val chromaRow = crop.top / 2 + row
    for (col in 0 until crop.width / 2) {
      val chromaCol = crop.left / 2 + col
      out[index++] = v.buffer.get(chromaRow * v.rowStride + chromaCol * v.pixelStride)
      out[index++] = u.buffer.get(chromaRow * u.rowStride + chromaCol * u.pixelStride)
    }
  }
  return out
}
