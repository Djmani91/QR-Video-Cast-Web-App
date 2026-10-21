/** Configuration for the phone's embedded Lighttpd server.
 * The library does not supply a default MIME map: HTML must be explicit or
 * TVs can treat the receiver page as an unsupported file download.
 */
export function localServerConfig(prefix: string, extension: string, receiverPath: string, mediaPath: string): string {
  return `
    server.modules += ("mod_alias", "mod_access", "mod_setenv")
    dir-listing.activate = "disable"
    server.range-requests = "enable"
    mimetype.assign += (
      ".html" => "text/html; charset=utf-8",
      ".mp4" => "video/mp4", ".m4v" => "video/mp4",
      ".mov" => "video/quicktime", ".3gp" => "video/3gpp",
      ".webm" => "video/webm", ".mkv" => "video/x-matroska"
    )
    alias.url = (
      "${prefix}/receiver.html" => ${JSON.stringify(receiverPath)},
      "${prefix}/media${extension}" => ${JSON.stringify(mediaPath)}
    )
    $HTTP["url"] !~ "^${prefix}/(receiver[.]html|media[.]${extension.slice(1)})$" {
      url.access-deny = ("")
    }
    setenv.add-response-header = ("Cache-Control" => "no-store", "Referrer-Policy" => "no-referrer")
  `;
}
