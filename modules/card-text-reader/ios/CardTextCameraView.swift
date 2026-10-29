import AVFoundation
import ExpoModulesCore
import Vision

private let minFrameInterval: TimeInterval = 0.12
// why: hiding the outline the moment one read misses the card makes it flicker on a steady card.
private let missesBeforeLosingCard = 3
// why: a little room around the outline keeps a name that touches the card's edge whole.
private let readMargin: CGFloat = 0.03
// why: rejects the art box, the text box, and cards only partly in view.
private let minCardShareOfGuide: CGFloat = 0.4
// why: an MTG card is 63x88. The area inside its border and a stack with a card peeking out
// are also card-like rectangles, but their shapes are further from it than a sleeve's.
private let cardAspect: CGFloat = 63 / 88
private let cardAspectTolerance: CGFloat = 0.07

private enum Rejection: String {
  case shape, position, size
}

class CardTextCameraView: ExpoView, AVCaptureVideoDataOutputSampleBufferDelegate {
  let onText = EventDispatcher()
  var active = false
  var guide: CGRect?

  private let session = AVCaptureSession()
  private let previewLayer: AVCaptureVideoPreviewLayer
  private let outline = CAShapeLayer()
  private let frames = DispatchQueue(label: "card-text-camera.frames")
  private let reads = DispatchQueue(label: "card-text-camera.reads")
  private var reading = false
  private var lastFrameAt = Date.distantPast
  private var missedFrames = 0
  private var outlined = false
  private var viewSize = CGSize.zero
  private var imageSize = CGSize(width: 1080, height: 1920)

  required init(appContext: AppContext? = nil) {
    previewLayer = AVCaptureVideoPreviewLayer(session: session)
    super.init(appContext: appContext)
    previewLayer.videoGravity = .resizeAspectFill
    layer.addSublayer(previewLayer)
    outline.fillColor = nil
    outline.strokeColor = UIColor.systemGreen.cgColor
    outline.lineWidth = 3
    outline.lineJoin = .round
    layer.addSublayer(outline)
    frames.async { [weak self] in self?.configure() }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer.frame = bounds
    outline.frame = bounds
    let size = bounds.size
    frames.async { [weak self] in self?.viewSize = size }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    let visible = window != nil
    frames.async { [weak self] in
      guard let self else { return }
      if visible, !self.session.isRunning { self.session.startRunning() }
      if !visible, self.session.isRunning { self.session.stopRunning() }
    }
  }

  private func configure() {
    guard
      let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
      let input = try? AVCaptureDeviceInput(device: camera)
    else { return }
    let output = AVCaptureVideoDataOutput()
    output.alwaysDiscardsLateVideoFrames = true
    output.setSampleBufferDelegate(self, queue: frames)
    session.beginConfiguration()
    session.sessionPreset = .hd1920x1080
    if session.canAddInput(input) { session.addInput(input) }
    if session.canAddOutput(output) { session.addOutput(output) }
    session.commitConfiguration()
    if window != nil { session.startRunning() }
  }

  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    guard active, let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      if outlined { lose() }
      return
    }
    guard !reading, Date().timeIntervalSince(lastFrameAt) >= minFrameInterval else { return }
    lastFrameAt = Date()
    reading = true
    // why: the back camera delivers landscape buffers; the scanner is locked to portrait,
    // so `.right` makes Vision read them upright and swaps width and height.
    imageSize = CGSize(width: CVPixelBufferGetHeight(buffer), height: CVPixelBufferGetWidth(buffer))
    // why: looking for the card only on the frames that are read keeps the phone from heating up.
    let (card, rectangles) = detect(buffer)
    show(card)
    let size = imageSize
    let detection: [String: Any] = [
      "rectangles": rectangles, "thermal": heat(ProcessInfo.processInfo.thermalState),
    ]
    reads.async { [weak self] in
      self?.read(buffer, size: size, card: card, detection: detection)
      self?.frames.async { self?.reading = false }
    }
  }

  private func detect(_ buffer: CVPixelBuffer) -> (VNRectangleObservation?, [[String: Any]]) {
    let request = VNDetectRectanglesRequest()
    // why: MTG cards are 63x88 (0.716); the range allows for the card being tilted.
    request.minimumAspectRatio = 0.55
    request.maximumAspectRatio = 0.9
    request.minimumSize = 0.25
    request.quadratureTolerance = 25
    request.minimumConfidence = 0.5
    request.maximumObservations = 6
    try? VNImageRequestHandler(cvPixelBuffer: buffer, orientation: .right).perform([request])
    let results = request.results ?? []
    let found = results.filter { rejection($0) == nil }.min {
      abs(widthOverHeight($0) - cardAspect) < abs(widthOverHeight($1) - cardAspect)
    }
    return (found, results.map(describe))
  }

  private func rejection(_ quad: VNRectangleObservation) -> Rejection? {
    guard abs(widthOverHeight(quad) - cardAspect) <= cardAspectTolerance else { return .shape }
    guard let guide, guide.width > 0 else { return nil }
    let points = onScreen(corners(quad))
    guard guide.insetBy(dx: -guide.width * 0.1, dy: -guide.height * 0.1).contains(midpoint(points))
    else { return .position }
    return shareOfGuide(points) < minCardShareOfGuide ? .size : nil
  }

  private func shareOfGuide(_ points: [CGPoint]) -> CGFloat {
    guard let guide, guide.width > 0 else { return 0 }
    return polygonArea(points) / (guide.width * guide.height)
  }

  private func describe(_ quad: VNRectangleObservation) -> [String: Any] {
    var description: [String: Any] = [
      "aspect": Double(widthOverHeight(quad)),
      "share": Double(shareOfGuide(onScreen(corners(quad)))),
    ]
    if let rejected = rejection(quad) { description["rejected"] = rejected.rawValue }
    return description
  }

  private func widthOverHeight(_ quad: VNRectangleObservation) -> CGFloat {
    let points = onScreen(corners(quad))
    let ends = distance(points[0], points[1]) + distance(points[3], points[2])
    let sides = distance(points[0], points[3]) + distance(points[1], points[2])
    return sides > 0 ? ends / sides : 0
  }

  // why: the outline stays up briefly to avoid flicker, but text is only filtered by an outline
  // from this frame, so a card that moved on is never read through its old outline.
  private func show(_ quad: VNRectangleObservation?) {
    guard quad != nil || outlined else { return }
    if quad == nil {
      missedFrames += 1
      if missedFrames < missesBeforeLosingCard { return }
    }
    missedFrames = 0
    draw(quad)
  }

  private func lose() {
    missedFrames = 0
    draw(nil)
  }

  private func draw(_ quad: VNRectangleObservation?) {
    outlined = quad != nil
    let path = quad.map { quad in
      let path = CGMutablePath()
      path.addLines(between: onScreen(corners(quad)))
      path.closeSubpath()
      return path
    }
    DispatchQueue.main.async { [weak self] in
      CATransaction.begin()
      CATransaction.setDisableActions(true)
      self?.outline.path = path
      CATransaction.commit()
    }
  }

  private func onScreen(_ points: [CGPoint]) -> [CGPoint] {
    let scale = max(viewSize.width / imageSize.width, viewSize.height / imageSize.height)
    let dx = (viewSize.width - imageSize.width * scale) / 2
    let dy = (viewSize.height - imageSize.height * scale) / 2
    return points.map {
      CGPoint(x: $0.x * imageSize.width * scale + dx, y: (1 - $0.y) * imageSize.height * scale + dy)
    }
  }

  private func read(
    _ buffer: CVPixelBuffer, size: CGSize, card: VNRectangleObservation?, detection: [String: Any]
  ) {
    let width = Double(size.width)
    let height = Double(size.height)
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    // why: reading only the outlined card roughly halves the work of reading the whole frame.
    let region = card.map(readRegion) ?? CGRect(x: 0, y: 0, width: 1, height: 1)
    request.regionOfInterest = region
    guard (try? VNImageRequestHandler(cvPixelBuffer: buffer, orientation: .right).perform([request])) != nil
    else { return }
    let lines: [[String: Any]] = (request.results ?? []).compactMap { observation in
      guard let candidate = observation.topCandidates(1).first else { return nil }
      // why: Vision reports text inside the region of interest relative to that region.
      let inRegion = observation.boundingBox
      let box = CGRect(
        x: region.minX + inRegion.minX * region.width,
        y: region.minY + inRegion.minY * region.height,
        width: inRegion.width * region.width,
        height: inRegion.height * region.height)
      let dx = (observation.topRight.x - observation.topLeft.x) * region.width * width
      let dy = (observation.topLeft.y - observation.topRight.y) * region.height * height
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
    guard active else { return }
    var photo: [String: Any] = [
      "width": width, "height": height, "lines": lines, "detection": detection,
    ]
    if let card {
      photo["cardCorners"] = corners(card).map { ["x": $0.x * width, "y": (1 - $0.y) * height] }
    }
    onText(photo)
  }
}

private func heat(_ state: ProcessInfo.ThermalState) -> String {
  switch state {
  case .nominal: "nominal"
  case .fair: "fair"
  case .serious: "serious"
  case .critical: "critical"
  @unknown default: "critical"
  }
}

private func readRegion(_ quad: VNRectangleObservation) -> CGRect {
  let points = corners(quad)
  let xs = points.map(\.x)
  let ys = points.map(\.y)
  return CGRect(
    x: xs.min()!, y: ys.min()!, width: xs.max()! - xs.min()!, height: ys.max()! - ys.min()!
  )
  .insetBy(dx: -readMargin, dy: -readMargin)
  .intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
}

private func corners(_ quad: VNRectangleObservation) -> [CGPoint] {
  [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft]
}

private func polygonArea(_ points: [CGPoint]) -> CGFloat {
  abs(zip(points, points.dropFirst() + points.prefix(1))
    .map { $0.x * $1.y - $1.x * $0.y }
    .reduce(0, +)) / 2
}

private func midpoint(_ points: [CGPoint]) -> CGPoint {
  CGPoint(
    x: points.map(\.x).reduce(0, +) / CGFloat(points.count),
    y: points.map(\.y).reduce(0, +) / CGFloat(points.count))
}

private func distance(_ a: CGPoint, _ b: CGPoint) -> CGFloat {
  hypot(a.x - b.x, a.y - b.y)
}
