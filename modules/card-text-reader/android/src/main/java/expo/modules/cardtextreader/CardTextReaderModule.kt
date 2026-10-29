package expo.modules.cardtextreader

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CardTextReaderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CardTextReader")

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
