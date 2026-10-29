package expo.modules.cardtextreader

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.util.Range
import android.util.Size
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.UseCaseGroup
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.lifecycle.awaitInstance
import androidx.camera.view.PreviewView
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.util.concurrent.Executors
import kotlinx.coroutines.launch

// why: reading text is most of the phone's work, so reads slow down as it heats up.
private fun msBetweenReads(heat: String) = when (heat) {
  "nominal" -> 120L
  "fair" -> 160L
  "serious" -> 250L
  else -> 400L
}
private val ANALYSIS_SIZE = Size(1280, 960)
private const val DETECTION_SHORT_SIDE = 200
private const val READ_MARGIN = 0.03f
// why: hiding the outline the first frame the card is missed makes it flicker on a steady card,
// but reads slow down when the phone is hot, so a count of misses would leave it up too long.
private const val LOSE_CARD_AFTER_MS = 350L
// why: frames are read at most about 8 a second, so 30 fps only heats the phone.
private val CAMERA_FPS = Range(15, 20)

class CardTextCameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onText by EventDispatcher()
  private val previewView = PreviewView(context).apply {
    scaleType = PreviewView.ScaleType.FILL_CENTER
  }
  private val outline = CardOutline(context)
  private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
  private val analysisExecutor = Executors.newSingleThreadExecutor()
  private var cameraProvider: ProcessCameraProvider? = null
  private var useCases: UseCaseGroup? = null
  private var lastFrameAt = 0L
  private var released = false
  private var plane = ByteArray(0)
  private var lastCardAt = 0L
  private var showingCard = false

  @Volatile var active = false

  /** why: in view points, as React Native lays it out, not pixels. */
  @Volatile var guide: Box? = null

  init {
    // why: React Native never lays out native children, and PreviewView adds its drawing
    // surface only after the camera binds, so without this the preview stays black.
    previewView.setOnHierarchyChangeListener(object : OnHierarchyChangeListener {
      override fun onChildViewRemoved(parent: View?, child: View?) = Unit
      override fun onChildViewAdded(parent: View?, child: View?) = layOutPreview()
    })
    addView(previewView, 0)
    addView(outline, 1)
    appContext.mainQueue.launch { bind(ProcessCameraProvider.awaitInstance(context)) }
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    super.onMeasure(widthMeasureSpec, heightMeasureSpec)
    measureChild(previewView, widthMeasureSpec, heightMeasureSpec)
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    layOutPreview()
  }

  private fun layOutPreview() {
    previewView.measure(
      MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
      MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY),
    )
    previewView.layout(0, 0, width, height)
    outline.layout(0, 0, width, height)
  }

  private fun bind(provider: ProcessCameraProvider) {
    if (released) return
    val activity = appContext.currentActivity as? AppCompatActivity ?: return
    // why: preview and analysis share one aspect ratio, so the frame drawn over the preview
    // maps onto the analyzed image with a single cover scale in JS.
    val fourByThree = AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY
    val preview = Preview.Builder()
      .setResolutionSelector(ResolutionSelector.Builder().setAspectRatioStrategy(fourByThree).build())
      .setTargetFrameRate(CAMERA_FPS)
      .build()
      .also { it.surfaceProvider = previewView.surfaceProvider }
    val analysis = ImageAnalysis.Builder()
      .setResolutionSelector(
        ResolutionSelector.Builder()
          .setAspectRatioStrategy(fourByThree)
          .setResolutionStrategy(
            ResolutionStrategy(ANALYSIS_SIZE, ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER),
          )
          .build(),
      )
      .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
      .build()
      .also { it.setAnalyzer(analysisExecutor, ::analyze) }
    val group = UseCaseGroup.Builder().addUseCase(preview).addUseCase(analysis).build()
    provider.unbindAll()
    provider.bindToLifecycle(activity, CameraSelector.DEFAULT_BACK_CAMERA, group)
    cameraProvider = provider
    useCases = group
  }

  private fun heat(): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return "nominal"
    val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return "nominal"
    return when (power.currentThermalStatus) {
      PowerManager.THERMAL_STATUS_NONE -> "nominal"
      PowerManager.THERMAL_STATUS_LIGHT -> "fair"
      PowerManager.THERMAL_STATUS_MODERATE -> "serious"
      else -> "critical"
    }
  }

  @androidx.annotation.OptIn(ExperimentalGetImage::class)
  private fun analyze(frame: ImageProxy) {
    val image = frame.image
    val now = SystemClock.elapsedRealtime()
    val heat = heat()
    if (!active && showingCard) lose()
    if (!active || image == null || now - lastFrameAt < msBetweenReads(heat)) {
      frame.close()
      return
    }
    lastFrameAt = now
    val rotation = frame.imageInfo.rotationDegrees
    val sideways = rotation == 90 || rotation == 270
    val width = if (sideways) frame.height else frame.width
    val height = if (sideways) frame.width else frame.height
    val detection = findCard(frame, rotation, width, height)
    // why: reading only the outlined card is most of the work saved on a phone that runs hot.
    val crop = detection.card?.let { cropAround(it.corners, frame.width, frame.height, rotation, READ_MARGIN) }
    val input = if (crop == null) {
      InputImage.fromMediaImage(image, rotation)
    } else {
      InputImage.fromByteArray(nv21(image, crop), crop.width, crop.height, rotation, InputImage.IMAGE_FORMAT_NV21)
    }
    val shiftX = crop?.uprightX ?: 0
    val shiftY = crop?.uprightY ?: 0
    recognizer.process(input)
      .addOnSuccessListener { text ->
        if (!active) return@addOnSuccessListener
        val lines = text.textBlocks.flatMap { block -> block.lines }.mapNotNull { line ->
          val box = line.boundingBox ?: return@mapNotNull null
          mapOf(
            "text" to line.text,
            "x" to box.left + shiftX,
            "y" to box.top + shiftY,
            "width" to box.width(),
            "height" to box.height(),
            // why: ML Kit reports angles against the sensor but boxes against the upright frame.
            "angle" to uprightAngle(line.angle + rotation),
            "confidence" to line.confidence,
          )
        }
        val photo = mutableMapOf(
          "width" to width,
          "height" to height,
          "lines" to lines,
          "detection" to mapOf("rectangles" to detection.rectangles.map(::describe), "thermal" to heat),
        )
        detection.card?.let { card -> photo["cardCorners"] = card.corners.map { mapOf("x" to it.x, "y" to it.y) } }
        onText(photo)
      }
      .addOnCompleteListener { frame.close() }
  }

  private fun findCard(frame: ImageProxy, rotation: Int, width: Int, height: Int): CardDetection {
    val y = frame.planes[0]
    val buffer = y.buffer.duplicate().apply { rewind() }
    if (plane.size < buffer.remaining()) plane = ByteArray(buffer.remaining())
    buffer.get(plane, 0, buffer.remaining())
    val step = maxOf(1, minOf(frame.width, frame.height) / DETECTION_SHORT_SIDE)
    val luma = lumaFromPlane(plane, y.rowStride, frame.width, frame.height, rotation, step)
    val cover = cover(width, height)
    val guide = guide?.let { guide -> cover?.toFrame(guide, resources.displayMetrics.density) }
    val detection = CardDetector.detect(luma, guide)
    val card = detection.card
    if (card != null && cover != null) {
      lastCardAt = SystemClock.elapsedRealtime()
      showingCard = true
      outline.show(card.corners.map(cover::toView))
    } else if (showingCard && SystemClock.elapsedRealtime() - lastCardAt >= LOSE_CARD_AFTER_MS) {
      lose()
    }
    return detection
  }

  private fun lose() {
    showingCard = false
    outline.show(null)
  }

  /** why: matches PreviewView's FILL_CENTER, so the outline lands on the card in the preview. */
  private fun cover(frameWidth: Int, frameHeight: Int): Cover? {
    if (width == 0 || height == 0) return null
    val scale = maxOf(width.toFloat() / frameWidth, height.toFloat() / frameHeight)
    return Cover(scale, (width - frameWidth * scale) / 2, (height - frameHeight * scale) / 2)
  }

  fun release() {
    released = true
    active = false
    useCases?.let { group -> cameraProvider?.unbind(*group.useCases.toTypedArray()) }
    recognizer.close()
    analysisExecutor.shutdown()
  }
}

private fun uprightAngle(degrees: Float) = ((degrees + 540f) % 360f) - 180f

private fun describe(rectangle: Rectangle): Map<String, Any> {
  val description = mapOf("aspect" to rectangle.aspect.toDouble(), "share" to rectangle.share.toDouble())
  return rectangle.rejected?.let { description + ("rejected" to it.label) } ?: description
}

private class Cover(val scale: Float, val dx: Float, val dy: Float) {
  fun toView(point: Point) = Point(point.x * scale + dx, point.y * scale + dy)

  fun toFrame(box: Box, density: Float) =
    Box((box.x * density - dx) / scale, (box.y * density - dy) / scale, box.width * density / scale, box.height * density / scale)
}

private class CardOutline(context: Context) : View(context) {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    color = Color.rgb(52, 199, 89)
    strokeWidth = 3 * resources.displayMetrics.density
    strokeJoin = Paint.Join.ROUND
  }
  private var path: Path? = null

  fun show(corners: List<Point>?) = post {
    path = corners?.let {
      Path().apply {
        moveTo(it[0].x, it[0].y)
        it.drop(1).forEach { corner -> lineTo(corner.x, corner.y) }
        close()
      }
    }
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    path?.let { canvas.drawPath(it, paint) }
  }
}
