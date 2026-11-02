package __PACKAGE__

import java.io.StringReader
import java.net.URI
import javax.xml.parsers.DocumentBuilderFactory
import org.xml.sax.InputSource
import org.xml.sax.helpers.DefaultHandler

internal data class DiscoveredTv(val ip: String, val name: String, val model: String, val type: String,
  val rendererId: String? = null, val flingId: String? = null)

/** Protocol evidence, not brand names alone: speakers/routers must not become TVs. */
internal object TvDiscoveryProtocol {
  fun isPrivateIpv4(value: String): Boolean {
    val parts = value.split('.')
    if (parts.size != 4) return false
    val octets = parts.map { it.toIntOrNull() ?: return false }
    if (octets.any { it !in 0..255 }) return false
    return octets[0] == 10 || (octets[0] == 192 && octets[1] == 168) ||
      (octets[0] == 172 && octets[1] in 16..31)
  }

  fun header(response: String, name: String): String? = response.lineSequence()
    .firstOrNull { it.substringBefore(':').trim().equals(name, true) }
    ?.substringAfter(':')?.trim()?.takeIf { it.isNotEmpty() }

  fun descriptionUrl(response: String, ip: String): String? {
    val raw = header(response, "location") ?: return null
    return try {
      val url = URI(raw)
      if (raw.length > 2048 || !isPrivateIpv4(ip) || url.host != ip ||
        url.scheme?.lowercase() !in listOf("http", "https") || url.userInfo != null ||
        url.fragment != null || url.port == 0 || url.port > 65535) null
      else raw
    } catch (_: Exception) { null }
  }

  fun fromAdvertisement(ip: String, response: String): DiscoveredTv? = when {
    !isPrivateIpv4(ip) -> null
    response.contains("roku:ecp", true) -> DiscoveredTv(ip, "Roku TV / player", "Roku", "roku")
    response.contains("webos-second-screen", true) -> DiscoveredTv(ip, "LG webOS TV", "LG webOS", "webos")
    response.contains("samsung.com:device:RemoteControlReceiver", true) ||
      response.contains("samsung.com:device:MainTVServer", true) ||
      response.contains("samsung.com:service:MultiScreenService", true) ->
      DiscoveredTv(ip, "Samsung TV", "Samsung Smart TV", "samsung")
    response.contains("firetv", true) || response.contains("fire tv", true) ->
      DiscoveredTv(ip, "Amazon Fire TV", "Amazon Fire TV", "firetv")
    else -> null
  }

  fun fromDns(ip: String, service: String, name: String, attributes: Map<String, String>): DiscoveredTv? {
    if (!isPrivateIpv4(ip)) return null
    val model = attributes["md"] ?: attributes["model"] ?: ""
    val type = when (service) {
      "_googlecast._tcp." -> {
        val capabilities = attributes["ca"]?.toLongOrNull()
        if (capabilities != null && capabilities and 1L == 0L) return null
        if (capabilities == null && Regex("chromecast audio|google home|nest (mini|audio)|speaker|homepod",
            RegexOption.IGNORE_CASE).containsMatchIn(model)) return null
        "chromecast"
      }
      "_amzn-wplay._tcp." -> "firetv"
      // AirPlay also advertises speakers. Only identify verified Apple TV models here.
      "_airplay._tcp." -> if (model.startsWith("AppleTV", true)) "appletv" else return null
      else -> return null
    }
    val fallback = when (type) {
      "chromecast" -> "Google Cast display"
      "appletv" -> "Apple TV"
      else -> "Amazon Fire TV"
    }
    return DiscoveredTv(ip, (attributes["fn"] ?: name).take(100), model.ifBlank { fallback }.take(100), type)
  }

  fun fromDescription(ip: String, xml: String, advertisement: String): DiscoveredTv? {
    if (!isPrivateIpv4(ip) || xml.length > 65_536 ||
      Regex("<!\\s*(DOCTYPE|ENTITY)", RegexOption.IGNORE_CASE).containsMatchIn(xml)) return null
    return try {
      val factory = DocumentBuilderFactory.newInstance().apply {
        isNamespaceAware = true
        isExpandEntityReferences = false
      }
      val builder = factory.newDocumentBuilder().apply {
        setEntityResolver { _, _ -> InputSource(StringReader("")) }
        setErrorHandler(DefaultHandler())
      }
      val doc = builder.parse(InputSource(StringReader(xml)))
      fun field(tag: String): String {
        val elements = doc.getElementsByTagNameNS("*", tag)
        return if (elements.length > 0) elements.item(0).textContent.trim().take(100) else ""
      }
      val name = field("friendlyName")
      val model = field("modelName")
      val maker = field("manufacturer")
      val typeElements = doc.getElementsByTagNameNS("*", "deviceType")
      val deviceType = (0 until typeElements.length).joinToString(" ") { typeElements.item(it).textContent }
      val details = "$name $model $maker $deviceType"
      val advertised = fromAdvertisement(ip, advertisement)
      val tvName = Regex("\\btv\\b|television|bravia|viera|aquos|vidaa|smartcast|smart\\s*tv",
        RegexOption.IGNORE_CASE).containsMatchIn(details)
      val knownTvModel = when {
        maker.contains("philips", true) -> Regex("\\d{2}(PUS|PFL|PML|PFS|OLED)", RegexOption.IGNORE_CASE).containsMatchIn(model)
        maker.contains("panasonic", true) -> Regex("^(TX|TH)-", RegexOption.IGNORE_CASE).containsMatchIn(model)
        maker.contains("sharp", true) -> model.startsWith("LC-", true)
        maker.contains("sony", true) -> Regex("^(KD|KDL|XR)-", RegexOption.IGNORE_CASE).containsMatchIn(model)
        maker.contains("samsung", true) -> Regex("^(UE|UN|UA|QE|QN|HG|LE|LN|PS|PN)\\d{2}", RegexOption.IGNORE_CASE).containsMatchIn(model)
        maker.contains("hisense", true) -> Regex("^\\d{2,3}[AEHU]\\d", RegexOption.IGNORE_CASE).containsMatchIn(model)
        maker.contains("tcl", true) -> Regex("^\\d{2,3}[CPQSTV]\\d", RegexOption.IGNORE_CASE).containsMatchIn(model)
        maker.contains("vizio", true) -> Regex("^[DEMPV]\\d{2}", RegexOption.IGNORE_CASE).containsMatchIn(model)
        else -> false
      }
      val rendererTv = deviceType.contains("MediaRenderer", true) && (tvName || knownTvModel)
      val dial = deviceType.contains("urn:dial-multiscreen-org:device:dial:", true)
      val fireModel = Regex("^(AFT[A-Z0-9]+|Fire\\s*TV.*)$", RegexOption.IGNORE_CASE).matches(model)
      val type = when {
        advertised != null -> advertised.type
        deviceType.contains("roku", true) -> "roku"
        xml.contains("webos-second-screen", true) -> "webos"
        dial && maker.contains("amazon", true) && fireModel -> "firetv"
        dial && maker.contains("google", true) &&
          model.contains("chromecast", true) && !model.contains("audio", true) -> "chromecast"
        dial && maker.contains("samsung", true) && (tvName || knownTvModel) -> "samsung"
        rendererTv && maker.contains("samsung", true) -> "samsung"
        rendererTv -> "dlna"
        else -> return null
      }
      val fallback = advertised?.name ?: "$maker TV".trim()
      DiscoveredTv(ip, name.ifBlank { fallback }, model.ifBlank { maker }.take(100), type)
    } catch (_: Exception) { null }
  }
}
