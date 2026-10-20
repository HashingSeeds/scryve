package expo.modules.lowlatencywifi

import android.content.Context
import android.net.wifi.WifiManager
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LowLatencyWifiModule : Module() {
  // why: reference counted, so every nearby socket holds its own count and the lock drops with the last one.
  private val lock by lazy {
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    wifi.createWifiLock(WifiManager.WIFI_MODE_FULL_LOW_LATENCY, "scryve:nearby").apply {
      setReferenceCounted(true)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("LowLatencyWifi")

    // why: low-latency mode arrived in Android 10; older phones keep the heartbeat alone.
    Function("acquire") { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) lock.acquire() }
    Function("release") { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && lock.isHeld) lock.release() }

    // why: a JS reload drops the sockets without running their release.
    OnDestroy { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) while (lock.isHeld) lock.release() }
  }
}
