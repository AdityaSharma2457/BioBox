const reservedInstagramPaths = new Set([
  'accounts',
  'about',
  'direct',
  'explore',
  'legal',
  'p',
  'reel',
  'reels',
  'stories',
])

export function instagramProfileFromUrl(value: string): { url: string; username: string } | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname.toLowerCase())) {
      return null
    }

    const username = url.pathname.split('/').filter(Boolean)[0] ?? ''
    if (
      !/^[a-zA-Z0-9._]{1,30}$/.test(username) ||
      reservedInstagramPaths.has(username.toLowerCase())
    ) {
      return null
    }
    return { url: `https://www.instagram.com/${username}/`, username }
  } catch {
    return null
  }
}
