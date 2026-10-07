package expo.modules.screenpinnedview

import android.app.Activity
import android.content.Context
import android.content.res.Configuration
import android.graphics.Point
import android.os.Build
import android.view.Surface
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.WindowInsets
import android.view.WindowManager
import com.facebook.react.uimanager.PointerEvents
import com.facebook.react.uimanager.ReactPointerEventsView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Hosts React children in a rotor that stays fixed to the screen hardware while Android rotates
 * the window. The rotor is placed before every draw from `display.rotation` and the window size,
 * so the first frame after a rotation is already correct, and the window uses seamless rotation
 * while a pinned view is attached so the system does not animate the old frame.
 */
class ScreenPinnedView(context: Context, appContext: AppContext) :
  ExpoView(context, appContext), ViewTreeObserver.OnPreDrawListener {
  private val onOrientationChange by EventDispatcher()

  val rotor = ScreenPinnedRotor(context)
  private var observedTree: ViewTreeObserver? = null
  private var seamlessActivity: Activity? = null
  private val windowLocation = IntArray(2)

  /** Panel facts read once per attach or configuration change instead of every frame. */
  private var panel: Panel? = null

  // Last reported state, so unchanged frames skip building the event.
  private var reported = false
  private var reportedPinned = false
  private var reportedHolderAngle = 0
  private var reportedWidth = 0
  private var reportedHeight = 0
  private var reportedInsets: WindowInsets? = null

  init {
    clipChildren = false
    clipToPadding = false
    addView(rotor)
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(
      MeasureSpec.getSize(widthMeasureSpec),
      MeasureSpec.getSize(heightMeasureSpec)
    )
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    pin()
  }

  override fun onConfigurationChanged(newConfig: Configuration?) {
    super.onConfigurationChanged(newConfig)
    panel = null
    reported = false
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    panel = null
    observedTree = viewTreeObserver.also { it.addOnPreDrawListener(this) }
    appContext.currentActivity?.let {
      SeamlessRotation.acquire(it)
      seamlessActivity = it
    }
    pin()
  }

  override fun onDetachedFromWindow() {
    observedTree?.takeIf { it.isAlive }?.removeOnPreDrawListener(this)
    observedTree = null
    seamlessActivity?.let { SeamlessRotation.release(it) }
    seamlessActivity = null
    reported = false
    reportedInsets = null
    super.onDetachedFromWindow()
  }

  override fun onPreDraw(): Boolean {
    pin()
    return true
  }

  private fun pin() {
    val root = rootView ?: return
    val display = display ?: return
    val windowWidth = root.width
    val windowHeight = root.height
    if (windowWidth == 0 || windowHeight == 0) return

    val panel = panel ?: readPanel(display).also { panel = it }
    val shortSide = panel.shortSide
    val longSide = panel.longSide
    val multiWindow = appContext.currentActivity?.isInMultiWindowMode == true
    val fullScreen = !multiWindow &&
      abs(min(windowWidth, windowHeight) - shortSide) <= 2 &&
      abs(max(windowWidth, windowHeight) - longSide) <= 2

    if (!fullScreen) {
      placeRotor(0, 0, width, height, 0f)
      report(pinned = false, holderAngle = 0, root)
      return
    }

    // Naturally landscape tablets pin to their portrait rotation (270 unless the OEM
    // reverses it) instead of 0.
    val holderAngle = normalizedDegrees(
      rotationDegrees(display.rotation) - if (panel.naturalLandscape) 270 else 0
    )
    // display.rotation can change a frame before the window is resized; wait until they agree.
    if ((holderAngle % 180 != 0) != (windowWidth > windowHeight)) return

    getLocationInWindow(windowLocation)
    val centerX = windowWidth / 2f - windowLocation[0]
    val centerY = windowHeight / 2f - windowLocation[1]
    val left = (centerX - shortSide / 2f).roundToInt()
    val top = (centerY - longSide / 2f).roundToInt()
    placeRotor(left, top, left + shortSide, top + longSide, -holderAngle.toFloat())
    report(pinned = true, holderAngle = holderAngle, root)
  }

  private fun placeRotor(left: Int, top: Int, right: Int, bottom: Int, rotation: Float) {
    if (rotor.left != left || rotor.top != top || rotor.right != right || rotor.bottom != bottom) {
      rotor.measure(
        MeasureSpec.makeMeasureSpec(right - left, MeasureSpec.EXACTLY),
        MeasureSpec.makeMeasureSpec(bottom - top, MeasureSpec.EXACTLY)
      )
      rotor.layout(left, top, right, bottom)
    }
    if (rotor.rotation != rotation) rotor.rotation = rotation
  }

  private fun report(pinned: Boolean, holderAngle: Int, root: android.view.View) {
    val rootInsets = root.rootWindowInsets
    if (
      reported &&
      pinned == reportedPinned &&
      holderAngle == reportedHolderAngle &&
      rotor.width == reportedWidth &&
      rotor.height == reportedHeight &&
      rootInsets == reportedInsets
    ) return
    reported = true
    reportedPinned = pinned
    reportedHolderAngle = holderAngle
    reportedWidth = rotor.width
    reportedHeight = rotor.height
    reportedInsets = rootInsets

    val density = resources.displayMetrics.density
    val window = windowInsets(rootInsets)
    // Rotor edge i faces window edge (i + quarter turns) in [top, right, bottom, left] order.
    val turns = ((-holderAngle / 90) % 4 + 4) % 4
    val edge = { index: Int -> window[(index + turns) % 4] / density }
    val metrics = mapOf(
      "pinned" to pinned,
      "holderAngle" to holderAngle,
      "width" to rotor.width / density,
      "height" to rotor.height / density,
      "insets" to mapOf(
        "top" to edge(0),
        "right" to edge(1),
        "bottom" to edge(2),
        "left" to edge(3)
      )
    )
    onOrientationChange(metrics)
  }

  /** Window insets in px, ordered [top, right, bottom, left]. */
  private fun windowInsets(insets: WindowInsets?): IntArray {
    if (insets == null) return IntArray(4)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
      return intArrayOf(bars.top, bars.right, bars.bottom, bars.left)
    }
    @Suppress("DEPRECATION")
    return intArrayOf(
      insets.systemWindowInsetTop,
      insets.systemWindowInsetRight,
      insets.systemWindowInsetBottom,
      insets.systemWindowInsetLeft
    )
  }

  private class Panel(val shortSide: Int, val longSide: Int, val naturalLandscape: Boolean)

  /**
   * The natural orientation comes from the current rotation and size. Display.Mode is not enough:
   * it can stay landscape when the natural orientation is portrait, for example under a display
   * size override, and then the rotation check in pin() never passes.
   */
  private fun readPanel(display: android.view.Display): Panel {
    val hardware = realDisplaySize()
    val turned = display.rotation == Surface.ROTATION_90 || display.rotation == Surface.ROTATION_270
    return Panel(
      shortSide = min(hardware.x, hardware.y),
      longSide = max(hardware.x, hardware.y),
      naturalLandscape = (hardware.x > hardware.y) != turned
    )
  }

  private fun realDisplaySize(): Point {
    val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val bounds = windowManager.maximumWindowMetrics.bounds
      return Point(bounds.width(), bounds.height())
    }
    @Suppress("DEPRECATION")
    return Point().also { windowManager.defaultDisplay.getRealSize(it) }
  }

  private fun rotationDegrees(rotation: Int) = when (rotation) {
    Surface.ROTATION_90 -> 90
    Surface.ROTATION_180 -> 180
    Surface.ROTATION_270 -> 270
    else -> 0
  }

  /** Maps degrees to -90, 0, 90 or 180. */
  private fun normalizedDegrees(degrees: Int): Int {
    val wrapped = ((degrees % 360) + 360) % 360
    return if (wrapped == 270) -90 else wrapped
  }
}

/** Holds the React children. Fabric positions them, and the rotor itself never takes touches. */
class ScreenPinnedRotor(context: Context) : ViewGroup(context), ReactPointerEventsView {
  init {
    clipChildren = false
    clipToPadding = false
  }

  override val pointerEvents: PointerEvents
    get() = PointerEvents.BOX_NONE

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(
      MeasureSpec.getSize(widthMeasureSpec),
      MeasureSpec.getSize(heightMeasureSpec)
    )
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) = Unit
}

/** Seamless rotation for the activity while any pinned view is attached. */
private object SeamlessRotation {
  private var holders = 0
  private var previous = WindowManager.LayoutParams.ROTATION_ANIMATION_ROTATE

  fun acquire(activity: Activity) {
    holders += 1
    if (holders > 1) return
    val attributes = activity.window.attributes
    previous = attributes.rotationAnimation
    attributes.rotationAnimation = WindowManager.LayoutParams.ROTATION_ANIMATION_SEAMLESS
    activity.window.attributes = attributes
  }

  fun release(activity: Activity) {
    if (holders == 0) return
    holders -= 1
    if (holders > 0) return
    val attributes = activity.window.attributes
    attributes.rotationAnimation = previous
    activity.window.attributes = attributes
  }
}
