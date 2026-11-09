import ExpoModulesCore
import ImageIO
import Vision

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

    AsyncFunction("readPhoto") { (uri: URL, minimumTextHeight: Double?) -> [String: Any] in
      try readPhoto(uri, minimumTextHeight: minimumTextHeight)
    }

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

private struct UnreadablePhoto: Error {}

/** why: a phone photo is stored sideways with an EXIF turn, so Vision reads it upright and the boxes match what is shown. */
private func readPhoto(_ uri: URL, minimumTextHeight: Double?) throws -> [String: Any] {
  guard
    let source = CGImageSourceCreateWithURL(uri as CFURL, nil),
    let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
  else { throw UnreadablePhoto() }
  let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
  let orientation = (properties?[kCGImagePropertyOrientation] as? UInt32)
    .flatMap(CGImagePropertyOrientation.init(rawValue:)) ?? .up
  let sideways = [.left, .right, .leftMirrored, .rightMirrored].contains(orientation)
  let width = Double(sideways ? image.height : image.width)
  let height = Double(sideways ? image.width : image.height)
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = false
  if let minimumTextHeight { request.minimumTextHeight = Float(minimumTextHeight) }
  try VNImageRequestHandler(cgImage: image, orientation: orientation).perform([request])
  let lines: [[String: Any]] = (request.results ?? []).compactMap { observation in
    guard let candidate = observation.topCandidates(1).first else { return nil }
    let box = observation.boundingBox
    let dx = (observation.topRight.x - observation.topLeft.x) * width
    let dy = (observation.topLeft.y - observation.topRight.y) * height
    return [
      "text": candidate.string,
      "x": box.minX * width,
      "y": (1 - box.maxY) * height,
      "width": box.width * width,
      "height": box.height * height,
      "angle": atan2(dy, dx) * 180 / .pi,
      "confidence": Double(candidate.confidence),
    ]
  }
  return ["width": width, "height": height, "lines": lines]
}
