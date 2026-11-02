package __PACKAGE__

import android.Manifest
import android.content.pm.PackageManager
import android.content.Intent
import android.os.Build
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.util.Base64
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.oney.WebRTCModule.ScreenCaptureController
import java.lang.ref.WeakReference
import java.util.concurrent.atomic.AtomicBoolean

class BackgroundCastingModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val screenAudioRunning = AtomicBoolean(false)
  @Volatile private var screenAudioRecord: AudioRecord? = null
  @Volatile private var screenAudioThread: Thread? = null

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

  @ReactMethod
  fun discoverSamsungTvs(promise: Promise) {
    Thread({
      try {
        val devices = TvDiscovery.scan(reactApplicationContext)
        val result = Arguments.createArray()
        devices.forEach { device ->
          val item = Arguments.createMap()
          item.putString("ip", device.ip)
          item.putString("name", device.name)
          item.putString("model", device.model)
          result.pushMap(item)
        }
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("TV_DISCOVERY_FAILED", "FrameCast could not scan the local Wi-Fi network.", error)
      }
    }, "FrameCastTvDiscovery").start()
  }

  @ReactMethod
  fun discoverNearbyTvs(promise: Promise) {
    Thread({
      try {
        val result = Arguments.createArray()
        TvDiscovery.scanNearby(reactApplicationContext).forEach { device ->
          val item = Arguments.createMap()
          item.putString("ip", device.ip)
          item.putString("name", device.name)
          item.putString("model", device.model)
          item.putString("type", device.type)
          item.putString("rendererId", device.rendererId)
          result.pushMap(item)
        }
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("TV_DISCOVERY_FAILED", error.message ?: "FrameCast could not scan this Wi-Fi network. Use the TV browser code instead.", error)
      }
    }, "FrameCastNearbyTvs").start()
  }

  @ReactMethod
  fun getWifiLocalIpv4Address(promise: Promise) {
    Thread({
      try {
        promise.resolve(TvDiscovery.wifiLocalIpv4Address(reactApplicationContext))
      } catch (error: Exception) {
        promise.reject("WIFI_LOCAL_ADDRESS_FAILED",
          error.message ?: "Connect this phone to the same Wi-Fi as your TV, then try again.", error)
      }
    }, "FrameCastWifiAddress").start()
  }

  @ReactMethod
  fun openSamsungTvBrowser(ip: String, url: String, promise: Promise) {
    Thread({
      try {
        TvDiscovery.openBrowser(reactApplicationContext, ip, url)
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("TV_BROWSER_LAUNCH_FAILED", error.message ?: "The TV did not accept the automatic browser launch.", error)
      }
    }, "FrameCastTvBrowserLaunch").start()
  }

  private val directExecutor = java.util.concurrent.Executors.newSingleThreadExecutor()
  @Volatile private var directProtocol = ""

  @ReactMethod
  fun connectDirect(protocol: String, receiver: String, promise: Promise) {
    if (protocol == "googlecast") {
      reactApplicationContext.runOnUiQueueThread {
        GoogleCasting.connect(reactApplicationContext, receiver, promise) { directProtocol = "googlecast" }
      }
    } else if (protocol == "dlna") {
      directExecutor.submit {
        try {
          DlnaCasting.connect(receiver)
          directProtocol = "dlna"
          promise.resolve(null)
        } catch (e: Exception) { promise.reject("DIRECT_CONNECT_FAILED", e.message, e) }
      }
    } else promise.reject("DIRECT_UNSUPPORTED", "This TV has no supported direct receiver.")
  }

  @ReactMethod
  fun loadDirect(url: String, mime: String, title: String, promise: Promise) {
    directCall(promise, { DlnaCasting.load(url, mime, title); null }) {
      GoogleCasting.load(reactApplicationContext, url, mime, title, promise)
    }
  }

  @ReactMethod
  fun statusDirect(promise: Promise) {
    directCall(promise, { Arguments.makeNativeMap(DlnaCasting.status()) }) {
      GoogleCasting.status(reactApplicationContext, promise)
    }
  }

  @ReactMethod
  fun controlDirect(action: String, position: Double, promise: Promise) {
    directCall(promise, { DlnaCasting.control(action, position); null }) {
      GoogleCasting.control(reactApplicationContext, action, position, promise)
    }
  }

  @ReactMethod
  fun disconnectDirect(promise: Promise) {
    if (directProtocol == "googlecast") {
      reactApplicationContext.runOnUiQueueThread { GoogleCasting.disconnect(reactApplicationContext, promise) }
    } else {
      directExecutor.submit {
        try { DlnaCasting.disconnect(); promise.resolve(null) }
        catch (e: Exception) { promise.reject("DIRECT_STOP_FAILED", e.message, e) }
      }
    }
    directProtocol = ""
  }

  private fun directCall(promise: Promise, dlna: () -> Any?, google: () -> Unit) {
    if (directProtocol == "googlecast") reactApplicationContext.runOnUiQueueThread {
      try { google() } catch (e: Exception) { promise.reject("CAST_FAILED", e.message, e) }
    }
    else if (directProtocol == "dlna") directExecutor.submit {
      try { promise.resolve(dlna()) } catch (e: Exception) { promise.reject("DLNA_FAILED", e.message, e) }
    }
    else promise.reject("DIRECT_DISCONNECTED", "Connect a TV receiver before playing.")
  }

  @ReactMethod
  @Synchronized
  fun startScreenAudioCapture(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      promise.reject("SCREEN_AUDIO_UNAVAILABLE", "Android 10 or later is required for screen audio capture.")
      return
    }
    if (reactApplicationContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("SCREEN_AUDIO_PERMISSION", "Allow playback-audio access to send supported app sound to the TV.")
      return
    }
    if (screenAudioRunning.get()) {
      promise.resolve(null)
      return
    }

    val projection = ScreenCaptureController.getFrameCastMediaProjection()
    if (projection == null) {
      promise.reject("SCREEN_AUDIO_NOT_READY", "Android has not started the screen-capture session yet.")
      return
    }

    try {
      val sampleRate = 48_000
      val channelMask = AudioFormat.CHANNEL_IN_MONO
      val encoding = AudioFormat.ENCODING_PCM_16BIT
      val minimum = AudioRecord.getMinBufferSize(sampleRate, channelMask, encoding)
      if (minimum <= 0) {
        promise.reject("SCREEN_AUDIO_FORMAT", "Android does not support the requested screen-audio format.")
        return
      }
      val captureConfig = AudioPlaybackCaptureConfiguration.Builder(projection)
        .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
        .addMatchingUsage(AudioAttributes.USAGE_GAME)
        .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
        .build()
      val record = AudioRecord.Builder()
        .setAudioFormat(
          AudioFormat.Builder()
            .setEncoding(encoding)
            .setSampleRate(sampleRate)
            .setChannelMask(channelMask)
            .build()
        )
        .setBufferSizeInBytes(maxOf(minimum * 2, 1_920 * 2))
        .setAudioPlaybackCaptureConfig(captureConfig)
        .build()
      if (record.state != AudioRecord.STATE_INITIALIZED) {
        record.release()
        promise.reject("SCREEN_AUDIO_INIT", "Android could not start direct playback-audio capture.")
        return
      }

      screenAudioRecord = record
      record.startRecording()
      screenAudioRunning.set(true)
      screenAudioThread = Thread({
        val buffer = ByteArray(1_920) // 20 ms of mono 48 kHz PCM16 audio.
        while (screenAudioRunning.get()) {
          val count = try {
            record.read(buffer, 0, buffer.size, AudioRecord.READ_BLOCKING)
          } catch (_: Exception) {
            break
          }
          if (count > 0 && screenAudioRunning.get()) {
            emit("framecast-screen-audio", Base64.encodeToString(buffer, 0, count, Base64.NO_WRAP))
          }
        }
      }, "FrameCastPlaybackAudio").apply { start() }
      promise.resolve(null)
    } catch (error: Exception) {
      stopScreenAudioCaptureInternal()
      promise.reject("SCREEN_AUDIO_START_FAILED", "Android could not capture playback audio. This app may not allow audio capture.", error)
    }
  }

  @ReactMethod
  @Synchronized
  fun stopScreenAudioCapture(promise: Promise) {
    stopScreenAudioCaptureInternal()
    promise.resolve(null)
  }

  private fun stopScreenAudioCaptureInternal() {
    screenAudioRunning.set(false)
    val record = screenAudioRecord
    screenAudioRecord = null
    try { record?.stop() } catch (_: Exception) {}
    try { record?.release() } catch (_: Exception) {}
    val thread = screenAudioThread
    screenAudioThread = null
    if (thread != null && thread !== Thread.currentThread()) {
      try { thread.join(250) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
    }
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
