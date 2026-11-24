import ExpoModulesCore

public class CardTextReaderModule: Module {
  // why: a generator kept alive and prepared plays at once; one made per tap can lag or drop
  // while the camera and text reading keep the phone busy.
  private lazy var addedHaptic = UIImpactFeedbackGenerator(style: .medium)
  private lazy var hitHaptic = UIImpactFeedbackGenerator(style: .heavy)
  private lazy var notificationHaptic = UINotificationFeedbackGenerator()

  public func definition() -> ModuleDefinition {
    Name("CardTextReader")

    AsyncFunction("prepareHaptics") {
      self.addedHaptic.prepare()
      self.hitHaptic.prepare()
      self.notificationHaptic.prepare()
    }.runOnQueue(.main)

    AsyncFunction("haptic") { (kind: String) in
      switch kind {
      case "skipped":
        self.notificationHaptic.notificationOccurred(.error)
        self.notificationHaptic.prepare()
      case "bigHit":
        self.notificationHaptic.notificationOccurred(.success)
        self.hitHaptic.impactOccurred()
        self.notificationHaptic.prepare()
        self.hitHaptic.prepare()
      case "hit":
        self.hitHaptic.impactOccurred()
        self.hitHaptic.prepare()
      default:
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
        view.setGuide(guide.map {
          CGRect(x: $0["x"] ?? 0, y: $0["y"] ?? 0, width: $0["width"] ?? 0, height: $0["height"] ?? 0)
        })
      }

      Prop("torch") { (view: CardTextCameraView, torch: Bool?) in
        view.setTorch(torch ?? false)
      }

      Prop("scanMode") { (view: CardTextCameraView, mode: String?) in
        view.setScanMode(mode ?? "handheld")
      }

      Prop("acceptedToken") { (view: CardTextCameraView, token: Int?) in
        view.setAcceptedToken(token ?? 0)
      }
    }
  }
}
