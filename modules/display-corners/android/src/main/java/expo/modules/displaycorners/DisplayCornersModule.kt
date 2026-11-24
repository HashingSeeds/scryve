package expo.modules.displaycorners

import android.os.Build
import android.view.RoundedCorner
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private val CORNERS = intArrayOf(
  RoundedCorner.POSITION_TOP_LEFT,
  RoundedCorner.POSITION_TOP_RIGHT,
  RoundedCorner.POSITION_BOTTOM_RIGHT,
  RoundedCorner.POSITION_BOTTOM_LEFT,
)

class DisplayCornersModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DisplayCorners")

    // Radii in dp of the window's corners, [top left, top right, bottom right, bottom left], or
    // null below Android 12 or when the display reports no rounded corners.
    Function("windowCornerRadii") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@Function null
      val activity = appContext.currentActivity ?: return@Function null
      val insets = activity.window.decorView.rootWindowInsets ?: return@Function null
      val density = activity.resources.displayMetrics.density
      val radii = CORNERS.map { position ->
        insets.getRoundedCorner(position)?.radius?.takeIf { it > 0 }?.let { it / density.toDouble() }
      }
      if (radii.all { it == null }) null else radii
    }
  }
}
