package expo.modules.cardtextreader

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CardTextReaderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CardTextReader")

    // why: ML Kit has no minimum text height, so the second argument only matches the iOS signature.
    AsyncFunction("readPhoto") { uri: String, _: Double?, promise: Promise ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      // why: fromFilePath applies the photo's EXIF turn, so boxes are in the upright image.
      val image = InputImage.fromFilePath(context, Uri.parse(uri))
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      recognizer.process(image)
        .addOnSuccessListener { text ->
          val lines = text.textBlocks.flatMap { it.lines }.mapNotNull { line ->
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
          promise.resolve(mapOf("width" to image.width, "height" to image.height, "lines" to lines))
        }
        .addOnFailureListener { promise.reject("ERR_READ_PHOTO", it.message, it) }
        .addOnCompleteListener { recognizer.close() }
    }

    View(CardTextCameraView::class) {
      Events("onText")

      Prop("active") { view: CardTextCameraView, active: Boolean ->
        view.active = active
      }

      Prop("guide") { view: CardTextCameraView, guide: Map<String, Double>? ->
        view.guide = guide?.mapValues { it.value.toFloat() }?.let {
          Box(it.getValue("x"), it.getValue("y"), it.getValue("width"), it.getValue("height"))
        }
      }

      OnViewDestroys { view -> view.release() }
    }
  }
}
