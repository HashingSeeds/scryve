package expo.modules.cardtextreader

import android.content.Context
import android.os.SystemClock
import android.util.Size
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
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.util.concurrent.Executors

private const val MIN_FRAME_INTERVAL_MS = 120L
private val ANALYSIS_SIZE = Size(1280, 960)

class CardTextCameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onText by EventDispatcher()
  private val previewView = PreviewView(context).apply {
    scaleType = PreviewView.ScaleType.FILL_CENTER
  }
  private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
  private val analysisExecutor = Executors.newSingleThreadExecutor()
  private var cameraProvider: ProcessCameraProvider? = null
  private var useCases: UseCaseGroup? = null
  private var lastFrameAt = 0L
  private var released = false

  @Volatile var active = false

  init {
    addView(previewView, 0)
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({ bind(future.get()) }, ContextCompat.getMainExecutor(context))
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    previewView.layout(0, 0, right - left, bottom - top)
  }

  private fun bind(provider: ProcessCameraProvider) {
    if (released) return
    val activity = appContext.currentActivity as? AppCompatActivity ?: return
    // why: preview and analysis share one aspect ratio, so the frame drawn over the preview
    // maps onto the analyzed image with a single cover scale in JS.
    val fourByThree = AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY
    val preview = Preview.Builder()
      .setResolutionSelector(ResolutionSelector.Builder().setAspectRatioStrategy(fourByThree).build())
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

  @androidx.annotation.OptIn(ExperimentalGetImage::class)
  private fun analyze(frame: ImageProxy) {
    val image = frame.image
    val now = SystemClock.elapsedRealtime()
    if (!active || image == null || now - lastFrameAt < MIN_FRAME_INTERVAL_MS) {
      frame.close()
      return
    }
    lastFrameAt = now
    val rotation = frame.imageInfo.rotationDegrees
    val sideways = rotation == 90 || rotation == 270
    val width = if (sideways) frame.height else frame.width
    val height = if (sideways) frame.width else frame.height
    recognizer.process(InputImage.fromMediaImage(image, rotation))
      .addOnSuccessListener { text ->
        if (!active) return@addOnSuccessListener
        val lines = text.textBlocks.flatMap { block -> block.lines }.mapNotNull { line ->
          val box = line.boundingBox ?: return@mapNotNull null
          mapOf(
            "text" to line.text,
            "x" to box.left,
            "y" to box.top,
            "width" to box.width(),
            "height" to box.height(),
            "angle" to line.angle,
            "confidence" to line.confidence,
          )
        }
        onText(mapOf("width" to width, "height" to height, "lines" to lines))
      }
      .addOnCompleteListener { frame.close() }
  }

  fun release() {
    released = true
    active = false
    useCases?.let { group -> cameraProvider?.unbind(*group.useCases.toTypedArray()) }
    recognizer.close()
    analysisExecutor.shutdown()
  }
}
