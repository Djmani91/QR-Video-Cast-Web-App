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
