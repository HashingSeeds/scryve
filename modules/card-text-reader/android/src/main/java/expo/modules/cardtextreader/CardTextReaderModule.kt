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

      OnViewDestroys { view -> view.release() }
    }
  }
}
