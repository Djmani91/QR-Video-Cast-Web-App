package __PACKAGE__

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.amazon.whisperplay.fling.media.controller.DiscoveryController
import com.amazon.whisperplay.fling.media.controller.RemoteMediaPlayer
import com.amazon.whisperplay.fling.media.service.CustomMediaPlayer
import com.amazon.whisperplay.fling.media.service.MediaPlayerStatus
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONObject

/** Media-only control for Fire TV's built-in Amazon Fling receiver. */
internal object AmazonFlingCasting {
  private const val TAG = "FrameCastFling"
  private const val BUILT_IN_RECEIVER_SID = "amzn.thin.pl"
  private val lock = Any()
  private val players = ConcurrentHashMap<String, RemoteMediaPlayer>()
  private val lastSeen = ConcurrentHashMap<String, Long>()
  @Volatile private var controller: DiscoveryController? = null
  @Volatile private var started = false
  @Volatile private var selectedId: String? = null

  data class Receiver(val id: String, val name: String)

  private val listener = object : DiscoveryController.IDiscoveryListener {
    override fun playerDiscovered(player: RemoteMediaPlayer?) {
      if (player == null) return
      try {
        val id = player.uniqueIdentifier?.takeIf { it.isNotBlank() } ?: return
        players[id] = player
        lastSeen[id] = System.currentTimeMillis()
      } catch (error: Exception) {
        Log.w(TAG, "Ignoring an invalid Fire TV receiver advertisement", error)
      }
    }

    override fun playerLost(player: RemoteMediaPlayer?) {
      if (player == null) return
      try {
        val id = player.uniqueIdentifier ?: return
        players.remove(id)
        lastSeen.remove(id)
        if (selectedId == id) selectedId = null
      } catch (error: Exception) {
        Log.w(TAG, "Could not remove a lost Fire TV receiver", error)
      }
    }

    override fun discoveryFailure() {
      Log.w(TAG, "Amazon Fling discovery failed")
    }
  }

  fun discover(context: Context, waitMs: Long = 1_800): List<Receiver> {
    startDiscovery(context.applicationContext)
    if (!started) return emptyList()
    try {
      Thread.sleep(waitMs.coerceIn(500, 3_000))
    } catch (error: InterruptedException) {
      Thread.currentThread().interrupt()
      return emptyList()
    }
    val cutoff = System.currentTimeMillis() - 15_000
    lastSeen.entries.removeAll { it.value < cutoff }
    return players.entries
      .filter { (id, _) -> (lastSeen[id] ?: 0L) >= cutoff }
      .map { (id, player) -> Receiver(id, player.name?.take(100).orEmpty().ifBlank { "Amazon Fire TV" }) }
      .sortedBy { it.name.lowercase() }
  }

  private fun startDiscovery(context: Context) {
    if (started) return
    val ready = CountDownLatch(1)
    val start = Runnable {
      try {
        synchronized(lock) {
          if (!started) {
            if (controller == null) controller = DiscoveryController(context)
            controller?.start(BUILT_IN_RECEIVER_SID, listener)
            started = true
          }
        }
      } catch (error: Exception) {
        Log.w(TAG, "Could not start the built-in Fire TV receiver scan", error)
      } finally {
        ready.countDown()
      }
    }
    if (Looper.myLooper() == Looper.getMainLooper()) start.run()
    else Handler(Looper.getMainLooper()).post(start)
    try {
      if (!ready.await(3, TimeUnit.SECONDS)) Log.w(TAG, "Fire TV scan startup timed out")
    } catch (error: InterruptedException) {
      Thread.currentThread().interrupt()
    }
  }

  fun connect(receiverId: String) {
    val player = players[receiverId] ?: throw IllegalStateException("That Fire TV receiver is no longer available. Scan again.")
    // A discovery result alone is not a connection: confirm the receiver responds.
    player.getStatus().get(6, TimeUnit.SECONDS)
      ?: throw IllegalStateException("Fire TV did not confirm its media receiver.")
    selectedId = receiverId
  }

  fun load(url: String, mime: String, title: String) {
    val player = selectedPlayer()
    val uri = Uri.parse(url)
    require(url.length <= 8_192 && uri.scheme in listOf("http", "https") &&
      !uri.host.isNullOrBlank() && uri.userInfo == null && uri.fragment == null) {
      "Fire TV needs a direct HTTP or HTTPS media address."
    }
    require(Regex("^(video|image|application)/[A-Za-z0-9.+-]+$").matches(mime)) {
      "Fire TV cannot play this media format."
    }
    val metadata = JSONObject()
      .put("type", mime)
      .put("title", title.take(200))
      .toString()
    player.setMediaSource(url, metadata, true, false).get(20, TimeUnit.SECONDS)
  }

  fun status(): Map<String, Any> {
    val player = selectedPlayer()
    val mediaStatus = player.getStatus().get(5, TimeUnit.SECONDS)
    val state = when (mediaStatus?.state) {
      MediaPlayerStatus.MediaState.Playing -> "PLAYING"
      MediaPlayerStatus.MediaState.Paused -> "PAUSED_PLAYBACK"
      MediaPlayerStatus.MediaState.PreparingMedia,
      MediaPlayerStatus.MediaState.Seeking -> "TRANSITIONING"
      MediaPlayerStatus.MediaState.Finished -> "FINISHED"
      MediaPlayerStatus.MediaState.Error -> "ERROR"
      else -> "READY"
    }
    val position = runCatching { player.position.get(3, TimeUnit.SECONDS) ?: 0L }.getOrDefault(0L)
    val duration = runCatching { player.duration.get(3, TimeUnit.SECONDS) ?: 0L }.getOrDefault(0L)
    return mapOf(
      "state" to state,
      "position" to (position.coerceAtLeast(0L) / 1_000.0),
      "duration" to (duration.coerceAtLeast(0L) / 1_000.0),
    )
  }

  fun control(action: String, targetSeconds: Double) {
    val player = selectedPlayer()
    when (action) {
      "play" -> player.play().get(5, TimeUnit.SECONDS)
      "pause" -> player.pause().get(5, TimeUnit.SECONDS)
      "stop" -> player.stop().get(5, TimeUnit.SECONDS)
      "seek" -> {
        val currentMs = player.position.get(5, TimeUnit.SECONDS) ?: 0L
        val targetMs = (targetSeconds.coerceIn(0.0, 359_999.0) * 1_000).toLong()
        player.seek(CustomMediaPlayer.PlayerSeekMode.Relative, targetMs - currentMs)
          .get(5, TimeUnit.SECONDS)
      }
      else -> throw IllegalArgumentException("This Fire TV media control is not supported.")
    }
  }

  fun disconnect() {
    val id = selectedId ?: return
    try {
      players[id]?.stop()?.get(4, TimeUnit.SECONDS)
    } finally {
      selectedId = null
    }
  }

  private fun selectedPlayer(): RemoteMediaPlayer =
    selectedId?.let { players[it] }
      ?: throw IllegalStateException("Select a Fire TV media receiver before playback.")
}
