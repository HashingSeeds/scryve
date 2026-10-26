import AVFoundation
import ExpoModulesCore
import Vision

private let minFrameInterval: TimeInterval = 0.12

class CardTextCameraView: ExpoView, AVCaptureVideoDataOutputSampleBufferDelegate {
  let onText = EventDispatcher()
  var active = false

  private let session = AVCaptureSession()
  private let previewLayer: AVCaptureVideoPreviewLayer
  private let frames = DispatchQueue(label: "card-text-camera.frames")
  private var lastFrameAt = Date.distantPast

  required init(appContext: AppContext? = nil) {
    previewLayer = AVCaptureVideoPreviewLayer(session: session)
    super.init(appContext: appContext)
    previewLayer.videoGravity = .resizeAspectFill
    layer.addSublayer(previewLayer)
    frames.async { [weak self] in self?.configure() }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer.frame = bounds
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
    guard
      active,
      Date().timeIntervalSince(lastFrameAt) >= minFrameInterval,
      let buffer = CMSampleBufferGetImageBuffer(sampleBuffer)
    else { return }
    lastFrameAt = Date()
    // why: the back camera delivers landscape buffers; the scanner is locked to portrait,
    // so `.right` makes Vision read them upright and swaps width and height.
    let width = Double(CVPixelBufferGetHeight(buffer))
    let height = Double(CVPixelBufferGetWidth(buffer))
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
    onText(["width": width, "height": height, "lines": lines])
  }
}
