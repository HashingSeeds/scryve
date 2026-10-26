import ExpoModulesCore

public class CardTextReaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CardTextReader")

    View(CardTextCameraView.self) {
      Events("onText")

      Prop("active") { (view: CardTextCameraView, active: Bool) in
        view.active = active
      }
    }
  }
}
