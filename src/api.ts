import type { Portfolio, PortfolioBlock, PortfolioProduct, PlanKey } from '../shared/model'

export type AccountView = {
  user: { id: number; email: string }
  portfolio: Portfolio
  subscription: null | {
    plan: PlanKey
    startsAt: string
    expiresAt: string
    active: boolean
  }
}

export type LinkPreview = { title: string; imageUrl?: string; provider: string }
export type ProductPreview = {
  title: string
  imageUrl: string
  price: string
  currency: string
  provider: string
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: init.body instanceof FormData
      ? init.headers
      : { 'Content-Type': 'application/json', ...init.headers },
  })
  if (response.status === 204) return undefined as T

  const data = await response.json() as { error?: string } & T
  if (!response.ok) {
    throw new ApiError(data.error ?? 'Something went wrong. Please try again.', response.status)
  }
  return data
}

export function savePortfolio(portfolio: Portfolio): Promise<AccountView> {
  return api<AccountView>('/portfolio', { method: 'PUT', body: JSON.stringify(portfolio) })
}

export async function uploadImage(file: File): Promise<string> {
  const body = new FormData()
  body.set('image', file)
  const result = await api<{ imageUrl: string }>('/assets', { method: 'POST', body })
  return result.imageUrl
}

export function previewProduct(url: string): Promise<ProductPreview> {
  return api<ProductPreview>(`/product-preview?url=${encodeURIComponent(url)}`)
}

export function makeBlockId(): string {
  return crypto.randomUUID()
}

export type { Portfolio, PortfolioBlock, PortfolioProduct, PlanKey }
