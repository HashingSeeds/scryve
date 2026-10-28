import ExpoModulesCore

public class CardTextReaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CardTextReader")

    View(CardTextCameraView.self) {
      Events("onText")

      Prop("active") { (view: CardTextCameraView, active: Bool) in
        view.active = active
      }

      Prop("guide") { (view: CardTextCameraView, guide: [String: Double]?) in
        view.guide = guide.map {
          CGRect(x: $0["x"] ?? 0, y: $0["y"] ?? 0, width: $0["width"] ?? 0, height: $0["height"] ?? 0)
        }
      }
    }
  }
}
