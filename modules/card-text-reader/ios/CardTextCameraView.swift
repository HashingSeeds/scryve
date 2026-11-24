import AVFoundation
import ExpoModulesCore
import Vision

// why: reading text is most of the phone's work, so reads slow down as it heats up, and the
// camera runs at the rate frames are read rather than 30 fps.
private let cameraFramesPerSecond: Int32 = 20
private func secondsBetweenReads(_ state: ProcessInfo.ThermalState) -> TimeInterval {
  switch state {
  case .nominal: 0.07
  case .fair: 0.12
  case .serious: 0.20
  default: 0.35
  }
}
// why: hiding the outline the moment one read misses the card makes it flicker on a steady card,
// but reads slow down when the phone is hot, so a count of misses would leave it up too long.
private let loseCardAfter: TimeInterval = 0.35
// why: a little room around the outline keeps a name that touches the card's edge whole.
private let readMargin: CGFloat = 0.03
// why: rejects the art box, the text box, and cards only partly in view.
private let minCardShareOfGuide: CGFloat = 0.4
// why: an MTG card is 63x88. The area inside its border and a stack with a card peeking out
// are also card-like rectangles, but their shapes are further from it than a sleeve's.
private let cardAspect: CGFloat = 63 / 88
private let cardAspectTolerance: CGFloat = 0.07
private let topBandShare: CGFloat = 0.24
private let bottomBandShare: CGFloat = 0.20
private let fastConfidenceFloor: Float = 0.65
private let sigCols = 16
private let sigRows = 22

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
  private var device: AVCaptureDevice?
  private var torchEnabled = false
  private var bulkMode = false
  private var acceptedToken = 0
  private var waitingForSwap = false
  private var sawMotion = false
  private var stableFrames = 0
  private var pendingSceneChanged = false
  private var acceptedSignature: [UInt8]?
  private var lastSignature: [UInt8]?
  private var reading = false
  private var lastFrameAt = Date.distantPast
  private var lastCardAt = Date.distantPast
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

  func setGuide(_ rect: CGRect?) {
    frames.async { [weak self] in
      self?.guide = rect
      self?.applyFocusPoint()
    }
  }

  func setTorch(_ on: Bool) {
    frames.async { [weak self] in
      guard let self else { return }
      self.torchEnabled = on
      self.applyTorch()
    }
  }

  func setScanMode(_ mode: String) {
    frames.async { [weak self] in
      self?.bulkMode = (mode == "bulk")
    }
  }

  func setAcceptedToken(_ token: Int) {
    frames.async { [weak self] in
      guard let self, token > self.acceptedToken else { return }
      self.acceptedToken = token
      self.acceptedSignature = self.lastSignature
      self.waitingForSwap = self.acceptedSignature != nil
      self.sawMotion = false
      self.stableFrames = 0
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer.frame = bounds
    outline.frame = bounds
    let size = bounds.size
    frames.async { [weak self] in
      self?.viewSize = size
      self?.applyFocusPoint()
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    let visible = window != nil
    frames.async { [weak self] in
      guard let self else { return }
      if visible, !self.session.isRunning {
        self.session.startRunning()
        self.applyTorch()
      }
      if !visible, self.session.isRunning {
        self.torchEnabled = false
        self.applyTorch()
        self.session.stopRunning()
      }
    }
  }

  private func pickBackCamera() -> AVCaptureDevice? {
    // why: triple/dual-wide virtual cameras auto-switch to macro when holding a card close.
    return AVCaptureDevice.default(.builtInTripleCamera, for: .video, position: .back)
      ?? AVCaptureDevice.default(.builtInDualWideCamera, for: .video, position: .back)
      ?? AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
  }

  private func configure() {
    guard
      let camera = pickBackCamera(),
      let input = try? AVCaptureDeviceInput(device: camera)
    else { return }
    device = camera
    let output = AVCaptureVideoDataOutput()
    output.alwaysDiscardsLateVideoFrames = true
    output.setSampleBufferDelegate(self, queue: frames)
    session.beginConfiguration()
    session.sessionPreset = .hd1920x1080
    if session.canAddInput(input) { session.addInput(input) }
    if session.canAddOutput(output) { session.addOutput(output) }
    if (try? camera.lockForConfiguration()) != nil {
      camera.activeVideoMinFrameDuration = CMTime(value: 1, timescale: cameraFramesPerSecond)
      camera.activeVideoMaxFrameDuration = CMTime(value: 1, timescale: cameraFramesPerSecond)
      if camera.isFocusModeSupported(.continuousAutoFocus) {
        camera.focusMode = .continuousAutoFocus
      }
      if camera.isExposureModeSupported(.continuousAutoExposure) {
        camera.exposureMode = .continuousAutoExposure
      }
      camera.unlockForConfiguration()
    }
    session.commitConfiguration()
    applyFocusPoint()
    if window != nil {
      session.startRunning()
      applyTorch()
    }
  }

  private func applyTorch() {
    guard let camera = device, camera.hasTorch else { return }
    if (try? camera.lockForConfiguration()) != nil {
      let desired: AVCaptureDevice.TorchMode = (torchEnabled && window != nil) ? .on : .off
      if camera.isTorchModeSupported(desired) {
        camera.torchMode = desired
      }
      camera.unlockForConfiguration()
    }
  }

  private func applyFocusPoint() {
    guard let camera = device, let guide, viewSize.width > 0, viewSize.height > 0 else { return }
    let point = CGPoint(x: guide.midY / viewSize.height, y: 1 - guide.midX / viewSize.width)
    if (try? camera.lockForConfiguration()) != nil {
      if camera.isFocusPointOfInterestSupported {
        camera.focusPointOfInterest = point
        if camera.isFocusModeSupported(.continuousAutoFocus) {
          camera.focusMode = .continuousAutoFocus
        }
      }
      if camera.isExposurePointOfInterestSupported {
        camera.exposurePointOfInterest = point
        if camera.isExposureModeSupported(.continuousAutoExposure) {
          camera.exposureMode = .continuousAutoExposure
        }
      }
      camera.unlockForConfiguration()
    }
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
    let thermalState = ProcessInfo.processInfo.thermalState
    guard !reading, Date().timeIntervalSince(lastFrameAt) >= secondsBetweenReads(thermalState)
    else { return }
    lastFrameAt = Date()
    // why: the back camera delivers landscape buffers; the scanner is locked to portrait,
    // so `.right` makes Vision read them upright and swaps width and height.
    imageSize = CGSize(width: CVPixelBufferGetHeight(buffer), height: CVPixelBufferGetWidth(buffer))

    let signature = sampleLumaSignature(buffer)
    if waitingForSwap, let accepted = acceptedSignature, let current = signature {
      let motionThreshold: Double = bulkMode ? 14.0 : 18.0
      let neededStable = bulkMode ? 2 : 1
      let diffFromAccepted = meanAbsDiff(current, accepted)
      if !sawMotion {
        if diffFromAccepted < motionThreshold {
          lastSignature = current
          return
        }
        sawMotion = true
        stableFrames = 0
        lastSignature = current
        return
      }
      let frameDiff = lastSignature.map { meanAbsDiff(current, $0) } ?? 255.0
      lastSignature = current
      if frameDiff < 10.0 {
        stableFrames += 1
        if stableFrames >= neededStable {
          waitingForSwap = false
          sawMotion = false
          stableFrames = 0
          pendingSceneChanged = true
        } else {
          return
        }
      } else {
        stableFrames = 0
        return
      }
    } else if let current = signature {
      lastSignature = current
    }

    reading = true
    let sceneChanged = pendingSceneChanged
    pendingSceneChanged = false
    // why: looking for the card only on the frames that are read keeps the phone from heating up.
    let (card, rectangles) = detect(buffer)
    show(card)
    let size = imageSize
    let detection: [String: Any] = [
      "rectangles": rectangles, "thermal": heat(thermalState),
    ]
    reads.async { [weak self] in
      self?.read(buffer, size: size, card: card, detection: detection, sceneChanged: sceneChanged)
      self?.frames.async { self?.reading = false }
    }
  }

  private func sampleLumaSignature(_ buffer: CVPixelBuffer) -> [UInt8]? {
    guard CVPixelBufferGetPlaneCount(buffer) > 0 else { return nil }
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddressOfPlane(buffer, 0) else { return nil }
    let bytes = base.assumingMemoryBound(to: UInt8.self)
    let rowStride = CVPixelBufferGetBytesPerRowOfPlane(buffer, 0)
    let planeWidth = CVPixelBufferGetWidthOfPlane(buffer, 0)
    let planeHeight = CVPixelBufferGetHeightOfPlane(buffer, 0)
    guard planeWidth > sigCols, planeHeight > sigRows else { return nil }

    var out = [UInt8](repeating: 0, count: sigCols * sigRows)
    let xStart = planeWidth / 6
    let xSpan = (planeWidth * 2) / 3
    let yStart = planeHeight / 6
    let ySpan = (planeHeight * 2) / 3
    for row in 0..<sigRows {
      let y = yStart + (row * ySpan) / sigRows
      for col in 0..<sigCols {
        let x = xStart + (col * xSpan) / sigCols
        out[row * sigCols + col] = bytes[y * rowStride + x]
      }
    }
    return out
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
    if quad != nil { lastCardAt = Date() }
    if quad == nil, Date().timeIntervalSince(lastCardAt) < loseCardAfter { return }
    draw(quad)
  }

  private func lose() {
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

  private func recognize(
    _ buffer: CVPixelBuffer,
    region: CGRect,
    level: VNRequestTextRecognitionLevel,
    size: CGSize
  ) -> ([[String: Any]], Float) {
    let width = Double(size.width)
    let height = Double(size.height)
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = level
    request.usesLanguageCorrection = false
    request.regionOfInterest = region
    guard (try? VNImageRequestHandler(cvPixelBuffer: buffer, orientation: .right).perform([request])) != nil
    else { return ([], 0) }
    var bestConfidence: Float = 0
    let lines: [[String: Any]] = (request.results ?? []).compactMap { observation in
      guard let candidate = observation.topCandidates(1).first else { return nil }
      if candidate.confidence > bestConfidence { bestConfidence = candidate.confidence }
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
    return (lines, bestConfidence)
  }

  private func read(
    _ buffer: CVPixelBuffer,
    size: CGSize,
    card: VNRectangleObservation?,
    detection: [String: Any],
    sceneChanged: Bool
  ) {
    let width = Double(size.width)
    let height = Double(size.height)
    var topLines: [[String: Any]]
    var bottomLines: [[String: Any]] = []

    if let card {
      let region = readRegion(card)
      // why: reading only title + collector-bar bands skips rules/flavor text and cuts latency/heat.
      let topBand = CGRect(
        x: region.minX,
        y: max(0, region.maxY - region.height * topBandShare),
        width: region.width,
        height: region.height * topBandShare
      ).intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
      let bottomBand = CGRect(
        x: region.minX,
        y: region.minY,
        width: region.width,
        height: region.height * bottomBandShare
      ).intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
      let (fastLines, bestConf) = recognize(buffer, region: topBand, level: .fast, size: size)
      if fastLines.isEmpty || bestConf < fastConfidenceFloor {
        topLines = recognize(buffer, region: topBand, level: .accurate, size: size).0
      } else {
        topLines = fastLines
      }
      bottomLines = recognize(buffer, region: bottomBand, level: .accurate, size: size).0
    } else {
      topLines = recognize(buffer, region: CGRect(x: 0, y: 0, width: 1, height: 1), level: .fast, size: size).0
    }

    guard active else { return }
    var photo: [String: Any] = [
      "width": width,
      "height": height,
      "lines": topLines,
      "bottomLines": bottomLines,
      "detection": detection,
    ]
    if sceneChanged { photo["sceneChanged"] = true }
    if let card {
      photo["cardCorners"] = corners(card).map { ["x": $0.x * width, "y": (1 - $0.y) * height] }
    }
    onText(photo)
  }
}

private func meanAbsDiff(_ a: [UInt8], _ b: [UInt8]) -> Double {
  let count = min(a.count, b.count)
  guard count > 0 else { return 255.0 }
  var sum = 0
  for i in 0..<count {
    sum += abs(Int(a[i]) - Int(b[i]))
  }
  return Double(sum) / Double(count)
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
