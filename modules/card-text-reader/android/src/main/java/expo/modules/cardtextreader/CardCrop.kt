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
  val (uprightX, uprightY) = when (rotation) {
    90 -> (sensorHeight - bottom) to left
    180 -> (sensorWidth - right) to (sensorHeight - bottom)
    270 -> top to (sensorWidth - right)
    else -> left to top
  }
  return SensorCrop(left, top, right - left, bottom - top, uprightX, uprightY)
}

private fun even(value: Int, limit: Int) = (value.coerceIn(0, limit) / 2) * 2

/** why: ML Kit reads NV21 byte arrays, and copying only the card is cheaper than reading the frame. */
fun nv21(image: Image, crop: SensorCrop): ByteArray {
  val out = ByteArray(crop.width * crop.height * 3 / 2)
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
