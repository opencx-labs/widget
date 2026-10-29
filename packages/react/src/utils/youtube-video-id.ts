const VIDEO_ID = /^[\w-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

/** Video id of a YouTube watch, short, embed or youtu.be link; null for any other URL. */
export function getYouTubeVideoId(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    // Not an absolute URL — includes every relative form.
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const id = videoIdFromPath(url);
  return id && VIDEO_ID.test(id) ? id : null;
}

function videoIdFromPath(url: URL): string | null | undefined {
  const [first, second] = url.pathname.split('/').filter(Boolean);
  if (url.hostname === 'youtu.be') return first;
  if (!YOUTUBE_HOSTS.has(url.hostname)) return null;
  if (first === 'watch') return url.searchParams.get('v');
  if (first === 'shorts' || first === 'embed') return second;
  return null;
}
