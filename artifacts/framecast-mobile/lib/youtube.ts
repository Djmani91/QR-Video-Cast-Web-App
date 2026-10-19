export function getYouTubeVideoId(input: string): string | null {
  try {
    const url = new URL(input);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
    let id: string | null = null;

    if (hostname === 'youtu.be') {
      id = url.pathname.split('/').filter(Boolean)[0] ?? null;
    } else if (hostname === 'youtube.com' || hostname === 'youtube-nocookie.com') {
      id = url.searchParams.get('v');
      if (!id) id = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?]+)/)?.[1] ?? null;
    }

    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
