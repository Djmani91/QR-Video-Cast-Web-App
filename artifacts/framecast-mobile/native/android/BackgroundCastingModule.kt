package __PACKAGE__

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.lang.ref.WeakReference

class BackgroundCastingModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  init { currentContext = WeakReference(context) }
  override fun getName() = "FrameCastBackground"

  private fun intent(action: String, title: String, paused: Boolean, position: Double, duration: Double) =
    Intent(reactApplicationContext, BackgroundCastingService::class.java)
      .setAction(action).putExtra("title", title).putExtra("paused", paused)
      .putExtra("position", position).putExtra("duration", duration)

  @ReactMethod
  fun start(title: String, paused: Boolean, position: Double, duration: Double, promise: Promise) {
    if (reactApplicationContext.currentActivity == null) {
      promise.reject("FOREGROUND_REQUIRED", "Open FrameCast before enabling background casting.")
      return
    }
    try {
      val command = intent("START", title, paused, position, duration)
      if (Build.VERSION.SDK_INT >= 26) reactApplicationContext.startForegroundService(command)
      else reactApplicationContext.startService(command)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("BACKGROUND_START_FAILED", "Android could not enable background casting. Keep FrameCast open and try again.", error)
    }
  }

  @ReactMethod
  fun update(title: String, paused: Boolean, position: Double, duration: Double) {
    if (BackgroundCastingService.running) {
      reactApplicationContext.startService(intent("UPDATE", title, paused, position, duration))
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    reactApplicationContext.stopService(Intent(reactApplicationContext, BackgroundCastingService::class.java))
    promise.resolve(null)
  }

  @ReactMethod fun addListener(name: String) {}
  @ReactMethod fun removeListeners(count: Double) {}

  companion object {
    private var currentContext: WeakReference<ReactApplicationContext>? = null
    fun emit(event: String, value: String? = null) {
      val context = currentContext?.get() ?: return
      if (context.hasActiveReactInstance()) {
        context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(event, value)
      }
    }
  }
}
