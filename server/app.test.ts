import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import Database from 'better-sqlite3'
import request from 'supertest'
import { issueSession, sessionCookie } from './auth.js'
import { createApp } from './app.js'
import { createDatabase } from './db.js'
import { fetchLinkPreview } from './previews.js'
import { fetchProductPreview } from './products.js'

const databases: ReturnType<typeof createDatabase>[] = []
const jwtSecret = 'test-secret-with-more-than-thirty-two-characters'

function testApp() {
  const db = createDatabase(':memory:')
  databases.push(db)
  return { app: createApp({ db, jwtSecret }), db }
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

test('registers a creator, activates a plan, and publishes a portfolio', async () => {
  const { app } = testApp()
  const client = request.agent(app)
  const registered = await client.post('/api/auth/register').send({
    email: 'creator@example.com',
    password: 'a-strong-password',
    instagramUrl: 'https://instagram.com/maya.chen',
  })

  assert.equal(registered.status, 201)
  assert.equal(registered.body.portfolio.instagramUsername, 'maya.chen')
  const slug = registered.body.portfolio.slug as string
  assert.equal((await client.get(`/api/public/${slug}`)).status, 404)

  const activated = await client.post('/api/subscription/activate').send({ plan: 'free' })
  assert.equal(activated.status, 200)
  assert.equal(activated.body.subscription.plan, 'free')
  assert.equal((await client.post('/api/subscription/activate').send({ plan: 'free' })).status, 409)
  const freeDuration = Date.parse(activated.body.subscription.expiresAt) - Date.parse(activated.body.subscription.startsAt)
  assert.ok(freeDuration >= 7 * 24 * 60 * 60 * 1000)
  assert.ok(freeDuration < 8 * 24 * 60 * 60 * 1000)

  const publicPage = await client.get(`/api/public/${slug}`)
  assert.equal(publicPage.status, 200)
  assert.equal(publicPage.body.portfolio.instagramUrl, 'https://www.instagram.com/maya.chen/')
})

test('only applies coupons to their matching paid plan', async () => {
  const { app } = testApp()
  const client = request.agent(app)
  await client.post('/api/auth/register').send({
    email: 'coupons@example.com',
    password: 'a-strong-password',
    instagramUrl: 'https://www.instagram.com/coupon.creator/',
  })

  assert.equal((await client.post('/api/subscription/activate').send({
    plan: 'monthly',
    coupon: 'FREE1YEAR',
  })).status, 400)

  const result = await client.post('/api/subscription/activate').send({
    plan: 'yearly',
    coupon: 'FREE1YEAR',
  })
  assert.equal(result.status, 200)
  assert.equal(result.body.subscription.plan, 'yearly')
  const duration = Date.parse(result.body.subscription.expiresAt) - Date.parse(result.body.subscription.startsAt)
  assert.ok(duration >= 365 * 24 * 60 * 60 * 1000)
  assert.ok(duration < 366 * 24 * 60 * 60 * 1000)

  const monthly = await client.post('/api/subscription/activate').send({
    plan: 'monthly',
    coupon: 'FREE1MONTH',
  })
  assert.equal(monthly.status, 200)
  assert.equal(monthly.body.subscription.plan, 'monthly')
  const monthlyDuration = Date.parse(monthly.body.subscription.expiresAt) - Date.parse(monthly.body.subscription.startsAt)
  assert.ok(monthlyDuration >= 30 * 24 * 60 * 60 * 1000)
  assert.ok(monthlyDuration < 31 * 24 * 60 * 60 * 1000)
})

test('rejects invalid Instagram links, weak passwords, and unsafe portfolio image URLs', async () => {
  const { app } = testApp()
  const client = request.agent(app)
  assert.equal((await client.post('/api/auth/register').send({
    email: 'bad@example.com',
    password: 'short',
    instagramUrl: 'https://instagram.com/p/a-post/',
  })).status, 400)

  await client.post('/api/auth/register').send({
    email: 'safe@example.com',
    password: 'a-strong-password',
    instagramUrl: 'https://instagram.com/safe.creator/',
  })
  const current = await client.get('/api/me')
  const portfolio = current.body.portfolio as Record<string, unknown>
  const unsafe = {
    ...portfolio,
    blocks: [{ id: 'image-1', type: 'image', imageUrl: 'javascript:alert(1)', alt: '', caption: '' }],
  }
  assert.equal((await client.put('/api/portfolio').send(unsafe)).status, 400)
  const invalidSocial = {
    ...portfolio,
    socials: { instagram: '', youtube: 'https://not-youtube.example/profile', x: '', facebook: '', snapchat: '', email: '' },
  }
  assert.equal((await client.put('/api/portfolio').send(invalidSocial)).status, 400)
})

test('saves creator links and serves the saved content on the public page', async () => {
  const { app } = testApp()
  const client = request.agent(app)
  await client.post('/api/auth/register').send({
    email: 'portfolio@example.com',
    password: 'a-strong-password',
    instagramUrl: 'https://instagram.com/portfolio.creator/',
  })
  const current = await client.get('/api/me')
  const portfolio = {
    ...current.body.portfolio,
    slug: 'my-creative-page',
    font: 'rounded',
    socials: {
      instagram: 'https://instagram.com/portfolio.creator/',
      youtube: 'https://youtube.com/@portfolio.creator',
      x: '',
      facebook: '',
      snapchat: '',
      email: 'hello@example.com',
    },
    blocks: [{
      id: 'music-link',
      type: 'link',
      url: 'https://open.spotify.com/track/1234567890123456789012',
      title: 'Songs for slow mornings',
      description: 'A playlist I made for you',
      imageUrl: 'https://i.scdn.co/image/cover',
      provider: 'Spotify',
    }],
    products: [{
      id: 'mug-1',
      url: 'https://shop.example/products/mug',
      title: 'Hand-thrown ceramic mug',
      imageUrl: 'https://shop.example/images/mug.jpg',
      price: '1,499',
      currency: 'INR',
    }],
  }
  assert.equal((await client.put('/api/portfolio').send(portfolio)).status, 200)
  await client.post('/api/subscription/activate').send({ plan: 'free' })
  const response = await client.get('/api/public/my-creative-page')
  assert.equal(response.status, 200)
  assert.equal(response.body.portfolio.blocks[0].title, 'Songs for slow mornings')
  assert.equal(response.body.portfolio.blocks[0].url, 'https://open.spotify.com/track/1234567890123456789012')
  assert.equal(response.body.portfolio.font, 'rounded')
  assert.equal(response.body.portfolio.socials.youtube, 'https://youtube.com/@portfolio.creator')
  assert.equal(response.body.portfolio.products[0].price, '1,499')
  assert.equal(response.body.portfolio.products[0].imageUrl, 'https://shop.example/images/mug.jpg')
})

test('stores uploaded image assets in SQLite and serves them by opaque ID', async () => {
  const { app } = testApp()
  const client = request.agent(app)
  await client.post('/api/auth/register').send({
    email: 'images@example.com',
    password: 'a-strong-password',
    instagramUrl: 'https://instagram.com/image.creator/',
  })

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j/qsAAAAASUVORK5CYII=',
    'base64',
  )
  const uploaded = await client.post('/api/assets').attach('image', png, {
    filename: 'pixel.png',
    contentType: 'image/png',
  })
  assert.equal(uploaded.status, 201)
  const asset = await client.get(uploaded.body.imageUrl)
  assert.equal(asset.status, 200)
  assert.equal(asset.headers['content-type'], 'image/png')
  assert.deepEqual(asset.body, png)

  const unsupported = await client.post('/api/assets').attach('image', Buffer.from('<svg/>'), {
    filename: 'image.svg',
    contentType: 'image/svg+xml',
  })
  assert.equal(unsupported.status, 415)
})

test('does not request metadata for arbitrary link hosts', async () => {
  assert.equal(await fetchLinkPreview('https://example.com/anything'), null)
  assert.equal(await fetchLinkPreview('http://open.spotify.com/track/123'), null)
})

test('syncs product name, photo, and price from supported store metadata', async () => {
  const originalFetch = globalThis.fetch
  let fetchCount = 0
  globalThis.fetch = async () => {
    fetchCount += 1
    return new Response(`
      <meta property="og:title" content="Handmade &amp; Happy Mug">
      <meta property="og:image" content="https://cdn.amazon.in/images/mug.jpg">
      <script type="application/ld+json">
        {"@type":"Product","offers":{"price":"1499","priceCurrency":"INR"}}
      </script>
    `, { status: 200, headers: { 'content-type': 'text/html' } })
  }
  try {
    const preview = await fetchProductPreview('https://www.amazon.in/dp/example')
    assert.deepEqual(preview, {
      title: 'Handmade & Happy Mug',
      imageUrl: 'https://cdn.amazon.in/images/mug.jpg',
      price: '1499',
      currency: 'INR',
      provider: 'amazon.in',
    })
    assert.equal(await fetchProductPreview('https://untrusted.example/item'), null)
    assert.equal(fetchCount, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('requires a signed-in creator and refuses product metadata from unknown stores', async () => {
  const { app } = testApp()
  assert.equal((await request(app).get('/api/product-preview').query({ url: 'https://store.example/item' })).status, 401)
  const client = request.agent(app)
  await client.post('/api/auth/register').send({
    email: 'products@example.com',
    password: 'a-strong-password',
    instagramUrl: 'https://instagram.com/product.creator/',
  })
  const response = await client.get('/api/product-preview').query({ url: 'https://store.example/item' })
  assert.equal(response.status, 404)
  assert.match(response.body.error, /manually/)
})

test('migrates existing SQLite portfolios without losing creator content', async () => {
  const filename = join(tmpdir(), `bio-box-legacy-${randomUUID()}.sqlite3`)
  const legacyDb = new Database(filename)
  legacyDb.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE portfolios (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      instagram_url TEXT NOT NULL,
      instagram_username TEXT NOT NULL DEFAULT '',
      instagram_photo_url TEXT NOT NULL DEFAULT '',
      instagram_refreshed_at TEXT,
      template TEXT NOT NULL DEFAULT 'paper',
      theme TEXT NOT NULL DEFAULT '#d7e8df',
      blocks_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO users (id, email, password_hash, created_at)
      VALUES (1, 'legacy@example.com', 'unused', '2026-01-01T00:00:00.000Z');
    INSERT INTO portfolios (
      id, user_id, slug, display_name, instagram_url, instagram_username, created_at, updated_at
    ) VALUES (
      1, 1, 'legacy-creator', 'Legacy Creator', 'https://www.instagram.com/legacy.creator/',
      'legacy.creator', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
    );
  `)
  legacyDb.close()

  const db = createDatabase(filename)
  try {
    const app = createApp({ db, jwtSecret })
    const response = await request(app)
      .get('/api/me')
      .set('Cookie', `${sessionCookie}=${issueSession(1, jwtSecret)}`)
    assert.equal(response.status, 200)
    assert.equal(response.body.portfolio.displayName, 'Legacy Creator')
    assert.equal(response.body.portfolio.font, 'sans')
    assert.equal(response.body.portfolio.socials.youtube, '')
    assert.deepEqual(response.body.portfolio.products, [])
  } finally {
    db.close()
    rmSync(filename, { force: true })
    rmSync(`${filename}-shm`, { force: true })
    rmSync(`${filename}-wal`, { force: true })
  }
})
