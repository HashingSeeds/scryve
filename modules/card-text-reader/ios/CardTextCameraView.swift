import AVFoundation
import ExpoModulesCore
import Vision

private let minFrameInterval: TimeInterval = 0.12
// why: detecting is far slower than tracking, so it runs every few frames to catch new cards
// and correct drift while the tracker follows the card on the frames in between.
private let framesBetweenDetections = 6
// why: hiding the outline the moment the tracker slips makes it flicker on a steady card.
private let missesBeforeLosingCard = 3
// why: rejects the art box, the text box, and cards only partly in view.
private let minCardShareOfGuide: CGFloat = 0.4
// why: an MTG card is 63x88. The area inside its border and a stack with a card peeking out
// are also card-like rectangles, but their shapes are further from it than a sleeve's.
private let cardAspect: CGFloat = 63 / 88
private let cardAspectTolerance: CGFloat = 0.07

class CardTextCameraView: ExpoView, AVCaptureVideoDataOutputSampleBufferDelegate {
  let onText = EventDispatcher()
  var active = false
  var guide: CGRect?

  private let session = AVCaptureSession()
  private let previewLayer: AVCaptureVideoPreviewLayer
  private let outline = CAShapeLayer()
  private let frames = DispatchQueue(label: "card-text-camera.frames")
  private let reads = DispatchQueue(label: "card-text-camera.reads")
  private let sequence = VNSequenceRequestHandler()
  private var reading = false
  private var lastFrameAt = Date.distantPast
  private var frameCount = 0
  private var missedFrames = 0
  private var tracking: VNTrackRectangleRequest?
  private var card: VNRectangleObservation?
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
      if card != nil || missedFrames > 0 { lose() }
      return
    }
    // why: the back camera delivers landscape buffers; the scanner is locked to portrait,
    // so `.right` makes Vision read them upright and swaps width and height.
    imageSize = CGSize(width: CVPixelBufferGetHeight(buffer), height: CVPixelBufferGetWidth(buffer))
    frameCount += 1
    if frameCount % (tracking == nil ? 2 : framesBetweenDetections) == 0 {
      detect(buffer)
    } else if tracking != nil {
      track(buffer)
    }
    guard !reading, Date().timeIntervalSince(lastFrameAt) >= minFrameInterval else { return }
    lastFrameAt = Date()
    reading = true
    let size = imageSize
    let card = card
    reads.async { [weak self] in
      self?.read(buffer, size: size, card: card)
      self?.frames.async { self?.reading = false }
    }
  }

  private func detect(_ buffer: CVPixelBuffer) {
    let request = VNDetectRectanglesRequest()
    // why: MTG cards are 63x88 (0.716); the range allows for the card being tilted.
    request.minimumAspectRatio = 0.55
    request.maximumAspectRatio = 0.9
    request.minimumSize = 0.25
    request.quadratureTolerance = 25
    request.minimumConfidence = 0.5
    request.maximumObservations = 6
    try? VNImageRequestHandler(cvPixelBuffer: buffer, orientation: .right).perform([request])
    let found = (request.results ?? []).filter(isCardInGuide).min {
      abs(widthOverHeight($0) - cardAspect) < abs(widthOverHeight($1) - cardAspect)
    }
    guard let found else { return miss() }
    let tracker = VNTrackRectangleRequest(rectangleObservation: found)
    tracker.trackingLevel = .fast
    tracking = tracker
    show(found)
  }

  private func track(_ buffer: CVPixelBuffer) {
    guard let tracking else { return }
    try? sequence.perform([tracking], on: buffer, orientation: .right)
    guard
      let followed = tracking.results?.first as? VNRectangleObservation,
      followed.confidence > 0.3,
      isCardInGuide(followed)
    else {
      self.tracking = nil
      return miss()
    }
    tracking.inputObservation = followed
    show(followed)
  }

  private func isCardInGuide(_ quad: VNRectangleObservation) -> Bool {
    guard abs(widthOverHeight(quad) - cardAspect) <= cardAspectTolerance else { return false }
    guard let guide, guide.width > 0 else { return true }
    let points = onScreen(corners(quad))
    return guide.insetBy(dx: -guide.width * 0.1, dy: -guide.height * 0.1).contains(midpoint(points))
      && polygonArea(points) >= guide.width * guide.height * minCardShareOfGuide
  }

  private func widthOverHeight(_ quad: VNRectangleObservation) -> CGFloat {
    let points = onScreen(corners(quad))
    let ends = distance(points[0], points[1]) + distance(points[3], points[2])
    let sides = distance(points[0], points[3]) + distance(points[1], points[2])
    return sides > 0 ? ends / sides : 0
  }

  // why: the outline stays up briefly to avoid flicker, but text is only filtered by an outline
  // from this frame, so a card that moved on is never read through its old outline.
  private func miss() {
    card = nil
    missedFrames += 1
    if missedFrames >= missesBeforeLosingCard { lose() }
  }

  private func lose() {
    tracking?.isLastFrame = true
    tracking = nil
    missedFrames = 0
    show(nil)
  }

  private func show(_ quad: VNRectangleObservation?) {
    if quad != nil { missedFrames = 0 }
    card = quad
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

  private func read(_ buffer: CVPixelBuffer, size: CGSize, card: VNRectangleObservation?) {
    let width = Double(size.width)
    let height = Double(size.height)
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    guard (try? VNImageRequestHandler(cvPixelBuffer: buffer, orientation: .right).perform([request])) != nil
    else { return }
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
    guard active else { return }
    var photo: [String: Any] = ["width": width, "height": height, "lines": lines]
    if let card {
      photo["cardCorners"] = corners(card).map { ["x": $0.x * width, "y": (1 - $0.y) * height] }
    }
    onText(photo)
  }
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
