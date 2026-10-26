import ExpoModulesCore
import UIKit
import Vision

private let readError = "ERR_CARD_TEXT_READ"

public class CardTextReaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CardTextReader")

    AsyncFunction("read") { (url: URL, promise: Promise) in
      guard let image = UIImage(contentsOfFile: url.path), let cgImage = image.cgImage else {
        promise.reject(readError, "Could not open the photo")
        return
      }
      let orientation = CGImagePropertyOrientation(image.imageOrientation)
      let sideways = [.left, .leftMirrored, .right, .rightMirrored].contains(orientation)
      let width = Double(sideways ? cgImage.height : cgImage.width)
      let height = Double(sideways ? cgImage.width : cgImage.height)

      let request = VNRecognizeTextRequest { request, error in
        if let error {
          promise.reject(readError, error.localizedDescription)
          return
        }
        let observations = request.results as? [VNRecognizedTextObservation] ?? []
        let lines: [[String: Any]] = observations.compactMap { observation in
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
        promise.resolve(["width": width, "height": height, "lines": lines])
      }
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = false

      DispatchQueue.global(qos: .userInitiated).async {
        do {
          try VNImageRequestHandler(cgImage: cgImage, orientation: orientation).perform([request])
        } catch {
          promise.reject(readError, error.localizedDescription)
        }
      }
    }
  }
}

private extension CGImagePropertyOrientation {
  init(_ orientation: UIImage.Orientation) {
    switch orientation {
    case .up: self = .up
    case .upMirrored: self = .upMirrored
    case .down: self = .down
    case .downMirrored: self = .downMirrored
    case .left: self = .left
    case .leftMirrored: self = .leftMirrored
    case .right: self = .right
    case .rightMirrored: self = .rightMirrored
    @unknown default: self = .up
    }
  }
}
