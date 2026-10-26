package expo.modules.cardtextreader

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val ERROR = "ERR_CARD_TEXT_READ"

class CardTextReaderModule : Module() {
  private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

  override fun definition() = ModuleDefinition {
    Name("CardTextReader")

    OnDestroy { recognizer.close() }

    AsyncFunction("read") { uri: String, promise: Promise ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val image = try {
        InputImage.fromFilePath(context, Uri.parse(uri))
      } catch (error: Exception) {
        promise.reject(CodedException(ERROR, error.message ?: "Could not open the photo", error))
        return@AsyncFunction
      }
      recognizer.process(image)
        .addOnSuccessListener { text ->
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
          promise.resolve(mapOf("width" to image.width, "height" to image.height, "lines" to lines))
        }
        .addOnFailureListener { error ->
          promise.reject(CodedException(ERROR, error.message ?: "Could not read the photo", error))
        }
    }
  }
}
