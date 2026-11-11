export type LinkPreview = { title: string; imageUrl?: string; provider: string }

const providers = [
  {
    name: 'Spotify',
    accepts: (url: URL) => url.hostname === 'open.spotify.com' && /^\/(track|album|playlist|artist|episode|show)\/[A-Za-z0-9]+/.test(url.pathname),
    endpoint: (url: string) => `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
  },
  {
    name: 'YouTube',
    accepts: (url: URL) => ['youtube.com', 'www.youtube.com', 'youtu.be'].includes(url.hostname),
    endpoint: (url: string) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
  },
  {
    name: 'SoundCloud',
    accepts: (url: URL) => url.hostname === 'soundcloud.com' || url.hostname === 'www.soundcloud.com',
    endpoint: (url: string) => `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`,
  },
]

export async function fetchLinkPreview(value: string): Promise<LinkPreview | null> {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null

  const provider = providers.find((candidate) => candidate.accepts(url))
  if (!provider) return null

  try {
    const response = await fetch(provider.endpoint(url.toString()), {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return null
    const contentLength = Number(response.headers.get('content-length') ?? 0)
    if (contentLength > 64_000) return null

    const body = await response.text()
    if (body.length > 64_000) return null
    const data: unknown = JSON.parse(body)
    if (!data || typeof data !== 'object') return null
    const metadata = data as Record<string, unknown>
    const title = typeof metadata.title === 'string' ? metadata.title.trim().slice(0, 100) : ''
    const imageUrl = typeof metadata.thumbnail_url === 'string' ? metadata.thumbnail_url : undefined
    if (!title) return null
    if (imageUrl) {
      try {
        if (new URL(imageUrl).protocol !== 'https:') return { title, provider: provider.name }
      } catch {
        return { title, provider: provider.name }
      }
    }
    return { title, imageUrl, provider: provider.name }
  } catch {
    return null
  }
}
