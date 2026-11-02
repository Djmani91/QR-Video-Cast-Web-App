package __PACKAGE__

fun main() {
  val ip = "192.168.1.208"
  var checks = 0
  fun verify(condition: Boolean, message: String) { check(condition) { message }; checks++ }
  fun xml(name: String, maker: String, model: String = "", type: String = "MediaRenderer") =
    "<root xmlns=\"urn:schemas-upnp-org:device-1-0\"><device><deviceType>urn:schemas-upnp-org:device:$type:1</deviceType>" +
      "<friendlyName>$name</friendlyName><manufacturer>$maker</manufacturer><modelName>$model</modelName></device></root>"
  fun dns(service: String, model: String, extra: Map<String, String> = emptyMap()) =
    TvDiscoveryProtocol.fromDns(ip, service, "Living room", mapOf("md" to model) + extra)

  verify(TvDiscoveryProtocol.fromAdvertisement(ip, "ST: roku:ecp")?.type == "roku", "Roku ECP")
  verify(TvDiscoveryProtocol.fromAdvertisement(ip, "ST: urn:lge-com:service:webos-second-screen:1")?.type == "webos", "LG webOS")
  verify(TvDiscoveryProtocol.fromAdvertisement(ip, "ST: urn:samsung.com:device:RemoteControlReceiver:1")?.type == "samsung", "Samsung")
  verify(TvDiscoveryProtocol.fromAdvertisement(ip, "SERVER: Amazon FireTV")?.type == "firetv", "Fire TV")
  verify(TvDiscoveryProtocol.fromAdvertisement(ip, "SERVER: Samsung speaker") == null, "Brand alone is not TV evidence")
  verify(dns("_googlecast._tcp.", "BRAVIA", mapOf("ca" to "4101"))?.type == "chromecast", "Sony Cast")
  verify(dns("_googlecast._tcp.", "TCL Google TV", mapOf("ca" to "5"))?.type == "chromecast", "TCL Cast")
  verify(dns("_googlecast._tcp.", "Chromecast Audio", mapOf("ca" to "4")) == null, "Audio-only Cast")
  verify(dns("_googlecast._tcp.", "Google Home") == null, "Home speaker")
  verify(dns("_airplay._tcp.", "AppleTV14,1")?.type == "appletv", "Apple TV")
  verify(dns("_airplay._tcp.", "HomePod") == null, "HomePod is not Apple TV")
  verify(dns("_airplay._tcp.", "Sonos") == null, "AirPlay speaker")
  for ((name, maker, model) in listOf(
    Triple("BRAVIA", "Sony", "KD-55X80"),
    Triple("Lounge", "Philips", "55PUS8808"),
    Triple("Lounge", "Panasonic", "TX-55LZ980"),
    Triple("Lounge", "Hisense", "55U7K"),
    Triple("Lounge", "TCL", "55C745"),
    Triple("AQUOS", "Sharp", "LC-55"),
    Triple("VIZIO SmartCast TV", "Vizio", "M55")
  )) verify(TvDiscoveryProtocol.fromDescription(ip, xml(name, maker, model), "")?.type == "dlna", "$maker renderer")
  val named = TvDiscoveryProtocol.fromDescription(ip, xml("Living &amp; dining TV", "LG"), "ST: urn:lge-com:service:webos-second-screen:1")
  verify(named?.name == "Living & dining TV" && named.type == "webos", "Friendly names / XML namespaces")
  verify(TvDiscoveryProtocol.fromDescription(ip, xml("Kitchen", "Sonos"), "") == null, "Speaker renderer")
  verify(TvDiscoveryProtocol.fromDescription(ip, xml("Router TV", "Router", type = "InternetGatewayDevice"), "") == null, "Router with TV in name")
  verify(TvDiscoveryProtocol.fromDescription(ip, "<!DOCTYPE x [<!ENTITY x SYSTEM 'file:///etc/passwd'>]>" + xml("&x;", "LG"), "") == null, "External entities rejected")
  verify(TvDiscoveryProtocol.fromDescription(ip, "x".repeat(65_537), "") == null, "Oversize XML")
  verify(TvDiscoveryProtocol.fromDescription(ip, "<broken", "") == null, "Malformed XML")
  verify(TvDiscoveryProtocol.descriptionUrl("LOCATION: http://$ip:8060/", ip) != null, "Roku description URL")
  for (url in listOf("https://example.com/", "http://127.0.0.1/", "http://192.168.1.209/",
    "http://user:pass@$ip/", "file:///etc/passwd", "http://$ip/#fragment", "http://$ip:0/")) {
    verify(TvDiscoveryProtocol.descriptionUrl("LOCATION: $url", ip) == null, "Unsafe location: $url")
  }
  verify(TvDiscoveryProtocol.fromDns("8.8.8.8", "_googlecast._tcp.", "TV", emptyMap()) == null, "Public IP")
  verify(TvDiscoveryProtocol.fromDescription("127.0.0.1", xml("TV", "LG"), "") == null, "Loopback IP")
  fun dial(name: String, maker: String, model: String) =
    xml(name, maker, model).replace("urn:schemas-upnp-org:device:MediaRenderer:1",
      "urn:dial-multiscreen-org:device:dial:1")
  verify(TvDiscoveryProtocol.fromDescription(ip, dial("Living room", "Amazon", "AFTT"), "")?.type == "firetv", "Fire Stick DIAL")
  verify(TvDiscoveryProtocol.fromDescription(ip, dial("Living room", "Google Inc.", "Chromecast"), "")?.type == "chromecast", "Chromecast DIAL")
  verify(TvDiscoveryProtocol.fromDescription(ip, dial("Living room", "Samsung Electronics", "UE55NU7100"), "")?.type == "samsung", "Samsung DIAL")
  verify(TvDiscoveryProtocol.fromDescription(ip, dial("Living room", "Amazon", "Echo"), "") == null, "Amazon name alone not TV evidence")
  verify(TvDiscoveryProtocol.fromDescription(ip, dial("Kitchen", "Google", "Chromecast Audio"), "") == null, "DIAL does not turn speakers into TVs")
  verify(TvDiscoveryProtocol.fromDescription(ip, dial("Printer", "Samsung", "Printer"), "") == null, "Samsung name alone not TV evidence")
  println("Passed $checks native TV discovery protocol checks")
}
