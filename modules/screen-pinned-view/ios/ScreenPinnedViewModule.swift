import ExpoModulesCore

public class ScreenPinnedViewModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ScreenPinnedView")

    View(ScreenPinnedView.self) {
      Events("onOrientationChange")
    }
  }
}
