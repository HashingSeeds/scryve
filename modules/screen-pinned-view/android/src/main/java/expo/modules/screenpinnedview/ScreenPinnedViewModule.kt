package expo.modules.screenpinnedview

import android.view.View
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ScreenPinnedViewModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ScreenPinnedView")

    View(ScreenPinnedView::class) {
      Events("onOrientationChange")

      // Fabric mounts React children into the rotor instead of the host.
      GroupView<ScreenPinnedView> {
        AddChildView { parent, child: View, index -> parent.rotor.addView(child, index) }
        GetChildCount { parent -> parent.rotor.childCount }
        GetChildViewAt { parent, index -> parent.rotor.getChildAt(index) }
        RemoveChildView { parent, child: View -> parent.rotor.removeView(child) }
        RemoveChildViewAt { parent, index -> parent.rotor.removeViewAt(index) }
      }
    }
  }
}
