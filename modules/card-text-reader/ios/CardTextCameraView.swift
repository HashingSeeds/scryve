import AVFoundation
import ExpoModulesCore
import Vision

// why: reading text is most of the phone's work, so reads slow down as it heats up, and the
// camera runs at the rate frames are read rather than 30 fps.
private let cameraFramesPerSecond: Int32 = 15
private func secondsBetweenReads(_ state: ProcessInfo.ThermalState) -> TimeInterval {
  switch state {
  case .nominal: 0.12
  case .fair: 0.18
  case .serious: 0.28
  default: 0.45
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
  private var lastFallbackProbeAt = Date.distantPast
  private var motionStartedAt = Date.distantPast
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
      self.motionStartedAt = Date.distantPast
      self.lastFallbackProbeAt = Date()
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
    if bulkMode, waitingForSwap, let accepted = acceptedSignature, let current = signature {
      let motionThreshold: Double = 14.0
      let settleThreshold: Double = 14.0
      let neededStable = 2
      let diffFromAccepted = meanAbsDiff(current, accepted)
      let now = Date()
      if !sawMotion {
        if diffFromAccepted < motionThreshold {
          lastSignature = current
          if now.timeIntervalSince(lastFallbackProbeAt) >= 0.6 {
            lastFallbackProbeAt = now
          } else {
            return
          }
        } else {
          sawMotion = true
          stableFrames = 0
          motionStartedAt = now
          lastSignature = current
          return
        }
      } else {
        let frameDiff = lastSignature.map { meanAbsDiff(current, $0) } ?? 255.0
        lastSignature = current
        if frameDiff < settleThreshold {
          stableFrames += 1
          if stableFrames >= neededStable {
            waitingForSwap = false
            sawMotion = false
            stableFrames = 0
            pendingSceneChanged = true
          } else if now.timeIntervalSince(motionStartedAt) >= 0.45 {
            waitingForSwap = false
            sawMotion = false
            stableFrames = 0
            pendingSceneChanged = true
          } else {
            return
          }
        } else if now.timeIntervalSince(motionStartedAt) >= 0.45 {
          waitingForSwap = false
          sawMotion = false
          stableFrames = 0
          pendingSceneChanged = true
        } else {
          stableFrames = 0
          return
        }
      }
    } else if let current = signature {
      waitingForSwap = false
      sawMotion = false
      stableFrames = 0
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

  private static let foilSetLangRegex = try? NSRegularExpression(
    pattern: "\\b([A-Z0-9]{3,5})(\\s*[^A-Z0-9\\s]?\\s*)(EN|JA|JP|FR|DE|IT|ES|PT|KO|RU)(?:\\b|(?=[A-Z]))"
  )
  private static let ignoredSetTokens: Set<String> = [
    "TM", "WOTC", "LLC", "INC", "USA", "CBS", "THE", "AND", "FOR", "ALL",
    "EN", "JA", "JP", "FR", "DE", "IT", "ES", "PT", "KO", "RU",
  ]

  // why: Vision collapses the tiny M15+ foil star (`★`) into `*`/`+`/`•`. Sampling the luma pixels
  // between the recognized set and language boxes separates the taller pointed star from the dot.
  private func detectFoilStar(
    _ buffer: CVPixelBuffer,
    region: CGRect,
    candidate: VNRecognizedText,
    accurate: Bool
  ) -> Bool {
    let text = candidate.string
    guard let regex = Self.foilSetLangRegex else { return false }
    let nsRange = NSRange(text.startIndex..<text.endIndex, in: text)
    guard
      let match = regex.firstMatch(in: text, range: nsRange),
      let setRange = Range(match.range(at: 1), in: text),
      let sepRange = Range(match.range(at: 2), in: text),
      let langRange = Range(match.range(at: 3), in: text),
      !Self.ignoredSetTokens.contains(String(text[setRange])),
      let setRel = try? candidate.boundingBox(for: setRange)?.boundingBox,
      let langRel = try? candidate.boundingBox(for: langRange)?.boundingBox
    else { return false }

    let toFull: (CGRect) -> CGRect = { r in
      CGRect(
        x: region.minX + r.minX * region.width,
        y: region.minY + r.minY * region.height,
        width: r.width * region.width,
        height: r.height * region.height
      )
    }
    let setBox = toFull(setRel)
    let langBox = toFull(langRel)
    guard langBox.minX > setBox.maxX, CVPixelBufferGetPlaneCount(buffer) > 0 else { return false }

    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddressOfPlane(buffer, 0) else { return false }
    let bytes = base.assumingMemoryBound(to: UInt8.self)
    let rowStride = CVPixelBufferGetBytesPerRowOfPlane(buffer, 0)
    let bufW = CVPixelBufferGetWidthOfPlane(buffer, 0)
    let bufH = CVPixelBufferGetHeightOfPlane(buffer, 0)
    let capH = Double(setBox.height) * Double(bufW)
    guard capH >= 11.0 else { return false }

    func lumaAt(vx: CGFloat, vy: CGFloat) -> Int {
      let bx = max(0, min(bufW - 1, Int(((1 - vy) * CGFloat(bufW - 1)).rounded())))
      let by = max(0, min(bufH - 1, Int(((1 - vx) * CGFloat(bufH - 1)).rounded())))
      return Int(bytes[by * rowStride + bx])
    }

    var refSamples: [Int] = []
    let refMinX = max(0, setBox.minX - setBox.width * 0.1)
    let refMaxX = min(1, setBox.maxX + setBox.width * 0.1)
    let refMinY = max(0, setBox.minY - setBox.height * 0.25)
    let refMaxY = min(1, setBox.maxY + setBox.height * 0.25)
    let refStepsX = min(24, max(6, Int((refMaxX - refMinX) * CGFloat(bufH))))
    let refStepsY = min(16, max(6, Int((refMaxY - refMinY) * CGFloat(bufW))))
    for iy in 0..<refStepsY {
      let vy = refMinY + (refMaxY - refMinY) * CGFloat(iy) / CGFloat(max(1, refStepsY - 1))
      for ix in 0..<refStepsX {
        let vx = refMinX + (refMaxX - refMinX) * CGFloat(ix) / CGFloat(max(1, refStepsX - 1))
        refSamples.append(lumaAt(vx: vx, vy: vy))
      }
    }
    refSamples.sort()
    guard !refSamples.isEmpty else { return false }
    let bg = refSamples[refSamples.count / 6]
    let ink = refSamples[(refSamples.count * 9) / 10]
    let contrast = ink - bg
    guard contrast >= 18 else { return false }
    let thresh = bg + Int(Double(contrast) * 0.45)

    let gx0 = setBox.maxX
    let gx1 = langBox.minX
    let gy0 = max(0, min(setBox.minY, langBox.minY))
    let gy1 = min(1, max(setBox.maxY, langBox.maxY))
    let gapW = max(3, min(28, Int(((gx1 - gx0) * CGFloat(bufH)).rounded())))
    let gapH = max(3, min(28, Int(((gy1 - gy0) * CGFloat(bufW)).rounded())))
    var mask = [Bool](repeating: false, count: gapW * gapH)
    for r in 0..<gapH {
      let vy = gy1 - (gy1 - gy0) * CGFloat(r) / CGFloat(max(1, gapH - 1))
      for c in 0..<gapW {
        let vx = gx0 + (gx1 - gx0) * CGFloat(c) / CGFloat(max(1, gapW - 1))
        mask[r * gapW + c] = lumaAt(vx: vx, vy: vy) >= thresh
      }
    }

    var visited = [Bool](repeating: false, count: gapW * gapH)
    var bestDist = Double.greatestFiniteMagnitude
    var bestArea = 0
    var bestH = 0
    var bestTopWidth = 0
    var bestMaxRowWidth = 0

    for r in 0..<gapH {
      for c in 0..<gapW {
        let start = r * gapW + c
        if !mask[start] || visited[start] { continue }
        var queue = [start]
        var head = 0
        visited[start] = true
        var minR = r
        var maxR = r
        var minC = c
        var maxC = c
        var area = 0
        var rowCounts = [Int](repeating: 0, count: gapH)
        while head < queue.count {
          let pos = queue[head]
          head += 1
          let cr = pos / gapW
          let cc = pos % gapW
          area += 1
          if cr < minR { minR = cr }
          if cr > maxR { maxR = cr }
          if cc < minC { minC = cc }
          if cc > maxC { maxC = cc }
          rowCounts[cr] += 1
          if cr > 0, mask[pos - gapW], !visited[pos - gapW] {
            visited[pos - gapW] = true
            queue.append(pos - gapW)
          }
          if cr + 1 < gapH, mask[pos + gapW], !visited[pos + gapW] {
            visited[pos + gapW] = true
            queue.append(pos + gapW)
          }
          if cc > 0, mask[pos - 1], !visited[pos - 1] {
            visited[pos - 1] = true
            queue.append(pos - 1)
          }
          if cc + 1 < gapW, mask[pos + 1], !visited[pos + 1] {
            visited[pos + 1] = true
            queue.append(pos + 1)
          }
        }
        if minR == 0 || maxR == gapH - 1 || minC == 0 || maxC == gapW - 1 { continue }
        let cy = Double(minR + maxR) / 2.0
        let dist = abs(cy - Double(gapH) / 2.0)
        if dist < bestDist {
          bestDist = dist
          bestArea = area
          bestH = maxR - minR + 1
          bestTopWidth = rowCounts[minR]
          var maxRw = 0
          for rr in minR...maxR where rowCounts[rr] > maxRw { maxRw = rowCounts[rr] }
          bestMaxRowWidth = maxRw
        }
      }
    }

    let sep = text[sepRange]
    let sepIsStar = sep.contains("*") || sep.contains("★") || sep.contains("☆")
    let hasBlob = bestArea > 0
    let hRatio = hasBlob ? Double(bestH) / capH : 0.0
    let areaRatio = hasBlob ? Double(bestArea) / (capH * capH) : 0.0
    let hasSpire = hasBlob && bestH >= 6 && Double(bestTopWidth) <= Double(bestMaxRowWidth) * 0.5
    let pixelStar = hasBlob && capH >= 12.0 && hRatio >= 0.37 && areaRatio >= 0.075 && hasSpire
    let corroboratedStar =
      accurate &&
      sepIsStar &&
      capH >= 12.0 &&
      (!hasBlob || gapW <= 5 || (hRatio >= 0.30 && areaRatio >= 0.06))
    return pixelStar || corroboratedStar
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
      var item: [String: Any] = [
        "text": candidate.string,
        "x": box.minX * width,
        "y": (1 - box.maxY) * height,
        "width": box.width * width,
        "height": box.height * height,
        "angle": atan2(dy, dx) * 180 / .pi,
        "confidence": Double(candidate.confidence),
      ]
      if detectFoilStar(buffer, region: region, candidate: candidate, accurate: level == .accurate) {
        item["foilStar"] = true
      }
      return item
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
      // why: derive title and collector bands along the card's oriented edges so tilted cards stay unclipped.
      let tl = card.topLeft
      let tr = card.topRight
      let bl = card.bottomLeft
      let br = card.bottomRight
      let lerp: (CGPoint, CGPoint, CGFloat) -> CGPoint = { a, b, t in
        CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t)
      }
      let boundingBand: ([CGPoint]) -> CGRect = { points in
        let minX = points.map(\.x).min() ?? 0
        let maxX = points.map(\.x).max() ?? 1
        let minY = points.map(\.y).min() ?? 0
        let maxY = points.map(\.y).max() ?? 1
        return CGRect(
          x: minX - readMargin,
          y: minY - readMargin,
          width: (maxX - minX) + readMargin * 2,
          height: (maxY - minY) + readMargin * 2
        ).intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
      }
      let topBand = boundingBand([
        tl,
        tr,
        lerp(tl, bl, topBandShare),
        lerp(tr, br, topBandShare),
      ])
      let bottomBand = boundingBand([
        lerp(tl, bl, 1 - bottomBandShare),
        lerp(tr, br, 1 - bottomBandShare),
        bl,
        br,
      ])
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
