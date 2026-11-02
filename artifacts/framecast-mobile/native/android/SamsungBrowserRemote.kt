package __PACKAGE__

import android.content.Context
import android.util.Base64
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.net.URL
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLException
import javax.net.ssl.X509TrustManager

/** Samsung's LAN remote API, not a promise that every TV can open a browser. */
internal object SamsungBrowserRemote {
  fun open(context: Context, ip: String, targetUrl: String) {
    require(TvDiscovery.isPrivateIpv4(ip)) { "The TV must be on your private Wi-Fi network." }
    val target = URL(targetUrl)
    require(target.protocol == "https" && target.host.equals("2tx1.com", true)
      && target.userInfo == null && (target.port == -1 || target.port == 443)) {
      "Only the FrameCast TV website can be opened."
    }
    try {
      launch(context, ip, target.toString(), true)
    } catch (error: Exception) {
      // Never downgrade after rejection, a changed certificate, or an approval timeout.
      if (error is SecurityException || error is SSLException || error is ApprovalException) throw error
      launch(context, ip, target.toString(), false)
    }
  }

  private class ApprovalException(message: String) : Exception(message)

  private fun launch(context: Context, ip: String, url: String, secure: Boolean) {
    val preferences = context.getSharedPreferences("framecast-tv-remotes", Context.MODE_PRIVATE)
    val certificateKey = "certificate:$ip"
    val expectedCertificate = preferences.getString(certificateKey, null)
    val receivedCertificate = AtomicReference<String?>()
    val builder = OkHttpClient.Builder().connectTimeout(3, TimeUnit.SECONDS)
      .readTimeout(0, TimeUnit.SECONDS).pingInterval(10, TimeUnit.SECONDS)
      .followRedirects(false).followSslRedirects(false)
    if (secure) {
      // Samsung uses self-signed LAN certificates. Trust-on-first-use is confined
      // to this private IP; persist the fingerprint only AFTER remote approval.
      val trust = object : X509TrustManager {
        override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
        override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {
          throw CertificateException("Client certificates are not used.")
        }
        override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
          val certificate = chain.firstOrNull() ?: throw CertificateException("Missing TV certificate.")
          val fingerprint = Base64.encodeToString(
            MessageDigest.getInstance("SHA-256").digest(certificate.encoded), Base64.NO_WRAP)
          if (expectedCertificate != null && fingerprint != expectedCertificate) {
            throw CertificateException("The TV identity changed. For safety, use the code at 2tx1.com instead.")
          }
          receivedCertificate.set(fingerprint)
        }
      }
      val tls = SSLContext.getInstance("TLS").apply { init(null, arrayOf(trust), null) }
      builder.sslSocketFactory(tls.socketFactory, trust)
        .hostnameVerifier { hostname, _ -> hostname == ip }
    }
    val client = builder.build()
    val port = if (secure) 8002 else 8001
    val scheme = if (secure) "wss" else "ws"
    val encodedName = Base64.encodeToString("FrameCast".toByteArray(), Base64.NO_WRAP)
    val token = if (secure) preferences.getString("token:$ip", null) else null
    val address = "$scheme://$ip:$port/api/v2/channels/samsung.remote.control?name=$encodedName" +
      (token?.let { "&token=${java.net.URLEncoder.encode(it, "UTF-8")}" } ?: "")
    val finished = CountDownLatch(1)
    val launchSent = AtomicBoolean(false)
    val failure = AtomicReference<Exception?>()
    val socket = client.newWebSocket(Request.Builder().url(address).build(), object : WebSocketListener() {
      override fun onMessage(webSocket: WebSocket, text: String) {
        try {
          val message = JSONObject(text)
          when (message.optString("event")) {
            "ms.channel.connect" -> {
              if (!launchSent.compareAndSet(false, true)) return
              val update = preferences.edit()
              message.optJSONObject("data")?.optString("token")?.takeIf { it.isNotBlank() }
                ?.let { update.putString("token:$ip", it) }
              if (secure) receivedCertificate.get()?.let { update.putString(certificateKey, it) }
              update.apply()
              if (!webSocket.send(browserLaunchMessage(url))) {
                failure.set(IllegalStateException("The TV remote closed before accepting the browser command."))
              }
              finished.countDown()
            }
            "ms.channel.unauthorized", "ms.channel.timeOut" -> {
              // A stale token must not prevent the next user-approved pairing.
              preferences.edit().remove("token:$ip").apply()
              failure.set(ApprovalException("Approve FrameCast using Allow on your TV. Check the TV's device connection manager if FrameCast was denied."))
              finished.countDown()
            }
            "ms.error" -> {
              failure.set(ApprovalException("This TV rejected the remote command. Open 2tx1.com manually and use its code."))
              finished.countDown()
            }
          }
        } catch (_: org.json.JSONException) {
          failure.set(IllegalStateException("The TV returned an invalid remote-control response."))
          finished.countDown()
        }
      }
      override fun onFailure(webSocket: WebSocket, error: Throwable, response: Response?) {
        failure.set(if (error is Exception) error else IllegalStateException("TV remote connection failed."))
        finished.countDown()
      }
      override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
        if (!launchSent.get()) {
          failure.set(ApprovalException("The TV closed the remote-control request before approval."))
        }
        finished.countDown()
      }
      override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
        if (!launchSent.get()) {
          failure.set(ApprovalException("The TV closed the request before approval. Use Allow on the TV or pair by code."))
        }
        finished.countDown()
        webSocket.close(code, null)
      }
    })
    try {
      if (!finished.await(45, TimeUnit.SECONDS)) {
        throw ApprovalException("TV approval timed out. Select Allow on your TV, or open 2tx1.com and enter its code in FrameCast.")
      }
      failure.get()?.let { throw it }
      check(launchSent.get()) { "The TV did not approve remote control." }
      // Let OkHttp flush the command; only the TV webpage's later acknowledgement
      // can establish an actual FrameCast connection.
      Thread.sleep(1_000)
      failure.get()?.let { throw it }
    } finally {
      socket.cancel()
      client.dispatcher.executorService.shutdown()
      client.connectionPool.evictAll()
    }
  }

  internal fun browserLaunchMessage(url: String): String = JSONObject()
    .put("method", "ms.channel.emit")
    .put("params", JSONObject().put("event", "ed.apps.launch").put("to", "host")
      .put("data", JSONObject().put("action_type", "NATIVE_LAUNCH")
        .put("appId", "org.tizen.browser").put("metaTag", url))).toString()
}
