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
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.FocusMeteringAction
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
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.nio.ByteBuffer
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.launch

// why: reading text is most of the phone's work, so reads slow down as it heats up.
private fun msBetweenReads(heat: String) = when (heat) {
  "nominal" -> 120L
  "fair" -> 180L
  "serious" -> 280L
  else -> 450L
}
private val ANALYSIS_SIZE = Size(1280, 960)
private const val DETECTION_SHORT_SIDE = 200
private const val READ_MARGIN = 0.04f
// why: hiding the outline the first frame the card is missed makes it flicker on a steady card,
// but reads slow down when the phone is hot, so a count of misses would leave it up too long.
private const val LOSE_CARD_AFTER_MS = 350L
// why: frames are read at most about 8 a second, so 30 fps only heats the phone.
private val CAMERA_FPS = Range(12, 15)

class CardTextCameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onText by EventDispatcher()
  private val previewView = PreviewView(context).apply {
    scaleType = PreviewView.ScaleType.FILL_CENTER
  }
  private val outline = CardOutline(context)
  private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
  private val analysisExecutor = Executors.newSingleThreadExecutor()
  private val motionGate = CardMotionGate()
  private var cameraProvider: ProcessCameraProvider? = null
  private var camera: Camera? = null
  private var useCases: UseCaseGroup? = null
  private var lastFrameAt = 0L
  private var released = false
  private var plane = ByteArray(0)
  private val detectorScratch = CardDetectorScratch()
  private var topNv21Buffer: ByteArray? = null
  private var bottomNv21Buffer: ByteArray? = null
  private var lastCardAt = 0L
  private var showingCard = false
  private var pendingSceneChanged = false
  private var focusedGuide = false

  @Volatile var active = false
  @Volatile var torchEnabled = false
  @Volatile var bulkMode = false

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

  fun setGuideBox(box: Box?) {
    guide = box
    if (!focusedGuide && box != null) {
      appContext.mainQueue.launch { applyFocusPoint() }
    }
  }

  private fun applyFocusPoint() {
    val activeCamera = camera ?: return
    val currentGuide = guide ?: return
    if (released || width <= 0 || height <= 0) return
    val density = resources.displayMetrics.density
    val cx = (currentGuide.x + currentGuide.width / 2f) * density
    val cy = (currentGuide.y + currentGuide.height / 2f) * density
    val point = previewView.meteringPointFactory.createPoint(cx, cy)
    // why: seed AF/AE on the card guide box then auto-cancel so continuous autofocus keeps tracking as a stack shrinks.
    val action = FocusMeteringAction.Builder(
      point,
      FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE,
    )
      .setAutoCancelDuration(2, TimeUnit.SECONDS)
      .build()
    focusedGuide = true
    activeCamera.cameraControl.startFocusAndMetering(action)
  }

  fun setTorch(on: Boolean) {
    torchEnabled = on
    appContext.mainQueue.launch {
      camera?.cameraControl?.enableTorch(on && !released)
    }
  }

  fun setScanMode(mode: String) {
    bulkMode = mode == "bulk"
  }

  fun setAcceptedToken(token: Int) {
    motionGate.onAccepted(token)
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
    camera = provider.bindToLifecycle(activity, CameraSelector.DEFAULT_BACK_CAMERA, group)
    camera?.cameraControl?.enableTorch(torchEnabled && !released)
    cameraProvider = provider
    useCases = group
    applyFocusPoint()
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

  private fun serializeLines(
    text: Text?,
    shiftX: Int,
    shiftY: Int,
    rotation: Int,
    foilBytes: ByteArray? = null,
    foilRowStride: Int = 0,
    foilWidth: Int = 0,
    foilHeight: Int = 0,
    isCroppedBand: Boolean = false,
  ): List<Map<String, Any>> {
    if (text == null) return emptyList()
    return text.textBlocks.flatMap { block -> block.lines }.mapNotNull { line ->
      val box = line.boundingBox ?: return@mapNotNull null
      val item = mutableMapOf<String, Any>(
        "text" to line.text,
        "x" to box.left + shiftX,
        "y" to box.top + shiftY,
        "width" to box.width(),
        "height" to box.height(),
        // why: ML Kit reports angles against the sensor but boxes against the upright frame.
        "angle" to uprightAngle(line.angle + rotation),
        "confidence" to line.confidence,
      )
      if (
        foilBytes != null &&
          detectFoilStarInLine(
            line,
            foilBytes,
            foilRowStride,
            foilWidth,
            foilHeight,
            rotation,
            isCroppedBand,
          )
      ) {
        item["foilStar"] = true
      }
      item
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
    val luma = extractLuma(frame, rotation)
    val gate = motionGate.evaluate(luma, bulkMode)
    if (gate.sceneChanged) pendingSceneChanged = true
    if (!gate.shouldRead) {
      frame.close()
      return
    }
    val detection = findCard(luma, width, height)
    val card = detection.card
    if (card != null) {
      val (topCrop, bottomCrop) = cropCardBands(card.corners, frame.width, frame.height, rotation, READ_MARGIN)
      val topBytes = nv21(image, topCrop, topNv21Buffer).also { topNv21Buffer = it }
      val bottomBytes = nv21(image, bottomCrop, bottomNv21Buffer).also { bottomNv21Buffer = it }
      val topInput = InputImage.fromByteBuffer(
        ByteBuffer.wrap(topBytes, 0, topCrop.width * topCrop.height * 3 / 2),
        topCrop.width,
        topCrop.height,
        rotation,
        InputImage.IMAGE_FORMAT_NV21,
      )
      val bottomInput = InputImage.fromByteBuffer(
        ByteBuffer.wrap(bottomBytes, 0, bottomCrop.width * bottomCrop.height * 3 / 2),
        bottomCrop.width,
        bottomCrop.height,
        rotation,
        InputImage.IMAGE_FORMAT_NV21,
      )
      val topTask = recognizer.process(topInput)
      val bottomTask = recognizer.process(bottomInput)
      Tasks.whenAllComplete(topTask, bottomTask)
        .addOnCompleteListener {
          try {
            if (!active) return@addOnCompleteListener
            val topText = if (topTask.isSuccessful) topTask.result else null
            val bottomText = if (bottomTask.isSuccessful) bottomTask.result else null
            val photo = mutableMapOf<String, Any>(
              "width" to width,
              "height" to height,
              "lines" to serializeLines(topText, topCrop.uprightX, topCrop.uprightY, rotation),
              "bottomLines" to serializeLines(
                bottomText,
                bottomCrop.uprightX,
                bottomCrop.uprightY,
                rotation,
                foilBytes = bottomBytes,
                foilRowStride = bottomCrop.width,
                foilWidth = bottomCrop.width,
                foilHeight = bottomCrop.height,
                isCroppedBand = true,
              ),
              "detection" to mapOf("rectangles" to detection.rectangles.map(::describe), "thermal" to heat),
              "cardCorners" to card.corners.map { mapOf("x" to it.x, "y" to it.y) },
            )
            if (pendingSceneChanged) {
              photo["sceneChanged"] = true
              pendingSceneChanged = false
            }
            onText(photo)
          } finally {
            frame.close()
          }
        }
    } else {
      val yPlane = frame.planes[0]
      val yRowStride = yPlane.rowStride
      val frameW = frame.width
      val frameH = frame.height
      val input = InputImage.fromMediaImage(image, rotation)
      recognizer.process(input)
        .addOnSuccessListener { text ->
          if (!active) return@addOnSuccessListener
          val photo = mutableMapOf<String, Any>(
            "width" to width,
            "height" to height,
            "lines" to serializeLines(
              text,
              0,
              0,
              rotation,
              foilBytes = plane,
              foilRowStride = yRowStride,
              foilWidth = frameW,
              foilHeight = frameH,
              isCroppedBand = false,
            ),
            "bottomLines" to emptyList<Map<String, Any>>(),
            "detection" to mapOf("rectangles" to detection.rectangles.map(::describe), "thermal" to heat),
          )
          if (pendingSceneChanged) {
            photo["sceneChanged"] = true
            pendingSceneChanged = false
          }
          onText(photo)
        }
        .addOnCompleteListener { frame.close() }
    }
  }

  private fun extractLuma(frame: ImageProxy, rotation: Int): Luma {
    val y = frame.planes[0]
    val buffer = y.buffer.duplicate().apply { rewind() }
    if (plane.size < buffer.remaining()) plane = ByteArray(buffer.remaining())
    buffer.get(plane, 0, buffer.remaining())
    val step = maxOf(1, minOf(frame.width, frame.height) / DETECTION_SHORT_SIDE)
    return lumaFromPlane(plane, y.rowStride, frame.width, frame.height, rotation, step, detectorScratch)
  }

  private fun findCard(luma: Luma, width: Int, height: Int): CardDetection {
    val cover = cover(width, height)
    val guide = guide?.let { guide -> cover?.toFrame(guide, resources.displayMetrics.density) }
    val detection = CardDetector.detect(luma, guide, detectorScratch)
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
    torchEnabled = false
    pendingSceneChanged = false
    motionGate.reset()
    camera?.cameraControl?.enableTorch(false)
    camera = null
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

  fun show(corners: List<Point>?) {
    path = corners?.let { points ->
      Path().apply {
        moveTo(points[0].x, points[0].y)
        for (index in 1 until points.size) lineTo(points[index].x, points[index].y)
        close()
      }
    }
    postInvalidate()
  }

  override fun onDraw(canvas: Canvas) {
    path?.let { canvas.drawPath(it, paint) }
  }
}
