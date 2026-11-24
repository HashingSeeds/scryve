package expo.modules.cardtextreader

import android.graphics.Rect
import android.util.Log
import com.google.mlkit.vision.text.Text
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

private val SET_ELEMENT_REGEX = Regex("^([A-Z0-9]{3,5})[.,•·*★☆-]?$")
private val SEP_ELEMENT_REGEX = Regex("^[•·*★☆+-]{1,2}$")
private val LANG_ELEMENT_REGEX =
  Regex("^([*★☆•·+-]?)(EN|JA|JP|FR|DE|IT|ES|PT|KO|RU)(?:$|[A-Z].*)")
private val STAR_CHARS = Regex("[*★☆]")
private val IGNORED_SETS = setOf(
  "TM", "WOTC", "LLC", "INC", "USA", "CBS", "THE", "AND", "FOR", "ALL",
  "EN", "JA", "JP", "FR", "DE", "IT", "ES", "PT", "KO", "RU",
)

private data class SetLangBoxes(
  val setCode: String,
  val setBox: Rect,
  val langBox: Rect,
  val sepIsStar: Boolean,
)

private fun findSetAndLangBoxes(line: Text.Line): SetLangBoxes? {
  val elements = line.elements
  if (elements.size < 2) return null
  for (i in 0 until elements.size - 1) {
    val setMatch = SET_ELEMENT_REGEX.matchEntire(elements[i].text.trim()) ?: continue
    val setCode = setMatch.groupValues[1]
    if (setCode in IGNORED_SETS) continue
    val setBox = elements[i].boundingBox ?: continue

    val nextText = elements[i + 1].text.trim()
    val sepOffset = if (SEP_ELEMENT_REGEX.matches(nextText) && i + 2 < elements.size) 2 else 1
    val langEl = elements[i + sepOffset]
    val langText = langEl.text.trim()
    val langMatch = LANG_ELEMENT_REGEX.matchEntire(langText) ?: continue
    val rawLangBox = langEl.boundingBox ?: continue
    val prefix = langMatch.groupValues[1]
    val langCode = langMatch.groupValues[2]

    val langBox = if (langText.length > langCode.length && rawLangBox.width() > 0) {
      val charW = rawLangBox.width().toFloat() / langText.length
      val left = (rawLangBox.left + prefix.length * charW).roundToInt()
      val right = (left + langCode.length * charW).roundToInt()
      Rect(left, rawLangBox.top, max(left + 1, right), rawLangBox.bottom)
    } else {
      rawLangBox
    }
    if (langBox.left <= setBox.right) continue

    val midSep = if (sepOffset == 2) nextText else prefix
    val sepIsStar = STAR_CHARS.containsMatchIn(midSep) || STAR_CHARS.containsMatchIn(elements[i].text)
    return SetLangBoxes(setCode, setBox, langBox, sepIsStar)
  }
  return null
}

/**
 * why: ML Kit Latin OCR drops or misreads the tiny M15+ foil star (`★`) between set and language.
 * Sampling the raw Y-plane pixels between the recognized set and language boxes separates the
 * taller pointed star from the compact nonfoil dot (`•`) without an extra model.
 */
fun detectFoilStarInLine(
  line: Text.Line,
  lumaBytes: ByteArray,
  rowStride: Int,
  sensorWidth: Int,
  sensorHeight: Int,
  rotation: Int,
  isCroppedBand: Boolean,
): Boolean {
  val found = findSetAndLangBoxes(line) ?: return false
  val setBox = found.setBox
  val langBox = found.langBox
  val capH = max(1f, setBox.height().toFloat())
  if (capH < 10f) return false

  fun lumaAtUpright(ux: Int, uy: Int): Int {
    val sx: Int
    val sy: Int
    when (rotation) {
      90 -> {
        sx = uy
        sy = sensorHeight - 1 - ux
      }
      180 -> {
        sx = sensorWidth - 1 - ux
        sy = sensorHeight - 1 - uy
      }
      270 -> {
        sx = sensorWidth - 1 - uy
        sy = ux
      }
      else -> {
        sx = ux
        sy = uy
      }
    }
    val cx = sx.coerceIn(0, sensorWidth - 1)
    val cy = sy.coerceIn(0, sensorHeight - 1)
    val idx = cy * rowStride + cx
    if (idx < 0 || idx >= lumaBytes.size) return 0
    return lumaBytes[idx].toInt() and 0xff
  }

  val refLeft = setBox.left - (setBox.width() * 0.1f).roundToInt()
  val refRight = setBox.right + (setBox.width() * 0.1f).roundToInt()
  val refTop = setBox.top - (setBox.height() * 0.25f).roundToInt()
  val refBottom = setBox.bottom + (setBox.height() * 0.25f).roundToInt()
  val refSamples = ArrayList<Int>(256)
  val stepX = max(1, (refRight - refLeft) / 24)
  val stepY = max(1, (refBottom - refTop) / 16)
  var uy = refTop
  while (uy <= refBottom) {
    var ux = refLeft
    while (ux <= refRight) {
      refSamples.add(lumaAtUpright(ux, uy))
      ux += stepX
    }
    uy += stepY
  }
  if (refSamples.isEmpty()) return false
  refSamples.sort()
  val bg = refSamples[refSamples.size / 6]
  val ink = refSamples[(refSamples.size * 9) / 10]
  val contrast = ink - bg
  if (contrast < 18) return false
  val thresh = bg + (contrast * 0.45f).roundToInt()

  val gx0 = setBox.right
  val gx1 = langBox.left
  val gy0 = min(setBox.top, langBox.top)
  val gy1 = max(setBox.bottom, langBox.bottom)
  val gapW = (gx1 - gx0).coerceIn(3, 28)
  val gapH = (gy1 - gy0).coerceIn(3, 28)
  val mask = BooleanArray(gapW * gapH)
  for (r in 0 until gapH) {
    val sampleY = gy0 + ((gy1 - gy0) * r) / max(1, gapH - 1)
    for (c in 0 until gapW) {
      val sampleX = gx0 + ((gx1 - gx0) * c) / max(1, gapW - 1)
      mask[r * gapW + c] = lumaAtUpright(sampleX, sampleY) >= thresh
    }
  }

  val visited = BooleanArray(gapW * gapH)
  val queue = IntArray(gapW * gapH)
  var bestDist = Float.MAX_VALUE
  var bestArea = 0
  var bestH = 0
  var bestTopWidth = 0
  var bestMaxRowWidth = 0
  val rowCounts = IntArray(gapH)

  for (r in 0 until gapH) {
    for (c in 0 until gapW) {
      val start = r * gapW + c
      if (!mask[start] || visited[start]) continue
      var head = 0
      var tail = 0
      queue[tail++] = start
      visited[start] = true
      var minR = r
      var maxR = r
      var minC = c
      var maxC = c
      var area = 0
      rowCounts.fill(0)
      while (head < tail) {
        val pos = queue[head++]
        val cr = pos / gapW
        val cc = pos % gapW
        area++
        if (cr < minR) minR = cr
        if (cr > maxR) maxR = cr
        if (cc < minC) minC = cc
        if (cc > maxC) maxC = cc
        rowCounts[cr]++
        if (cr > 0 && mask[pos - gapW] && !visited[pos - gapW]) {
          visited[pos - gapW] = true
          queue[tail++] = pos - gapW
        }
        if (cr + 1 < gapH && mask[pos + gapW] && !visited[pos + gapW]) {
          visited[pos + gapW] = true
          queue[tail++] = pos + gapW
        }
        if (cc > 0 && mask[pos - 1] && !visited[pos - 1]) {
          visited[pos - 1] = true
          queue[tail++] = pos - 1
        }
        if (cc + 1 < gapW && mask[pos + 1] && !visited[pos + 1]) {
          visited[pos + 1] = true
          queue[tail++] = pos + 1
        }
      }
      // why: ML Kit's bounding boxes can sit 3-4 px off the ink, letting the adjacent set letter
      // or 'E' of EN bleed into the left/right edge of gapBox; a real separator never touches the edges.
      if (minR == 0 || maxR == gapH - 1 || minC == 0 || maxC == gapW - 1) continue
      val cy = (minR + maxR) / 2f
      val dist = abs(cy - gapH / 2f)
      if (dist < bestDist) {
        bestDist = dist
        bestArea = area
        bestH = maxR - minR + 1
        bestTopWidth = rowCounts[minR]
        var maxRw = 0
        for (rr in minR..maxR) if (rowCounts[rr] > maxRw) maxRw = rowCounts[rr]
        bestMaxRowWidth = maxRw
      }
    }
  }

  val hasBlob = bestArea > 0
  val hRatio = if (hasBlob) bestH / capH else 0f
  val areaRatio = if (hasBlob) bestArea / (capH * capH) else 0f
  val hasSpire = hasBlob && bestH >= 7 && bestTopWidth <= bestMaxRowWidth * 0.5f
  // why: below 18 px cap height on Android's 1280x960 sensor, a nonfoil bullet plus glare can mimic
  // a 5 px spire, whereas ML Kit's '*' separator between set and language is clean at all sizes.
  val pixelStar = hasBlob && capH >= 18f && hRatio >= 0.40f && areaRatio >= 0.085f && hasSpire
  val corroboratedStar =
    found.sepIsStar &&
      capH >= 10f &&
      (!hasBlob || gapW <= 5 || (hRatio >= 0.28f && areaRatio >= 0.05f))
  val isFoil = pixelStar || corroboratedStar

  if (Log.isLoggable("FoilProbe", Log.DEBUG)) {
    val grid = buildString {
      for (r in 0 until gapH) {
        if (r > 0) append('|')
        for (c in 0 until gapW) append(if (mask[r * gapW + c]) '#' else '.')
      }
    }
    Log.d(
      "FoilProbe",
      "text=${line.text} set=${found.setCode} capH=${"%.1f".format(capH)} gap=${gapW}x$gapH crop=$isCroppedBand starSep=${found.sepIsStar} blob=${bestArea}px h=${"%.2f".format(hRatio)} a=${"%.3f".format(areaRatio)} spire=$hasSpire foil=$isFoil grid=$grid",
    )
  }
  return isFoil
}
