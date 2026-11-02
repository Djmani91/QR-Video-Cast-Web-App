/** Configuration for the phone's embedded Lighttpd server.
 * The library does not supply a default MIME map: HTML must be explicit or
 * TVs can treat the receiver page as an unsupported file download.
 */
export function localServerConfig(prefix: string, extension: string, receiverPath: string, mediaPath: string, receiverOrigins: string[] = [], googleCast = false): string {
  const cors = [...new Set(receiverOrigins)].map(origin => {
    const url = new URL(origin);
    if (url.protocol !== 'http:' || url.origin !== origin || url.username || url.password
      || !/^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(url.hostname)
      || url.hostname.split('.').some(part => Number(part) > 255)) {
      throw new Error('Invalid local receiver origin.');
    }
    return `
    $REQUEST_HEADER["Origin"] == ${JSON.stringify(origin)} {
      setenv.add-response-header += (
        "Access-Control-Allow-Origin" => ${JSON.stringify(origin)},
        "Access-Control-Allow-Methods" => "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers" => "Range",
        "Access-Control-Expose-Headers" => "Content-Length, Content-Range",
        "Vary" => "Origin"
      )
    }`;
  }).join('\n');
  return `
    server.modules += ("mod_alias", "mod_access", "mod_setenv")
    dir-listing.activate = "disable"
    server.range-requests = "enable"
    mimetype.assign += (
      ".html" => "text/html; charset=utf-8",
      ".mp4" => "video/mp4", ".m4v" => "video/mp4",
      ".mov" => "video/quicktime", ".3gp" => "video/3gpp",
      ".webm" => "video/webm", ".mkv" => "video/x-matroska",
      ".jpg" => "image/jpeg", ".jpeg" => "image/jpeg",
      ".png" => "image/png", ".webp" => "image/webp"
    )
    alias.url = (
      "${prefix}/receiver.html" => ${JSON.stringify(receiverPath)},
      "${prefix}/media${extension}" => ${JSON.stringify(mediaPath)}
    )
    $HTTP["url"] !~ "^${prefix}/(receiver[.]html|media[.]${extension.slice(1)})$" {
      url.access-deny = ("")
    }
    setenv.add-response-header = (
      "Cache-Control" => "no-store",
      "Referrer-Policy" => "no-referrer"
    )
    ${cors}
    ${googleCast ? `
    $REQUEST_HEADER["Origin"] == "https://www.gstatic.com" {
      setenv.add-response-header += (
        "Access-Control-Allow-Origin" => "https://www.gstatic.com",
        "Access-Control-Allow-Methods" => "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers" => "Range",
        "Access-Control-Expose-Headers" => "Content-Length, Content-Range",
        "Vary" => "Origin"
      )
    }` : ''}
  `;
}
