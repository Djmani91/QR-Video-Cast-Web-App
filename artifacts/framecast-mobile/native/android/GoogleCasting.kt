package __PACKAGE__

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.annotation.Keep
import androidx.mediarouter.media.MediaRouteSelector
import androidx.mediarouter.media.MediaRouter
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.google.android.gms.cast.CastDevice
import com.google.android.gms.cast.CastMediaControlIntent
import com.google.android.gms.cast.MediaInfo
import com.google.android.gms.cast.MediaLoadRequestData
import com.google.android.gms.cast.MediaMetadata
import com.google.android.gms.cast.MediaSeekOptions
import com.google.android.gms.cast.MediaStatus
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastOptions
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.OptionsProvider
import com.google.android.gms.cast.framework.SessionManagerListener
import com.google.android.gms.cast.framework.SessionProvider
import com.google.android.gms.cast.framework.media.RemoteMediaClient

/** Google's built-in receiver: no additional TV installation or browser code. */
@Keep
class FrameCastOptionsProvider : OptionsProvider {
  override fun getCastOptions(context: Context): CastOptions = CastOptions.Builder()
    .setReceiverApplicationId(CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID)
    .setResumeSavedSession(false).build()
  override fun getAdditionalSessionProviders(context: Context): List<SessionProvider>? = null
}

internal object GoogleCasting {
  private val handler = Handler(Looper.getMainLooper())
  private var connecting = false
  private fun context(context: Context) = CastContext.getSharedInstance(context)

  @Suppress("DEPRECATION")
  fun connect(context: Context, ip: String, promise: Promise, connected: () -> Unit) {
    if (!TvDiscoveryProtocol.isPrivateIpv4(ip)) {
      promise.reject("CAST_ADDRESS", "The Cast device is not on a supported private Wi-Fi address.")
      return
    }
    if (connecting) { promise.reject("CAST_BUSY", "A Cast connection is already in progress."); return }
    try {
      val manager = context(context).sessionManager
      val session = manager.currentCastSession
      if (session?.isConnected == true && session.castDevice?.inetAddress?.hostAddress == ip) {
        connected()
        promise.resolve(null)
        return
      }
      connecting = true
      val router = MediaRouter.getInstance(context)
      val selector = MediaRouteSelector.Builder()
        .addControlCategory(CastMediaControlIntent.categoryForCast(CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID)).build()
      var finished = false
      var selected = false
      lateinit var callback: MediaRouter.Callback
      lateinit var listener: SessionManagerListener<CastSession>
      lateinit var timeout: Runnable
      fun finish(error: String?) {
        if (finished) return
        finished = true
        connecting = false
        handler.removeCallbacks(timeout)
        router.removeCallback(callback)
        manager.removeSessionManagerListener(listener, CastSession::class.java)
        if (error == null) {
          connected()
          promise.resolve(null)
        } else {
          if (selected) manager.endCurrentSession(true)
          promise.reject("CAST_CONNECT_FAILED", error)
        }
      }
      fun choose(route: MediaRouter.RouteInfo) {
        val device = CastDevice.getFromBundle(route.extras) ?: return
        if (!finished && !selected && device.inetAddress?.hostAddress == ip && route.matchesSelector(selector)) {
          selected = true
          router.selectRoute(route)
        }
      }
      listener = object : SessionManagerListener<CastSession> {
        override fun onSessionStarted(s: CastSession, id: String) {
          if (s.castDevice?.inetAddress?.hostAddress == ip && s.isConnected) finish(null)
        }
        override fun onSessionStartFailed(s: CastSession, error: Int) { if (selected) finish("The Cast receiver could not start (error $error). Check that the TV is awake and try again.") }
        override fun onSessionStarting(s: CastSession) {}
        override fun onSessionEnding(s: CastSession) {}
        override fun onSessionEnded(s: CastSession, error: Int) {}
        override fun onSessionResuming(s: CastSession, id: String) {}
        override fun onSessionResumed(s: CastSession, suspended: Boolean) {}
        override fun onSessionResumeFailed(s: CastSession, error: Int) {}
        override fun onSessionSuspended(s: CastSession, reason: Int) {}
      }
      callback = object : MediaRouter.Callback() {
        override fun onRouteAdded(r: MediaRouter, route: MediaRouter.RouteInfo) = choose(route)
        override fun onRouteChanged(r: MediaRouter, route: MediaRouter.RouteInfo) = choose(route)
      }
      timeout = Runnable { finish("The Google Cast receiver did not confirm a connection. Check Wi-Fi and try again. No browser pairing code is needed for Google Cast.") }
      manager.addSessionManagerListener(listener, CastSession::class.java)
      handler.postDelayed(timeout, 25_000)
      router.addCallback(selector, callback, MediaRouter.CALLBACK_FLAG_REQUEST_DISCOVERY)
      router.routes.forEach { choose(it) }
    } catch (e: Exception) {
      connecting = false
      promise.reject("CAST_UNAVAILABLE", "Google Cast could not start. This phone needs Google Play services and the updated native FrameCast build.", e)
    }
  }

  private fun client(context: Context): RemoteMediaClient {
    val session = context(context).sessionManager.currentCastSession
    check(session?.isConnected == true) { "The Google Cast receiver is disconnected. Reconnect from the TV list." }
    return session.remoteMediaClient ?: throw IllegalStateException("The Cast media receiver is unavailable.")
  }

  fun load(context: Context, url: String, mime: String, title: String, promise: Promise) {
    DlnaCasting.validateMedia(url, mime)
    val photo = mime.startsWith("image/")
    val metadata = MediaMetadata(if (photo) MediaMetadata.MEDIA_TYPE_PHOTO else MediaMetadata.MEDIA_TYPE_MOVIE)
    metadata.putString(MediaMetadata.KEY_TITLE, title.take(200))
    val media = MediaInfo.Builder(url).setContentType(mime)
      .setStreamType(if (photo) MediaInfo.STREAM_TYPE_NONE else MediaInfo.STREAM_TYPE_BUFFERED)
      .setMetadata(metadata).build()
    client(context).load(MediaLoadRequestData.Builder().setMediaInfo(media).setAutoplay(true).build())
      .setResultCallback { result ->
        if (result.status.isSuccess) promise.resolve(null)
        else promise.reject("CAST_LOAD_FAILED", "The Cast receiver rejected this media (error ${result.status.statusCode}). Its supported formats depend on the device model.")
      }
  }

  fun status(context: Context, promise: Promise) {
    val client = client(context)
    val status = client.mediaStatus
    val state = when (status?.playerState) {
      MediaStatus.PLAYER_STATE_PLAYING -> "PLAYING"
      MediaStatus.PLAYER_STATE_PAUSED -> "PAUSED_PLAYBACK"
      MediaStatus.PLAYER_STATE_BUFFERING -> "TRANSITIONING"
      MediaStatus.PLAYER_STATE_IDLE -> when (status.idleReason) {
        MediaStatus.IDLE_REASON_FINISHED -> "FINISHED"
        MediaStatus.IDLE_REASON_ERROR -> "ERROR"
        else -> "STOPPED"
      }
      else -> "READY"
    }
    promise.resolve(Arguments.createMap().apply {
      putString("state", state)
      putDouble("position", client.approximateStreamPosition / 1000.0)
      putDouble("duration", client.streamDuration / 1000.0)
    })
  }

  fun control(context: Context, action: String, position: Double, promise: Promise) {
    val client = client(context)
    val result = when (action) {
      "play" -> client.play()
      "pause" -> client.pause()
      "stop" -> client.stop()
      "seek" -> client.seek(MediaSeekOptions.Builder().setPosition((position.coerceAtLeast(0.0) * 1000).toLong()).build())
      else -> throw IllegalArgumentException("Unsupported Google Cast control.")
    }
    result.setResultCallback { response ->
      if (response.status.isSuccess) promise.resolve(null)
      else promise.reject("CAST_CONTROL_FAILED", "The Cast receiver rejected this control (error ${response.status.statusCode}).")
    }
  }

  fun disconnect(context: Context, promise: Promise) {
    try { context(context).sessionManager.endCurrentSession(true); promise.resolve(null) }
    catch (e: Exception) { promise.reject("CAST_STOP_FAILED", e.message, e) }
  }
}
