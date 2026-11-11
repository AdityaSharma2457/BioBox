import bcrypt from 'bcryptjs'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { portfolioSchema, planCatalog, type PlanKey, type Portfolio } from '../shared/model.js'
import { issueSession, requireAuth, sessionCookie } from './auth.js'
import type { AppDatabase } from './db.js'
import { instagramProfileFromUrl } from './instagram.js'
import { fetchLinkPreview } from './previews.js'
import { fetchProductPreview } from './products.js'

const authInput = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(10).max(100).refine((value) => Buffer.byteLength(value, 'utf8') <= 72),
  instagramUrl: z.string().url().max(2048),
})
const loginInput = authInput.pick({ email: true, password: true })
const planInput = z.object({
  plan: z.enum(['free', 'monthly', 'yearly']),
  coupon: z.string().trim().toUpperCase().max(32).optional(),
})
const profileSchema = portfolioSchema

type AppOptions = { db: AppDatabase; jwtSecret: string; clientOrigin?: string; isProduction?: boolean }

function nowIso(): string {
  return new Date().toISOString()
}

function setSessionCookie(res: express.Response, token: string, isProduction: boolean): void {
  res.cookie(sessionCookie, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  })
}

function userView(db: AppDatabase, userId: number) {
  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId) as
    | { id: number; email: string }
    | undefined
  const row = db.prepare(`
    SELECT slug, display_name, bio, instagram_url, instagram_username, instagram_photo_url,
      template, theme, font_family, socials_json, blocks_json, products_json
    FROM portfolios WHERE user_id = ?
  `).get(userId) as Record<string, string> | undefined
  const subscription = db.prepare(`
    SELECT plan, starts_at, expires_at FROM subscriptions WHERE user_id = ?
  `).get(userId) as { plan: PlanKey; starts_at: string; expires_at: string } | undefined

  if (!user || !row) return null
  const portfolio: Portfolio = portfolioSchema.parse({
    slug: row.slug,
    displayName: row.display_name,
    bio: row.bio,
    instagramUrl: row.instagram_url,
    instagramUsername: row.instagram_username,
    instagramPhotoUrl: row.instagram_photo_url,
    template: row.template as Portfolio['template'],
    theme: row.theme,
    font: row.font_family,
    socials: JSON.parse(row.socials_json || '{}'),
    blocks: JSON.parse(row.blocks_json || '[]'),
    products: JSON.parse(row.products_json || '[]'),
  })
  return {
    user,
    portfolio,
    subscription: subscription
      ? {
          plan: subscription.plan,
          startsAt: subscription.starts_at,
          expiresAt: subscription.expires_at,
          active: Date.parse(subscription.expires_at) > Date.now(),
        }
      : null,
  }
}

function imageType(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return 'image/png'
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

export function createApp({ db, jwtSecret, clientOrigin, isProduction = false }: AppOptions) {
  const app = express()
  const auth = requireAuth(jwtSecret)
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  })
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
  })
  const previewLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  })

  app.disable('x-powered-by')
  app.use(helmet())
  if (clientOrigin) {
    app.use(cors({ origin: clientOrigin, credentials: true }))
  }
  app.use(express.json({ limit: '200kb' }))
  app.use(cookieParser())

  app.get('/api/health', (_req, res) => res.json({ ok: true }))

  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const parsed = authInput.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Check the email, password, and Instagram profile URL.' })
      return
    }
    const instagram = instagramProfileFromUrl(parsed.data.instagramUrl)
    if (!instagram) {
      res.status(400).json({ error: 'Enter a public Instagram profile URL, not a post or reel link.' })
      return
    }
    const email = parsed.data.email.toLowerCase()
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      res.status(409).json({ error: 'An account with that email already exists.' })
      return
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12)
    const createdAt = nowIso()
    try {
      const result = db.transaction(() => {
        const user = db.prepare(
          'INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)',
        ).run(email, passwordHash, createdAt)
        const userId = Number(user.lastInsertRowid)
        const baseSlug = instagram.username.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
        let slug = baseSlug.length >= 3 ? baseSlug.slice(0, 30) : `creator-${userId}`
        if (db.prepare('SELECT 1 FROM portfolios WHERE slug = ?').get(slug)) {
          const suffix = userId.toString(36)
          slug = `${slug.slice(0, 29 - suffix.length)}-${suffix}`
        }
        db.prepare(`
          INSERT INTO portfolios (
            user_id, slug, display_name, instagram_url, instagram_username, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(userId, slug, instagram.username, instagram.url, instagram.username, createdAt, createdAt)
        return userId
      })()
      setSessionCookie(res, issueSession(result, jwtSecret), isProduction)
      res.status(201).json(userView(db, result))
    } catch (error) {
      console.error('Account registration failed:', error)
      res.status(500).json({ error: 'We could not create your account. Please try again.' })
    }
  })

  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const parsed = loginInput.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Enter a valid email and password.' })
      return
    }
    const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(
      parsed.data.email.toLowerCase(),
    ) as { id: number; password_hash: string } | undefined
    if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
      res.status(401).json({ error: 'Email or password is incorrect.' })
      return
    }
    setSessionCookie(res, issueSession(user.id, jwtSecret), isProduction)
    res.json(userView(db, user.id))
  })

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie(sessionCookie, { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/' })
    res.status(204).end()
  })

  app.get('/api/me', auth, (_req, res) => {
    const view = userView(db, res.locals.userId as number)
    if (!view) {
      res.status(401).json({ error: 'Your account could not be found. Please sign in again.' })
      return
    }
    res.json(view)
  })

  app.put('/api/portfolio', auth, (req, res) => {
    const parsed = profileSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Some portfolio details are invalid. Review the fields and try again.' })
      return
    }
    const portfolio = parsed.data
    const instagram = instagramProfileFromUrl(portfolio.instagramUrl)
    if (!instagram) {
      res.status(400).json({ error: 'Enter a public Instagram profile URL, not a post or reel link.' })
      return
    }
    const userId = res.locals.userId as number
    try {
      db.prepare(`
        UPDATE portfolios SET slug = ?, display_name = ?, bio = ?, instagram_url = ?,
          instagram_username = ?, instagram_photo_url = ?, template = ?, theme = ?,
          font_family = ?, socials_json = ?, blocks_json = ?, products_json = ?, updated_at = ?
          WHERE user_id = ?
      `).run(
        portfolio.slug,
        portfolio.displayName,
        portfolio.bio,
        instagram.url,
        portfolio.instagramUsername || instagram.username,
        portfolio.instagramPhotoUrl,
        portfolio.template,
        portfolio.theme,
        portfolio.font,
        JSON.stringify(portfolio.socials),
        JSON.stringify(portfolio.blocks),
        JSON.stringify(portfolio.products),
        nowIso(),
        userId,
      )
      res.json(userView(db, userId))
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed: portfolios.slug')) {
        res.status(409).json({ error: 'That portfolio address is already taken. Try another one.' })
        return
      }
      console.error('Portfolio save failed:', error)
      res.status(500).json({ error: 'We could not save your portfolio. Please try again.' })
    }
  })

  app.post('/api/assets', auth, upload.single('image'), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Choose an image to upload.' })
      return
    }
    const mimeType = imageType(req.file.buffer)
    if (!mimeType) {
      res.status(415).json({ error: 'Use a JPEG, PNG, or WebP image.' })
      return
    }
    const id = randomUUID()
    db.prepare('INSERT INTO assets (id, user_id, mime_type, data, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, res.locals.userId as number, mimeType, req.file.buffer, nowIso())
    res.status(201).json({ imageUrl: `/api/assets/${id}` })
  })

  app.get('/api/assets/:id', (req, res) => {
    const asset = db.prepare('SELECT mime_type, data FROM assets WHERE id = ?').get(req.params.id) as
      | { mime_type: string; data: Buffer }
      | undefined
    if (!asset) {
      res.status(404).json({ error: 'Image not found.' })
      return
    }
    res.set({
      'Content-Type': asset.mime_type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    }).send(asset.data)
  })

  app.get('/api/link-preview', auth, previewLimiter, async (req, res) => {
    const parsed = z.string().url().safeParse(req.query.url)
    if (!parsed.success) {
      res.status(400).json({ error: 'Enter a valid HTTPS link.' })
      return
    }
    const preview = await fetchLinkPreview(parsed.data)
    if (!preview) {
      res.status(404).json({ error: 'No preview is available for this link. You can still add your own title and image.' })
      return
    }
    res.json(preview)
  })

  app.get('/api/product-preview', auth, previewLimiter, async (req, res) => {
    const parsed = z.string().url().max(2048).safeParse(req.query.url)
    if (!parsed.success) {
      res.status(400).json({ error: 'Enter a valid product link.' })
      return
    }
    const preview = await fetchProductPreview(parsed.data)
    if (!preview) {
      res.status(404).json({ error: 'We could not sync this store automatically. Add the product photo and price manually.' })
      return
    }
    res.json(preview)
  })

  app.post('/api/subscription/activate', auth, (req, res) => {
    const parsed = planInput.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Choose a valid plan.' })
      return
    }
    const { plan, coupon } = parsed.data
    if (coupon && !(
      (coupon === 'FREE1MONTH' && plan === 'monthly') ||
      (coupon === 'FREE1YEAR' && plan === 'yearly')
    )) {
      res.status(400).json({ error: 'That coupon is invalid for the selected plan.' })
      return
    }
    const startedAt = new Date()
    const expiresAt = new Date(startedAt.getTime() + planCatalog[plan].durationDays * 24 * 60 * 60 * 1000)
    const userId = res.locals.userId as number
    const activated = db.transaction(() => {
      if (plan === 'free') {
        const claimed = db.prepare('INSERT OR IGNORE INTO free_trials (user_id, claimed_at) VALUES (?, ?)')
          .run(userId, startedAt.toISOString())
        if (claimed.changes === 0) return false
      }
      db.prepare(`
        INSERT INTO subscriptions (user_id, plan, starts_at, expires_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, starts_at = excluded.starts_at,
          expires_at = excluded.expires_at, updated_at = excluded.updated_at
      `).run(userId, plan, startedAt.toISOString(), expiresAt.toISOString(), startedAt.toISOString())
      return true
    })()
    if (!activated) {
      res.status(409).json({ error: 'Your 7-day pass has already been used. Choose a monthly or yearly plan.' })
      return
    }
    res.json(userView(db, userId))
  })

  app.get('/api/public/:slug', (req, res) => {
    const row = db.prepare(`
      SELECT p.slug, p.display_name, p.bio, p.instagram_url, p.instagram_username,
        p.instagram_photo_url, p.template, p.theme, p.font_family, p.socials_json,
        p.blocks_json, p.products_json, s.plan, s.expires_at
      FROM portfolios p LEFT JOIN subscriptions s ON s.user_id = p.user_id
      WHERE p.slug = ?
    `).get(req.params.slug) as (Record<string, string | null> & { plan: string | null; expires_at: string | null }) | undefined
    if (!row) {
      res.status(404).json({ error: 'We could not find this portfolio.' })
      return
    }
    if (!row.expires_at || Date.parse(row.expires_at) <= Date.now()) {
      res.status(404).json({ error: 'This portfolio is not currently published.' })
      return
    }
    const portfolio = portfolioSchema.parse({
        slug: row.slug,
        displayName: row.display_name,
        bio: row.bio,
        instagramUrl: row.instagram_url,
        instagramUsername: row.instagram_username,
        instagramPhotoUrl: row.instagram_photo_url,
        template: row.template,
        theme: row.theme,
        font: row.font_family,
        socials: JSON.parse(row.socials_json ?? '{}'),
        blocks: JSON.parse(row.blocks_json ?? '[]'),
        products: JSON.parse(row.products_json ?? '[]'),
      })
    res.set('Cache-Control', 'no-store').json({ portfolio })
  })

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof SyntaxError && 'body' in error) {
      res.status(400).json({ error: 'The request body must be valid JSON.' })
      return
    }
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'Images must be 5 MB or smaller.' })
      return
    }
    console.error('Unhandled API error:', error)
    res.status(500).json({ error: 'Something went wrong. Please try again.' })
  })

  return app
}
