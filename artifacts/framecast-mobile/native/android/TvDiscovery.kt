package __PACKAGE__

import android.content.Context
import android.net.wifi.WifiManager
import android.util.Base64
import java.io.ByteArrayOutputStream
import java.net.DatagramPacket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.MulticastSocket
import java.net.Socket
import java.net.URL
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Locale

internal data class DiscoveredSamsungTv(
  val ip: String,
  val name: String,
  val model: String,
)

internal object TvDiscovery {
  private const val SSDP_ADDRESS = "239.255.255.250"
  private const val SSDP_PORT = 1900
  private const val SCAN_WINDOW_MS = 3_500L

  fun scan(context: Context): List<DiscoveredSamsungTv> {
    val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
    val multicastLock = wifi?.createMulticastLock("framecast-tv-discovery")
    try {
      multicastLock?.setReferenceCounted(false)
      multicastLock?.acquire()

      val candidates = linkedMapOf<String, String>()
      MulticastSocket(null).use { socket ->
        socket.reuseAddress = true
        socket.bind(InetSocketAddress(0))
        socket.soTimeout = 250
        val group = InetAddress.getByName(SSDP_ADDRESS)
        val targets = listOf(
          "ssdp:all",
          "urn:samsung.com:device:RemoteControlReceiver:1",
          "urn:schemas-upnp-org:device:MediaRenderer:1",
        )
        targets.forEach { target ->
          val request = (
            "M-SEARCH * HTTP/1.1\r\n" +
              "HOST: $SSDP_ADDRESS:$SSDP_PORT\r\n" +
              "MAN: \"ssdp:discover\"\r\n" +
              "MX: 1\r\n" +
              "ST: $target\r\n\r\n"
            ).toByteArray(Charsets.US_ASCII)
          socket.send(DatagramPacket(request, request.size, group, SSDP_PORT))
        }

        val deadline = System.currentTimeMillis() + SCAN_WINDOW_MS
        val buffer = ByteArray(8_192)
        while (System.currentTimeMillis() < deadline) {
          try {
            val packet = DatagramPacket(buffer, buffer.size)
            socket.receive(packet)
            val ip = packet.address?.hostAddress?.substringBefore('%') ?: continue
            if (!isPrivateIpv4(ip)) continue
            val response = String(packet.data, packet.offset, packet.length, Charsets.US_ASCII)
            candidates[ip] = response
          } catch (_: java.net.SocketTimeoutException) {
            // Keep listening until the bounded scan window ends.
          }
        }
      }

      return candidates.entries
        .filter { (_, response) -> response.contains("samsung", ignoreCase = true) }
        .map { (ip, _) -> ip }
        .sorted()
        .take(16)
        .map { ip ->
          DiscoveredSamsungTv(ip, "Samsung TV", "Samsung Smart TV")
        }
    } finally {
      try {
        if (multicastLock?.isHeld == true) multicastLock.release()
      } catch (_: Exception) {
        // A scan result should not be lost because the Wi-Fi lock was already released.
      }
    }
  }

  fun openBrowser(ip: String, targetUrl: String) {
    if (!isPrivateIpv4(ip)) throw IllegalArgumentException("The TV address is not on a private Wi-Fi network.")
    val target = URL(targetUrl)
    if (target.protocol != "https" || target.host.lowercase(Locale.US) != "2tx1.com") {
      throw IllegalArgumentException("FrameCast can only open its own TV website.")
    }

    Socket().use { socket ->
      socket.connect(InetSocketAddress(ip, 8001), 2_500)
      socket.soTimeout = 4_000
      val keyBytes = ByteArray(16)
      SecureRandom().nextBytes(keyBytes)
      val wsKey = Base64.encodeToString(keyBytes, Base64.NO_WRAP)
      val path = "/api/v2/channels/samsung.remote.control?name=RnJhbWVDYXN0"
      val request = (
        "GET $path HTTP/1.1\r\n" +
          "Host: $ip:8001\r\n" +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n" +
          "Sec-WebSocket-Key: $wsKey\r\n" +
          "Sec-WebSocket-Version: 13\r\n" +
          "Origin: http://localhost\r\n\r\n"
        ).toByteArray(Charsets.US_ASCII)
      socket.getOutputStream().write(request)
      socket.getOutputStream().flush()

      val handshake = ByteArrayOutputStream()
      var matched = 0
      while (handshake.size() < 8_192 && matched < 4) {
        val next = socket.getInputStream().read()
        if (next < 0) break
        handshake.write(next)
        matched = when {
          matched == 0 && next == '\r'.code -> 1
          matched == 1 && next == '\n'.code -> 2
          matched == 2 && next == '\r'.code -> 3
          matched == 3 && next == '\n'.code -> 4
          next == '\r'.code -> 1
          else -> 0
        }
      }
      val response = handshake.toString(Charsets.US_ASCII.name())
      if (!response.startsWith("HTTP/1.1 101") && !response.startsWith("HTTP/1.0 101")) {
        throw IllegalStateException("The TV refused the remote-control connection. Check for an approval prompt on the TV.")
      }
      val expectedAccept = Base64.encodeToString(
        MessageDigest.getInstance("SHA-1")
          .digest((wsKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").toByteArray(Charsets.US_ASCII)),
        Base64.NO_WRAP,
      )
      val accept = response.lineSequence()
        .firstOrNull { it.startsWith("Sec-WebSocket-Accept:", ignoreCase = true) }
        ?.substringAfter(':')
        ?.trim()
      if (accept != expectedAccept) {
        throw IllegalStateException("The TV did not confirm its remote-control connection.")
      }

      val output = socket.getOutputStream()
      sendRemoteMessage(output, remoteKey("Click", "KEY_BROWSER"))
       Thread.sleep(4_500)
      sendRemoteMessage(output, remoteKey("Press", "KEY_CTRL"))
      sendRemoteMessage(output, remoteKey("Click", "KEY_L"))
      sendRemoteMessage(output, remoteKey("Release", "KEY_CTRL"))
      Thread.sleep(450)
       sendRemoteMessage(output, remoteKey("SendInputString", target.toString(), "SendInputString"))
      Thread.sleep(400)
      sendRemoteMessage(output, remoteKey("Click", "KEY_ENTER"))
      Thread.sleep(1_200)
    }
  }

  private fun remoteKey(command: String, data: String, remoteType: String = "SendRemoteKey") =
    """{"method":"ms.remote.control","params":{"Cmd":"$command","DataOfCmd":"$data","Option":"false","TypeOfRemote":"$remoteType"}}"""

  private fun sendRemoteMessage(output: java.io.OutputStream, message: String) {
    val payload = message.toByteArray(Charsets.UTF_8)
    val mask = ByteArray(4)
    SecureRandom().nextBytes(mask)
    output.write(0x81)
    when {
      payload.size < 126 -> output.write(0x80 or payload.size)
      payload.size <= 65_535 -> {
        output.write(0x80 or 126)
        output.write((payload.size shr 8) and 0xff)
        output.write(payload.size and 0xff)
      }
      else -> throw IllegalArgumentException("Remote-control command is too long.")
    }
    output.write(mask)
    val masked = ByteArray(payload.size) { index -> (payload[index].toInt() xor mask[index % 4].toInt()).toByte() }
    output.write(masked)
    output.flush()
  }

  private fun isPrivateIpv4(value: String): Boolean {
    val parts = value.split('.')
    if (parts.size != 4) return false
    val octets = parts.map { it.toIntOrNull() ?: return false }
    if (octets.any { it !in 0..255 }) return false
    return octets[0] == 10 ||
      (octets[0] == 192 && octets[1] == 168) ||
      (octets[0] == 172 && octets[1] in 16..31)
  }
}
