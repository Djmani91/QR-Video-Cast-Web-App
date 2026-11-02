package __PACKAGE__

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import java.net.DatagramPacket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.MulticastSocket
import java.net.Proxy
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean
import okhttp3.OkHttpClient
import okhttp3.Request

internal object TvDiscovery {
  fun scan(context: Context): List<DiscoveredTv> = scanNearby(context).filter { it.type == "samsung" }

  fun scanNearby(context: Context): List<DiscoveredTv> {
    val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
      ?: throw IllegalStateException("Android could not access Wi-Fi network information.")
    // A default route can point at mobile data or a VPN even while Wi-Fi is on.
    // Bind only this scan's sockets, never the application's global network.
    @Suppress("DEPRECATION")
    val wifiNetwork = connectivity.allNetworks.firstOrNull { network ->
      val caps = connectivity.getNetworkCapabilities(network)
      caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true &&
        !caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
    } ?: throw IllegalStateException("Connect this phone to Wi-Fi before scanning for TVs.")
    val links = connectivity.getLinkProperties(wifiNetwork)
      ?: throw IllegalStateException("The Wi-Fi connection is not ready. Try scanning again.")
    val localAddress = links.linkAddresses.map { it.address }.firstOrNull {
      it is Inet4Address && isPrivateIpv4(it.hostAddress ?: "")
    } ?: throw IllegalStateException("This Wi-Fi has no supported local IPv4 address. Use the TV QR/code instead.")
    val wifiInterface = links.interfaceName?.let { NetworkInterface.getByName(it) }
      ?: throw IllegalStateException("The Wi-Fi interface is unavailable. Reconnect Wi-Fi and rescan.")
    val results = ConcurrentHashMap<String, DiscoveredTv>()
    val active = AtomicBoolean(true)
    val resolving = ConcurrentHashMap.newKeySet<String>()
    val resolveBusy = AtomicBoolean(false)
    val resolveQueue = ConcurrentLinkedQueue<Pair<NsdServiceInfo, String>>()
    val nsd = context.getSystemService(Context.NSD_SERVICE) as? NsdManager
    val listeners = mutableListOf<NsdManager.DiscoveryListener>()
    val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
    val lock = wifi?.createMulticastLock("framecast-tv-discovery")
    val descriptions = Executors.newFixedThreadPool(2)
    val described = ConcurrentHashMap.newKeySet<String>()
    val http = OkHttpClient.Builder().connectTimeout(600, TimeUnit.MILLISECONDS)
      .readTimeout(800, TimeUnit.MILLISECONDS).callTimeout(1200, TimeUnit.MILLISECONDS)
      .proxy(Proxy.NO_PROXY)
      .socketFactory(wifiNetwork.socketFactory)
      .followRedirects(false).followSslRedirects(false).build()
    fun describe(ip: String, response: String) {
      val location = TvDiscoveryProtocol.descriptionUrl(response, ip) ?: return
      if (described.size >= 24 || !described.add(ip)) return
      descriptions.submit {
        if (!active.get()) return@submit
        try {
          // LOCATION is untrusted LAN input. Exact peer-IP validation, no redirects,
          // no credentials, bounded bytes/time and no entity resolution are mandatory.
          http.newCall(Request.Builder().url(location).build()).execute().use { reply ->
            if (!reply.isSuccessful) return@use
            val body = reply.body ?: return@use
            val output = ByteArrayOutputStream()
            body.byteStream().use { stream ->
              val buffer = ByteArray(4096)
              while (output.size() <= 65_536) {
                val count = stream.read(buffer)
                if (count == -1) break
                output.write(buffer, 0, count)
              }
            }
            if (output.size() > 65_536) return@use
            val device = TvDiscoveryProtocol.fromDescription(ip, output.toString("UTF-8"), response)
            if (device != null && active.get() && results.size < 32) results["${device.type}:$ip"] = device
          }
        } catch (_: Exception) {
          // Metadata is optional; a verified protocol advertisement remains listed.
        }
      }
    }
    fun resolveNext() {
      if (!active.get() || !resolveBusy.compareAndSet(false, true)) return
      val pending = resolveQueue.poll()
      if (pending == null) { resolveBusy.set(false); return }
      @Suppress("DEPRECATION")
      try {
        nsd?.resolveService(pending.first, object : NsdManager.ResolveListener {
          private fun finished() { resolveBusy.set(false); resolveNext() }
          override fun onResolveFailed(service: NsdServiceInfo, error: Int) { finished() }
          override fun onServiceResolved(service: NsdServiceInfo) {
            try {
              if (!active.get()) return
              @Suppress("DEPRECATION")
              val ip = service.host?.hostAddress ?: return
              if (!isPrivateIpv4(ip)) return
               val attributes = service.attributes.mapValues { it.value.toString(Charsets.UTF_8).take(100) }
               val device = TvDiscoveryProtocol.fromDns(ip, pending.second, service.serviceName, attributes) ?: return
               results["${device.type}:$ip"] = device
            } finally { finished() }
          }
        })
      } catch (_: Exception) {
        resolveBusy.set(false)
        resolveNext()
      }
    }
    try {
      lock?.setReferenceCounted(false)
      lock?.acquire()
      // DNS-SD discovers Google Cast and older Amazon advertisements. No subnet
      // sweep, cloud device registry, debug bridge, or remote launches on discovery.
       listOf("_googlecast._tcp.", "_amzn-wplay._tcp.", "_airplay._tcp.").forEach { serviceType ->
        val listener = object : NsdManager.DiscoveryListener {
          override fun onDiscoveryStarted(type: String) {}
          override fun onDiscoveryStopped(type: String) {}
          override fun onStartDiscoveryFailed(type: String, error: Int) {}
          override fun onStopDiscoveryFailed(type: String, error: Int) {}
          override fun onServiceLost(info: NsdServiceInfo) {}
          override fun onServiceFound(info: NsdServiceInfo) {
            val key = "$serviceType:${info.serviceName}"
            if (!active.get() || results.size >= 32 || resolving.size >= 32 || !resolving.add(key)) return
            // Older Android releases permit only one resolver at a time.
            resolveQueue.add(info to serviceType)
            resolveNext()
          }
        }
        try {
          if (Build.VERSION.SDK_INT >= 33) {
            nsd?.discoverServices(serviceType, NsdManager.PROTOCOL_DNS_SD, wifiNetwork,
              java.util.concurrent.Executor { task -> if (active.get()) task.run() }, listener)
          } else {
            nsd?.discoverServices(serviceType, NsdManager.PROTOCOL_DNS_SD, listener)
          }
          listeners.add(listener)
        } catch (_: Exception) {
          // SSDP remains available if the platform rejects a DNS-SD service.
        }
      }
      MulticastSocket(null).use { socket ->
        socket.reuseAddress = true
        socket.bind(InetSocketAddress(localAddress, 0))
        wifiNetwork.bindSocket(socket)
        socket.networkInterface = wifiInterface
        socket.timeToLive = 2
        socket.soTimeout = 250
        val group = InetAddress.getByName("239.255.255.250")
         val targets = listOf("ssdp:all", "roku:ecp", "urn:lge-com:service:webos-second-screen:1",
           "urn:dial-multiscreen-org:service:dial:1", "urn:samsung.com:device:RemoteControlReceiver:1",
           "urn:schemas-upnp-org:device:MediaRenderer:1")
         fun search() { targets.forEach { target ->
          val request = ("M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\n" +
            "MAN: \"ssdp:discover\"\r\nMX: 2\r\nST: $target\r\n\r\n").toByteArray(Charsets.US_ASCII)
          socket.send(DatagramPacket(request, request.size, group, 1900))
        } }
        search()
        val started = System.nanoTime()
        var repeated = false
        val buffer = ByteArray(8_192)
        while (TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started) < 7_000) {
          if (!repeated && TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started) >= 2_500) {
            repeated = true
            search()
          }
          try {
            val packet = DatagramPacket(buffer, buffer.size)
            socket.receive(packet)
            val ip = packet.address.hostAddress ?: continue
            if (!isPrivateIpv4(ip) || results.size >= 32) continue
            val response = String(packet.data, packet.offset, packet.length, Charsets.UTF_8)
             val device = TvDiscoveryProtocol.fromAdvertisement(ip, response)
            if (device != null) results.putIfAbsent("${device.type}:$ip", device)
             describe(ip, response)
          } catch (_: java.net.SocketTimeoutException) {
            // The bounded receive window also gives DNS-SD time to resolve names.
          }
        }
      }
       descriptions.shutdown()
       descriptions.awaitTermination(750, TimeUnit.MILLISECONDS)
       val snapshot = results.values.toList()
       val namedPlatforms = snapshot.filter { it.type != "dlna" }.map { it.ip }.toSet()
       return snapshot.filterNot { it.type == "dlna" && it.ip in namedPlatforms }
         .sortedWith(compareBy({ it.type }, { it.name }, { it.ip })).take(32)
    } finally {
      active.set(false)
       http.dispatcher.cancelAll()
       descriptions.shutdownNow()
       http.connectionPool.evictAll()
      listeners.forEach { try { nsd?.stopServiceDiscovery(it) } catch (_: Exception) {} }
      if (lock?.isHeld == true) lock.release()
    }
  }

  fun openBrowser(context: Context, ip: String, targetUrl: String) =
    SamsungBrowserRemote.open(context, ip, targetUrl)

  internal fun isPrivateIpv4(value: String): Boolean {
    return TvDiscoveryProtocol.isPrivateIpv4(value)
  }
}
