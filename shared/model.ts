import { z } from 'zod'

const httpsUrl = z.string().url().refine((value) => new URL(value).protocol === 'https:')
const imageSource = z.string().max(2048).refine((value) => {
  if (/^\/api\/assets\/[0-9a-f-]{36}$/i.test(value)) return true
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
})

function socialProfile(hosts: string[]) {
  return z.union([z.literal(''), z.string().url().max(2048).refine((value) => {
    try {
      const { protocol, hostname } = new URL(value)
      const host = hostname.toLowerCase()
      return protocol === 'https:' && hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
    } catch {
      return false
    }
  })]).default('')
}

export const portfolioSocialsSchema = z.object({
  instagram: socialProfile(['instagram.com']),
  youtube: socialProfile(['youtube.com', 'youtu.be']),
  x: socialProfile(['x.com', 'twitter.com']),
  facebook: socialProfile(['facebook.com', 'fb.com']),
  snapchat: socialProfile(['snapchat.com']),
  email: z.union([z.literal(''), z.string().trim().email().max(254)]).default(''),
})

export const portfolioBlockSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string().min(1).max(80),
    type: z.literal('link'),
    url: httpsUrl,
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().max(220).default(''),
    imageUrl: imageSource.optional(),
    provider: z.string().max(40).optional(),
  }),
  z.object({
    id: z.string().min(1).max(80),
    type: z.literal('image'),
    imageUrl: imageSource,
    alt: z.string().trim().max(180).default(''),
    caption: z.string().trim().max(120).default(''),
  }),
])

export const productSchema = z.object({
  id: z.string().min(1).max(80),
  url: httpsUrl,
  title: z.string().trim().min(1).max(120),
  imageUrl: z.union([z.literal(''), imageSource]).default(''),
  price: z.string().trim().max(40).default(''),
  currency: z.string().regex(/^[A-Z]{3}$/).default('INR'),
})

export const portfolioSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/),
  displayName: z.string().trim().min(1).max(60),
  bio: z.string().trim().max(180).default(''),
  instagramUrl: httpsUrl.refine((value) => {
    const host = new URL(value).hostname.toLowerCase()
    return host === 'instagram.com' || host === 'www.instagram.com'
  }),
  instagramUsername: z.string().trim().max(30).default(''),
  instagramPhotoUrl: z.union([z.literal(''), imageSource]).default(''),
  template: z.enum(['paper', 'studio', 'night']),
  theme: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  font: z.enum(['sans', 'serif', 'rounded', 'mono']).default('sans'),
  socials: portfolioSocialsSchema.default({
    instagram: '',
    youtube: '',
    x: '',
    facebook: '',
    snapchat: '',
    email: '',
  }),
  blocks: z.array(portfolioBlockSchema).max(20),
  products: z.array(productSchema).max(20).default([]),
})

export type PortfolioBlock = z.infer<typeof portfolioBlockSchema>
export type PortfolioProduct = z.infer<typeof productSchema>
export type PortfolioSocials = z.infer<typeof portfolioSocialsSchema>
export type Portfolio = z.infer<typeof portfolioSchema>
export type PlanKey = 'free' | 'monthly' | 'yearly'

export const planCatalog: Record<PlanKey, { name: string; pricePaise: number; durationDays: number }> = {
  free: { name: '7-day pass', pricePaise: 0, durationDays: 7 },
  monthly: { name: 'Monthly', pricePaise: 75000, durationDays: 30 },
  yearly: { name: 'Yearly', pricePaise: 300000, durationDays: 365 },
}
