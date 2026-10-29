import ExpoModulesCore

public class CardTextReaderModule: Module {
  // why: a generator kept alive and prepared plays at once; one made per tap can lag or drop
  // while the camera and text reading keep the phone busy.
  private lazy var addedHaptic = UIImpactFeedbackGenerator(style: .medium)
  private lazy var skippedHaptic = UINotificationFeedbackGenerator()

  public func definition() -> ModuleDefinition {
    Name("CardTextReader")

    AsyncFunction("prepareHaptics") {
      self.addedHaptic.prepare()
      self.skippedHaptic.prepare()
    }.runOnQueue(.main)

    AsyncFunction("haptic") { (kind: String) in
      if kind == "skipped" {
        self.skippedHaptic.notificationOccurred(.error)
        self.skippedHaptic.prepare()
      } else {
        self.addedHaptic.impactOccurred()
        self.addedHaptic.prepare()
      }
    }.runOnQueue(.main)

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
