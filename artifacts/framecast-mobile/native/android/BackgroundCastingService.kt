package __PACKAGE__

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class BackgroundCastingService : HeadlessJsTaskService() {
  private lateinit var session: MediaSession
  private var wifiLock: WifiManager.WifiLock? = null
  private var title = "Connected to your TV"
  private var paused = true
  private var position = 0.0
  private var duration = 0.0

  override fun onCreate() {
    super.onCreate()
    if (Build.VERSION.SDK_INT >= 26) {
      getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(CHANNEL, "Casting controls", NotificationManager.IMPORTANCE_LOW)
      )
    }
    session = MediaSession(this, "FrameCast").apply {
      setCallback(object : MediaSession.Callback() {
        override fun onPlay() = control("play")
        override fun onPause() = control("pause")
        override fun onStop() = control("disconnect")
        override fun onFastForward() = control("video:seek-by:10")
        override fun onRewind() = control("video:seek-by:-10")
        override fun onSkipToNext() = control("video:seek-by:10")
        override fun onSkipToPrevious() = control("video:seek-by:-10")
        override fun onSeekTo(pos: Long) = control("video:seek:${pos / 1000}")
        override fun onCustomAction(action: String, extras: Bundle?) {
          if (action == "video:seek-by:-10" || action == "video:seek-by:10" || action == "disconnect") control(action)
        }
      })
      isActive = true
    }
  }

  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? =
    if (intent?.action == "START") HeadlessJsTaskConfig("FrameCastBackground", Arguments.createMap(), 0, true) else null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent == null) { stopSelf(); return START_NOT_STICKY }
    if (intent.action == "CONTROL") {
      if (running) intent.getStringExtra("command")?.let { control(it) }
      else stopSelf()
      return START_NOT_STICKY
    }
    title = intent.getStringExtra("title") ?: title
    paused = intent.getBooleanExtra("paused", paused)
    position = intent.getDoubleExtra("position", position)
    duration = intent.getDoubleExtra("duration", duration)
    if (!running) {
      // Android requires the visible foreground notification before JS startup.
      val notification = notification()
      if (Build.VERSION.SDK_INT >= 29) startForeground(ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
      else startForeground(ID, notification)
      running = true
      val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      wifiLock = wifi.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "FrameCast:Casting").apply {
        setReferenceCounted(false)
        acquire()
      }
      super.onStartCommand(intent.setAction("START"), flags, startId)
    } else {
      getSystemService(NotificationManager::class.java).notify(ID, notification())
    }
    // Never restart an old media-sharing session after Android kills the app.
    return START_NOT_STICKY
  }

  private fun control(action: String) {
    BackgroundCastingModule.emit("FrameCastRemoteControl", action)
  }

  private fun command(action: String, requestCode: Int): PendingIntent =
    PendingIntent.getService(this, requestCode,
      Intent(this, BackgroundCastingService::class.java).setAction("CONTROL").putExtra("command", action),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  private fun notification(): Notification {
    val actions = PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_PLAY_PAUSE or
      PlaybackState.ACTION_STOP or PlaybackState.ACTION_SEEK_TO or PlaybackState.ACTION_FAST_FORWARD or PlaybackState.ACTION_REWIND
    session.setPlaybackState(PlaybackState.Builder().setActions(actions)
      .addCustomAction("video:seek-by:-10", "Back 10 seconds", android.R.drawable.ic_media_rew)
      .addCustomAction("video:seek-by:10", "Forward 10 seconds", android.R.drawable.ic_media_ff)
      .addCustomAction("disconnect", "Disconnect", android.R.drawable.ic_menu_close_clear_cancel)
      .setState(if (paused) PlaybackState.STATE_PAUSED else PlaybackState.STATE_PLAYING,
        (position * 1000).toLong(), if (paused) 0f else 1f).build())
    session.setMetadata(MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, title)
      .putString(MediaMetadata.METADATA_KEY_ARTIST, "FrameCast • Playing on TV")
      .putLong(MediaMetadata.METADATA_KEY_DURATION, (duration * 1000).toLong()).build())
    val open = packageManager.getLaunchIntentForPackage(packageName)
      ?: Intent(Intent.ACTION_MAIN).setClassName(packageName, "$packageName.MainActivity")
    val launch = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
    return builder.setSmallIcon(android.R.drawable.ic_media_play).setContentTitle(title)
      .setContentText("Casting to TV • Tap to open FrameCast").setContentIntent(launch)
      .setOngoing(true).setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PRIVATE)
      .addAction(android.R.drawable.ic_media_rew, "Back 10 seconds", command("video:seek-by:-10", 1))
      .addAction(if (paused) android.R.drawable.ic_media_play else android.R.drawable.ic_media_pause,
        if (paused) "Play" else "Pause", command(if (paused) "play" else "pause", 2))
      .addAction(android.R.drawable.ic_media_ff, "Forward 10 seconds", command("video:seek-by:10", 3))
      .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Disconnect", command("disconnect", 4))
      .setStyle(Notification.MediaStyle().setMediaSession(session.sessionToken).setShowActionsInCompactView(0, 1, 2))
      .build()
  }

  override fun onDestroy() {
    running = false
    if (wifiLock?.isHeld == true) wifiLock?.release()
    wifiLock = null
    session.release()
    BackgroundCastingModule.emit("FrameCastBackgroundStopped")
    super.onDestroy()
  }

  companion object {
    @Volatile var running = false
    private const val CHANNEL = "framecast-casting"
    private const val ID = 6101
  }
}
