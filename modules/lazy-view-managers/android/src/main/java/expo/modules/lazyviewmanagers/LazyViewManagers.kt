package expo.modules.lazyviewmanagers

import com.facebook.react.BaseReactPackage
import com.facebook.react.ReactPackage
import com.facebook.react.ViewManagerOnDemandReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager
import java.lang.ref.WeakReference

/**
 * Lets React Native create each package's view managers on first use instead of at launch.
 *
 * Packages that only implement `createViewManagers` are "eager": React Native asks every one of
 * them for its view managers, and their constants, before the first screen renders. Reporting them
 * through [ViewManagerOnDemandReactPackage] instead defers that work until JS renders a component.
 * Wired into MainApplication by this module's app.plugin.js.
 */
fun withLazyViewManagers(reactPackage: ReactPackage): ReactPackage =
  when (reactPackage) {
    is ViewManagerOnDemandReactPackage -> reactPackage
    // TurboModule lookup checks for BaseReactPackage, so keep that type visible.
    is BaseReactPackage -> LazyBaseReactPackage(reactPackage)
    else -> LazyReactPackage(reactPackage)
  }

/** View managers of one package, created once per React instance (a reload makes a new one). */
private class ViewManagersByName(private val inner: ReactPackage) {
  private var context = WeakReference<ReactApplicationContext>(null)
  private var byName = emptyMap<String, ViewManager<in Nothing, in Nothing>>()

  @Synchronized
  fun get(reactContext: ReactApplicationContext): Map<String, ViewManager<in Nothing, in Nothing>> {
    if (context.get() !== reactContext) {
      byName = inner.createViewManagers(reactContext).associateBy { it.name }
      context = WeakReference(reactContext)
    }
    return byName
  }
}

private class LazyReactPackage(private val inner: ReactPackage) :
  ReactPackage, ViewManagerOnDemandReactPackage {
  private val managers = ViewManagersByName(inner)

  @Deprecated("Delegates to the wrapped package")
  @Suppress("DEPRECATION")
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    inner.createNativeModules(reactContext)

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    inner.getModule(name, reactContext)

  override fun createViewManagers(reactContext: ReactApplicationContext) =
    managers.get(reactContext).values.toList()

  override fun getViewManagerNames(reactContext: ReactApplicationContext) =
    managers.get(reactContext).keys

  override fun createViewManager(reactContext: ReactApplicationContext, viewManagerName: String) =
    managers.get(reactContext)[viewManagerName]
}

private class LazyBaseReactPackage(private val inner: BaseReactPackage) :
  BaseReactPackage(), ViewManagerOnDemandReactPackage {
  private val managers = ViewManagersByName(inner)

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    inner.getModule(name, reactContext)

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
    inner.getReactModuleInfoProvider()

  override fun createViewManagers(reactContext: ReactApplicationContext) =
    managers.get(reactContext).values.toList()

  override fun getViewManagerNames(reactContext: ReactApplicationContext) =
    managers.get(reactContext).keys

  override fun createViewManager(reactContext: ReactApplicationContext, viewManagerName: String) =
    managers.get(reactContext)[viewManagerName]
}
