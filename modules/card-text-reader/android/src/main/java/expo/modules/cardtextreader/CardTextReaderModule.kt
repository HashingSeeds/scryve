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

      // why: only iOS tracks the card so far; Android keeps reading inside the fixed frame.
      Prop("guide") { _: CardTextCameraView, _: Map<String, Double>? -> }

      OnViewDestroys { view -> view.release() }
    }
  }
}
