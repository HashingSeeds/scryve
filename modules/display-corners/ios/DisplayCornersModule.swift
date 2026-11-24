import ExpoModulesCore
import UIKit

// iOS has no public API for the display's corner radius, so this reports the model identifier and
// the TypeScript side looks the radius up (src/iosDisplayCorners.ts).
public class DisplayCornersModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DisplayCorners")

    Constants([
      "modelIdentifier": Self.modelIdentifier,
      // Display Zoom draws fewer points per pixel, so a radius in points shrinks with it.
      "pointScale": UIScreen.main.scale / UIScreen.main.nativeScale,
    ])
  }

  private static let modelIdentifier: String = {
    if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] {
      return simulated
    }
    var info = utsname()
    uname(&info)
    return withUnsafeBytes(of: &info.machine) {
      String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self)
    }
  }()
}
