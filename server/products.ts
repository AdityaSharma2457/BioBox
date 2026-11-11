export type ProductPreview = {
  title: string
  imageUrl: string
  price: string
  currency: string
  provider: string
}

const approvedHosts = [
  'amazon.com',
  'amazon.in',
  'flipkart.com',
  'myntra.com',
  'meesho.com',
  'zara.com',
  'ajio.com',
  'snapdeal.com',
  'nykaa.com',
  'nykaafashion.com',
  'myshopify.com',
]

function isApprovedHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return approvedHosts.some((approved) => host === approved || host.endsWith(`.${approved}`))
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .trim()
}

function metaContent(html: string, key: string): string {
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = new Map<string, string>()
    for (const attr of tag[0].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attributes.set(attr[1].toLowerCase(), attr[2] ?? attr[3] ?? attr[4] ?? '')
    }
    const name = (attributes.get('property') ?? attributes.get('name') ?? attributes.get('itemprop') ?? '').toLowerCase()
    if (name === key.toLowerCase()) return decodeHtml(attributes.get('content') ?? '')
  }
  return ''
}

function productJsonLd(html: string): Record<string, unknown> | null {
  for (const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try {
      const parsed: unknown = JSON.parse(script[1])
      const queue: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed]
      while (queue.length) {
        const candidate = queue.shift()
        if (!candidate || typeof candidate !== 'object') continue
        if (Array.isArray(candidate)) {
          queue.push(...candidate)
          continue
        }
        const record = candidate as Record<string, unknown>
        const types = Array.isArray(record['@type']) ? record['@type'] : [record['@type']]
        if (types.some((type) => typeof type === 'string' && type.split('/').pop() === 'Product')) return record
        if (record['@graph']) queue.push(record['@graph'])
      }
    } catch {
      continue
    }
  }
  return null
}

function firstString(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return firstString(value[0])
  if (value && typeof value === 'object' && 'url' in value) {
    return firstString((value as Record<string, unknown>).url)
  }
  return ''
}

function productOffer(product: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!product) return null
  const offers = product.offers
  if (Array.isArray(offers)) return offers.find((offer) => offer && typeof offer === 'object') as Record<string, unknown> | undefined ?? null
  return offers && typeof offers === 'object' ? offers as Record<string, unknown> : null
}

function text(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string') return decodeHtml(value).slice(0, 40)
  return ''
}

export async function fetchProductPreview(value: string): Promise<ProductPreview | null> {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !isApprovedHost(url.hostname) ||
    url.toString().length > 2048
  ) return null

  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/html', 'User-Agent': 'BioBoxProductPreview/1.0' },
      redirect: 'error',
      signal: AbortSignal.timeout(6000),
    })
    if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('text/html')) return null
    const reader = response.body?.getReader()
    if (!reader) return null
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value: chunk } = await reader.read()
      if (done) break
      size += chunk.length
      if (size > 1_000_000) {
        await reader.cancel()
        return null
      }
      chunks.push(chunk)
    }
    const html = new TextDecoder().decode(Buffer.concat(chunks))
    const product = productJsonLd(html)
    const offer = productOffer(product)
    const imageValue = firstString(product?.image) || metaContent(html, 'og:image')
    let imageUrl = ''
    try {
      const parsedImage = new URL(imageValue, url)
      if (parsedImage.protocol === 'https:') imageUrl = parsedImage.toString()
    } catch {
      imageUrl = ''
    }
    const title = text(product?.name) || metaContent(html, 'og:title') || metaContent(html, 'twitter:title')
    const price = text(offer?.price ?? offer?.lowPrice) ||
      metaContent(html, 'product:price:amount') ||
      metaContent(html, 'og:price:amount') ||
      metaContent(html, 'price')
    const currency = (text(offer?.priceCurrency) || metaContent(html, 'product:price:currency') ||
      metaContent(html, 'og:price:currency') || 'INR').toUpperCase()
    if (!title && !imageUrl && !price) return null
    return {
      title: title.slice(0, 120),
      imageUrl,
      price,
      currency: /^[A-Z]{3}$/.test(currency) ? currency : 'INR',
      provider: url.hostname.replace(/^www\./, ''),
    }
  } catch {
    return null
  }
}
