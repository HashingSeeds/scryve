package expo.modules.playappupdate

import android.app.Activity
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val DOWNLOADED_CHANGE = "onDownloadedChange"
private const val ERROR = "ERR_PLAY_APP_UPDATE"
private val IN_PROGRESS = setOf(
  InstallStatus.PENDING,
  InstallStatus.DOWNLOADING,
  InstallStatus.DOWNLOADED,
  InstallStatus.INSTALLING,
)

class PlayAppUpdateModule : Module() {
  private val manager by lazy {
    AppUpdateManagerFactory.create(appContext.reactContext ?: throw Exceptions.ReactContextLost())
  }
  private var observing = false
  private val installListener = InstallStateUpdatedListener { state ->
    if (state.installStatus() == InstallStatus.DOWNLOADED) reportDownloaded()
  }

  override fun definition() = ModuleDefinition {
    Name("PlayAppUpdate")
    Events(DOWNLOADED_CHANGE)

    OnStartObserving(DOWNLOADED_CHANGE) {
      observing = true
      manager.registerListener(installListener)
      reportDownloaded()
    }
    OnStopObserving(DOWNLOADED_CHANGE) {
      observing = false
      manager.unregisterListener(installListener)
    }
    // why: an update that finishes downloading while the app is in the background reaches no listener.
    OnActivityEntersForeground { if (observing) reportDownloaded() }

    AsyncFunction("startFlexibleUpdate") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve("unavailable")
      } else {
        manager.appUpdateInfo
          .addOnSuccessListener { info -> start(info, activity, promise) }
          .addOnFailureListener { promise.reject(ERROR, it.message, it) }
      }
    }

    AsyncFunction("completeUpdate") { promise: Promise ->
      manager.completeUpdate()
        .addOnSuccessListener { promise.resolve() }
        .addOnFailureListener { promise.reject(ERROR, it.message, it) }
    }
  }

  private fun start(info: AppUpdateInfo, activity: Activity, promise: Promise) {
    when {
      info.installStatus() in IN_PROGRESS -> promise.resolve("inProgress")
      info.updateAvailability() != UpdateAvailability.UPDATE_AVAILABLE ||
        !info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE) -> promise.resolve("unavailable")
      else ->
        manager
          .startUpdateFlow(info, activity, AppUpdateOptions.defaultOptions(AppUpdateType.FLEXIBLE))
          .addOnSuccessListener { result ->
            promise.resolve(
              when (result) {
                Activity.RESULT_OK -> "started"
                Activity.RESULT_CANCELED -> "declined"
                else -> "unavailable"
              }
            )
          }
          .addOnFailureListener { promise.reject(ERROR, it.message, it) }
    }
  }

  private fun reportDownloaded() {
    manager.appUpdateInfo.addOnSuccessListener { info ->
      val versionCode =
        if (info.installStatus() == InstallStatus.DOWNLOADED) info.availableVersionCode() else null
      sendEvent(DOWNLOADED_CHANGE, mapOf("versionCode" to versionCode))
    }
  }
}
