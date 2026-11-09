import CoreImage
import Foundation
import Vision

let args = Array(CommandLine.arguments.dropFirst())
let step = Double(args[0])!
let grid = Int(args[1])!
let context = CIContext()
var out: [String: Any] = [:]
for path in args.dropFirst(2) {
  let original = CIImage(
    contentsOf: URL(fileURLWithPath: path), options: [.applyOrientationProperty: true])!
  let extent = original.extent
  let start = Date()
  var lines: [[String: Any]] = []
  for degrees in stride(from: 0.0, to: 360.0, by: step) {
    let turn = CGAffineTransform(rotationAngle: degrees * .pi / 180)
    let turned = original.transformed(by: turn)
    let box = turned.extent
    let shifted = turned.transformed(by: CGAffineTransform(translationX: -box.minX, y: -box.minY))
    let back = turn.inverted()
    // why: Vision shrinks a big photo to a fixed size, so small names only survive in smaller
    // tiles. Tiles overlap by 20% so a name cut by one tile's edge is whole in its neighbour.
    let tileW = box.width / (CGFloat(grid) - CGFloat(grid - 1) * 0.2)
    let tileH = box.height / (CGFloat(grid) - CGFloat(grid - 1) * 0.2)
    for row in 0..<grid {
      for col in 0..<grid {
        let tile = CGRect(
          x: CGFloat(col) * tileW * 0.8, y: CGFloat(row) * tileH * 0.8, width: tileW, height: tileH)
        let cg = context.createCGImage(shifted, from: tile)!
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        try! VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
        for observation in request.results ?? [] {
          guard let text = observation.topCandidates(1).first?.string else { continue }
          let b = observation.boundingBox
          let center = CGPoint(
            x: tile.minX + b.midX * tile.width + box.minX,
            y: tile.minY + b.midY * tile.height + box.minY
          ).applying(back)
          lines.append([
            "text": text, "x": center.x - extent.minX, "y": extent.height - (center.y - extent.minY),
            "h": b.height * tile.height,
          ])
        }
      }
    }
  }
  out[(path as NSString).lastPathComponent] = [
    "ms": Int(Date().timeIntervalSince(start) * 1000), "lines": lines,
  ]
}
print(String(data: try! JSONSerialization.data(withJSONObject: out), encoding: .utf8)!)
