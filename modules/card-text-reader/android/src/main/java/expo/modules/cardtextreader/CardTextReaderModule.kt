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
        view.setGuideBox(
          guide?.mapValues { it.value.toFloat() }?.let {
            Box(it.getValue("x"), it.getValue("y"), it.getValue("width"), it.getValue("height"))
          },
        )
      }

      Prop("torch") { view: CardTextCameraView, torch: Boolean? ->
        view.setTorch(torch ?: false)
      }

      Prop("scanMode") { view: CardTextCameraView, mode: String? ->
        view.setScanMode(mode ?: "handheld")
      }

      Prop("acceptedToken") { view: CardTextCameraView, token: Int? ->
        view.setAcceptedToken(token ?: 0)
      }

      OnViewDestroys { view -> view.release() }
    }
  }
}
