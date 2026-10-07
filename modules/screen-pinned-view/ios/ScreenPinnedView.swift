import ExpoModulesCore
import UIKit

/// Hosts React children in a rotor that stays fixed to the screen hardware while UIKit rotates
/// the window. The rotor is sized to the hardware portrait bounds, centered on the window, and
/// turned to cancel the interface rotation inside the same animation UIKit uses to rotate.
final class ScreenPinnedView: ExpoView {
  let onOrientationChange = EventDispatcher()

  private let rotor = ScreenPinnedRotorView()
  private let transitionObserver = ScreenPinnedTransitionObserver()
  /// Unwrapped rotor angle in radians, clockwise in window space. Kept unwrapped so a 180 degree
  /// turn can pick the same direction as the window.
  private var rotorAngle: CGFloat = 0
  private var transitioning = false
  private var lastMetrics: NSDictionary?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = false
    rotor.clipsToBounds = false
    addSubview(rotor)
    transitionObserver.host = self
  }

  // MARK: - Fabric children go into the rotor

  override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    rotor.insertSubview(childComponentView, at: index)
  }

  override func unmountChildComponentView(_ childComponentView: UIView, index: Int) {
    childComponentView.removeFromSuperview()
  }

  // MARK: - Lifecycle

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      detachTransitionObserver()
    } else {
      attachTransitionObserver()
      updateRotor(during: nil)
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    updateRotor(during: nil)
  }

  /// The rotor can extend past a host whose Fabric frame is still the pre-rotation size.
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    guard isUserInteractionEnabled, !isHidden, alpha > 0.01 else { return nil }
    return rotor.hitTest(rotor.convert(point, from: self), with: event)
  }

  // MARK: - Rotation

  fileprivate func windowWillTransition(with coordinator: UIViewControllerTransitionCoordinator) {
    transitioning = true
    let queued = coordinator.animate(
      alongsideTransition: { [weak self] context in
        self?.updateRotor(during: context)
      },
      completion: { [weak self] _ in
        self?.transitioning = false
        self?.updateRotor(during: nil)
      })
    if !queued {
      transitioning = false
      updateRotor(during: nil)
    }
  }

  /// Places the rotor. `transition` is set only inside UIKit's rotation animation block, where
  /// changes animate with the window. Outside a transition this also reports metrics to JS.
  private func updateRotor(during transition: UIViewControllerTransitionCoordinatorContext?) {
    guard let window, let screen = window.windowScene?.screen else { return }
    let fixed = screen.fixedCoordinateSpace
    let hardware = fixed.bounds.size
    let windowSize = window.bounds.size
    let pinned =
      abs(min(windowSize.width, windowSize.height) - min(hardware.width, hardware.height)) < 1
      && abs(max(windowSize.width, windowSize.height) - max(hardware.width, hardware.height)) < 1

    if pinned {
      rotor.bounds = CGRect(origin: .zero, size: hardware)
      rotor.center = convert(CGPoint(x: window.bounds.midX, y: window.bounds.midY), from: window)
      // A Fabric relayout mid-rotation lands here too; leave the angle to the transition block.
      if transition != nil || !transitioning {
        var target = interfaceAngle(fixed: fixed, window: window)
        let windowDelta = transition.map { atan2($0.targetTransform.b, $0.targetTransform.a) }
        if let windowDelta, abs(windowDelta) > 0.01, sameAngle(target, rotorAngle) {
          // Fallback in case the fixed space has not caught up yet: undo UIKit's own delta.
          NSLog("[ScreenPinnedView] fixed coordinate space unchanged inside transition; using targetTransform")
          target = rotorAngle - windowDelta
        }
        setRotorAngle(target, windowDelta: windowDelta, duration: transition?.transitionDuration ?? 0)
      }
    } else {
      rotorAngle = 0
      rotor.transform = .identity
      rotor.frame = bounds
    }

    if transition == nil && !transitioning {
      reportMetrics(window: window, pinned: pinned)
    }
  }

  /// Angle of the hardware's x axis in window space. UIKit owns the sign: no orientation table.
  private func interfaceAngle(fixed: UICoordinateSpace, window: UIWindow) -> CGFloat {
    let origin = fixed.convert(CGPoint.zero, to: window)
    let xAxis = fixed.convert(CGPoint(x: 1, y: 0), to: window)
    let angle = atan2(xAxis.y - origin.y, xAxis.x - origin.x)
    return (angle / (.pi / 2)).rounded() * (.pi / 2)
  }

  private func setRotorAngle(_ target: CGFloat, windowDelta: CGFloat?, duration: TimeInterval) {
    // The window turns by windowDelta, so the rotor turns the opposite way.
    let reference = rotorAngle - (windowDelta ?? 0)
    let turns = ((reference - target) / (2 * .pi)).rounded()
    let next = target + turns * 2 * .pi
    let step = next - rotorAngle
    if windowDelta != nil && abs(step) > .pi / 2 + 0.01 {
      // A matrix animation cannot tell +180 from -180, so pass through the midpoint.
      let start = rotorAngle
      UIView.animateKeyframes(withDuration: duration, delay: 0, options: [.calculationModeLinear]) {
        UIView.addKeyframe(withRelativeStartTime: 0, relativeDuration: 0.5) {
          self.rotor.transform = CGAffineTransform(rotationAngle: start + step / 2)
        }
        UIView.addKeyframe(withRelativeStartTime: 0.5, relativeDuration: 0.5) {
          self.rotor.transform = CGAffineTransform(rotationAngle: next)
        }
      }
    } else {
      rotor.transform = CGAffineTransform(rotationAngle: next)
    }
    rotorAngle = windowDelta == nil ? normalized(next) : next
  }

  // MARK: - Metrics

  private func reportMetrics(window: UIWindow, pinned: Bool) {
    let steps = pinned ? quarterTurns(rotorAngle) : 0
    let insets: UIEdgeInsets
    if !pinned {
      insets = window.safeAreaInsets
    } else if steps == 0 {
      insets = window.safeAreaInsets
      UprightInsets.remember(insets, screen: rotor.bounds.size)
    } else {
      insets =
        UprightInsets.recall(screen: rotor.bounds.size)
        ?? UprightInsets.estimate(turned: window.safeAreaInsets)
    }
    let holderAngle = pinned ? -steps * 90 : 0
    let metrics: [String: Any] = [
      "pinned": pinned,
      "holderAngle": holderAngle == -180 ? 180 : holderAngle,
      "width": rotor.bounds.width,
      "height": rotor.bounds.height,
      "insets": [
        "top": insets.top,
        "right": insets.right,
        "bottom": insets.bottom,
        "left": insets.left,
      ],
    ]
    if lastMetrics?.isEqual(to: metrics) == true { return }
    lastMetrics = metrics as NSDictionary
    onOrientationChange(metrics)
  }

  /// Quarter turns in -1...2, so -90 degrees is -1 and 180 degrees is 2.
  private func quarterTurns(_ angle: CGFloat) -> Int {
    let turns = Int((normalized(angle) / (.pi / 2)).rounded())
    return turns == -2 ? 2 : turns
  }

  private func normalized(_ angle: CGFloat) -> CGFloat {
    atan2(sin(angle), cos(angle))
  }

  private func sameAngle(_ a: CGFloat, _ b: CGFloat) -> Bool {
    abs(normalized(a - b)) < 0.01
  }

  // MARK: - Transition observer

  private func attachTransitionObserver() {
    guard let parent = nearestViewController() else {
      NSLog("[ScreenPinnedView] no view controller in the responder chain; rotation will not be pinned")
      return
    }
    if transitionObserver.parent === parent { return }
    detachTransitionObserver()
    parent.addChild(transitionObserver)
    addSubview(transitionObserver.view)
    transitionObserver.didMove(toParent: parent)
  }

  private func detachTransitionObserver() {
    guard transitionObserver.parent != nil else { return }
    transitionObserver.willMove(toParent: nil)
    transitionObserver.view.removeFromSuperview()
    transitionObserver.removeFromParent()
  }

  private func nearestViewController() -> UIViewController? {
    var responder: UIResponder? = next
    while let current = responder {
      if let controller = current as? UIViewController { return controller }
      responder = current.next
    }
    return nil
  }
}

/// Insets of the upright hardware, which the pinned board keeps in every orientation. iOS reports
/// symmetric landscape insets, so converting those would move the board's padding on every
/// rotation. Saved per screen size so a game opened while the phone is turned uses them too.
private enum UprightInsets {
  static func remember(_ insets: UIEdgeInsets, screen: CGSize) {
    let value = NSCoder.string(for: insets)
    if UserDefaults.standard.string(forKey: key(screen)) != value {
      UserDefaults.standard.set(value, forKey: key(screen))
    }
  }

  static func recall(screen: CGSize) -> UIEdgeInsets? {
    UserDefaults.standard.string(forKey: key(screen)).map(NSCoder.uiEdgeInsets(for:))
  }

  /// Before the phone has ever been upright: the sensor housing takes the larger side inset and
  /// the home indicator keeps the bottom one.
  static func estimate(turned insets: UIEdgeInsets) -> UIEdgeInsets {
    UIEdgeInsets(top: max(insets.left, insets.right), left: 0, bottom: insets.bottom, right: 0)
  }

  private static func key(_ screen: CGSize) -> String {
    "ScreenPinnedView.uprightInsets.\(Int(screen.width))x\(Int(screen.height))"
  }
}

/// Holds the React children. Never a touch target itself, like `pointerEvents="box-none"`.
private final class ScreenPinnedRotorView: UIView {
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let hit = super.hitTest(point, with: event)
    return hit === self ? nil : hit
  }
}

/// Invisible child view controller whose only job is to receive the window's size transition,
/// which UIKit forwards from the root controller down through child controllers.
private final class ScreenPinnedTransitionObserver: UIViewController {
  weak var host: ScreenPinnedView?

  override func loadView() {
    let placeholder = UIView(frame: .zero)
    placeholder.isHidden = true
    placeholder.isUserInteractionEnabled = false
    view = placeholder
  }

  override func viewWillTransition(
    to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator
  ) {
    super.viewWillTransition(to: size, with: coordinator)
    host?.windowWillTransition(with: coordinator)
  }
}
