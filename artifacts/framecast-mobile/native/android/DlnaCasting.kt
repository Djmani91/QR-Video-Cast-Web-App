package __PACKAGE__

import java.io.StringReader
import java.net.URI
import java.net.Proxy
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.xml.parsers.DocumentBuilderFactory
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.w3c.dom.Element
import org.xml.sax.InputSource

/** Only endpoints learned from a bounded, same-peer SSDP description are usable. */
internal object DlnaCasting {
  private data class Renderer(val url: String, val service: String, val discoveredAt: Long)
  private val renderers = ConcurrentHashMap<String, Renderer>()
  private var selected: Renderer? = null
  private val http = OkHttpClient.Builder().proxy(Proxy.NO_PROXY)
    .connectTimeout(3, TimeUnit.SECONDS).readTimeout(5, TimeUnit.SECONDS)
    .callTimeout(7, TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).build()

  fun register(ip: String, location: String, xml: String): String? {
    if (xml.length > 65_536 || Regex("<!\\s*(DOCTYPE|ENTITY)", RegexOption.IGNORE_CASE).containsMatchIn(xml)) return null
    try {
      val doc = parse(xml)
      val services = doc.getElementsByTagNameNS("*", "service")
      for (i in 0 until services.length) {
        val service = services.item(i) as? Element ?: continue
        fun field(name: String) = service.getElementsByTagNameNS("*", name).item(0)?.textContent?.trim().orEmpty()
        val type = field("serviceType")
        if (!Regex("^urn:schemas-upnp-org:service:AVTransport:[1-3]$").matches(type)) continue
        val base = doc.getElementsByTagNameNS("*", "URLBase").item(0)?.textContent?.trim()
          ?.takeIf { it.isNotEmpty() } ?: location
        val url = URI(base).resolve(field("controlURL"))
        if (field("controlURL").isBlank() || !TvDiscoveryProtocol.isPrivateIpv4(ip) ||
          url.host != ip || url.scheme !in listOf("http", "https") || url.userInfo != null ||
          url.fragment != null || url.port == 0 || url.port > 65535) continue
        val now = System.currentTimeMillis()
        renderers.entries.removeAll { now - it.value.discoveredAt > 10 * 60_000 }
        val existing = renderers.entries.firstOrNull { it.value.url == url.toString() }
        val id = existing?.key ?: UUID.randomUUID().toString()
        if (existing == null && renderers.size >= 64) return null
        renderers[id] = Renderer(url.toString(), type, now)
        return id
      }
    } catch (_: Exception) { /* Malformed/untrusted metadata is never a connection. */ }
    return null
  }

  private fun parse(xml: String) = DocumentBuilderFactory.newInstance().apply {
    isNamespaceAware = true
    isExpandEntityReferences = false
  }.newDocumentBuilder().apply {
    setEntityResolver { _, _ -> InputSource(StringReader("")) }
  }.parse(InputSource(StringReader(xml)))

  fun connect(id: String) {
    val renderer = renderers[id]?.takeIf { System.currentTimeMillis() - it.discoveredAt < 10 * 60_000 }
      ?: throw IllegalStateException("That receiver is no longer available. Scan again.")
    // A scan result or HTTP success alone is insufficient: require a real SOAP response.
    val result = request(renderer, "GetTransportInfo", "<InstanceID>0</InstanceID>")
    if (!result.contains("CurrentTransportState")) throw IllegalStateException("This TV did not confirm its playback receiver.")
    selected = renderer
  }

  fun load(url: String, mime: String, title: String) {
    val renderer = selected ?: throw IllegalStateException("Connect a TV first.")
    validateMedia(url, mime)
    val category = if (mime.startsWith("image/")) "object.item.imageItem.photo" else "object.item.videoItem"
    val metadata = """<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"><item id="0" parentID="0" restricted="1"><dc:title>${escape(title.take(200))}</dc:title><upnp:class>$category</upnp:class><res protocolInfo="http-get:*:${escape(mime)}:*">${escape(url)}</res></item></DIDL-Lite>"""
    request(renderer, "SetAVTransportURI", "<InstanceID>0</InstanceID><CurrentURI>${escape(url)}</CurrentURI><CurrentURIMetaData>${escape(metadata)}</CurrentURIMetaData>")
    request(renderer, "Play", "<InstanceID>0</InstanceID><Speed>1</Speed>")
  }

  fun status(): Map<String, Any> {
    val renderer = selected ?: throw IllegalStateException("The TV is disconnected.")
    val state = text(request(renderer, "GetTransportInfo", "<InstanceID>0</InstanceID>"), "CurrentTransportState")
    if (state.isBlank()) throw IllegalStateException("The TV did not return its playback state.")
    var position = 0.0
    var duration = 0.0
    // Position reporting is optional for photos and some renderers.
    try {
      val response = request(renderer, "GetPositionInfo", "<InstanceID>0</InstanceID>")
      position = seconds(text(response, "RelTime"))
      duration = seconds(text(response, "TrackDuration"))
    } catch (_: Exception) {}
    return mapOf("state" to state, "position" to position, "duration" to duration)
  }

  fun control(action: String, seconds: Double) {
    val renderer = selected ?: throw IllegalStateException("The TV is disconnected.")
    val args = "<InstanceID>0</InstanceID>"
    when (action) {
      "play" -> request(renderer, "Play", "$args<Speed>1</Speed>")
      "pause" -> request(renderer, "Pause", args)
      "stop" -> request(renderer, "Stop", args)
      "seek" -> {
        val t = seconds.coerceIn(0.0, 359_999.0).toLong()
        val time = "%02d:%02d:%02d".format(java.util.Locale.US, t / 3600, t / 60 % 60, t % 60)
        request(renderer, "Seek", "$args<Unit>REL_TIME</Unit><Target>$time</Target>")
      }
      else -> throw IllegalArgumentException("This receiver control is not supported.")
    }
  }

  fun disconnect() {
    try { if (selected != null) control("stop", 0.0) } finally { selected = null }
  }

  private fun request(renderer: Renderer, action: String, args: String): String {
    val body = """<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:$action xmlns:u="${renderer.service}">$args</u:$action></s:Body></s:Envelope>"""
    val request = Request.Builder().url(renderer.url)
      .header("SOAPAction", "\"${renderer.service}#$action\"")
      .post(body.toRequestBody("text/xml; charset=utf-8".toMediaType())).build()
    return http.newCall(request).execute().use { response ->
      val source = response.body?.source() ?: throw IllegalStateException("The TV returned an empty response.")
      source.request(65_537)
      if (source.buffer.size > 65_536) throw IllegalStateException("The TV response was too large.")
      val xml = source.readUtf8()
      if (!response.isSuccessful || xml.contains("Fault", true)) {
        val code = text(xml, "errorCode")
        throw IllegalStateException("The TV rejected $action${if (code.isNotBlank()) " (receiver error $code)" else ""}. The selected format or control may not be supported.")
      }
      if (!xml.contains("${action}Response")) throw IllegalStateException("The TV did not acknowledge $action.")
      xml
    }
  }

  private fun text(xml: String, name: String): String {
    if (Regex("<!\\s*(DOCTYPE|ENTITY)", RegexOption.IGNORE_CASE).containsMatchIn(xml)) return ""
    return try { parse(xml).getElementsByTagNameNS("*", name).item(0)?.textContent.orEmpty() } catch (_: Exception) { "" }
  }

  private fun seconds(value: String): Double {
    val parts = value.split(":").map { it.toDoubleOrNull() ?: return 0.0 }
    return if (parts.size == 3) parts[0] * 3600 + parts[1] * 60 + parts[2] else 0.0
  }

  fun validateMedia(url: String, mime: String) {
    val uri = URI(url)
    require(url.length <= 8192 && uri.scheme in listOf("http", "https") && uri.host != null &&
      uri.userInfo == null && uri.fragment == null) { "Use a directly playable HTTP or HTTPS media URL." }
    require(Regex("^(video|image|application)/[a-zA-Z0-9.+-]+$").matches(mime)) { "Unsupported media type." }
  }
  private fun escape(value: String) = value.replace("&", "&amp;").replace("<", "&lt;")
    .replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&apos;")
}
