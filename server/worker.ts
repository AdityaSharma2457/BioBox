import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { portfolioSchema, planCatalog, type PlanKey, type Portfolio } from '../shared/model.js'
import { instagramProfileFromUrl } from './instagram.js'
import { fetchLinkPreview } from './previews.js'
import { fetchProductPreview } from './products.js'

interface Env { DB: D1Database; ASSETS: Fetcher; JWT_SECRET: string }
const sessionCookie = 'gather_session'
const authInput = z.object({ email: z.string().trim().email().max(254), password: z.string().min(10).max(100).refine(value => new TextEncoder().encode(value).length <= 72), instagramUrl: z.string().url().max(2048) })
const loginInput = authInput.pick({ email: true, password: true })
const planInput = z.object({ plan: z.enum(['free', 'monthly', 'yearly']), coupon: z.string().trim().toUpperCase().max(32).optional() })
type User = { id: number; email: string }
type SessionView = { user: User; portfolio: Portfolio; subscription: null | { plan: PlanKey; startsAt: string; expiresAt: string; active: boolean } }
type Row = Record<string, string | number | null>

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  const result = new Headers(headers); result.set('Content-Type', 'application/json; charset=utf-8'); result.set('X-Content-Type-Options', 'nosniff')
  return new Response(JSON.stringify(data), { status, headers: result })
}
function fail(error: string, status: number): Response { return json({ error }, status) }
function cookieValue(request: Request, name: string): string | null {
  return request.headers.get('Cookie')?.split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`))?.slice(name.length + 1) ?? null
}
function cookie(token: string, secure: boolean, clear = false): string {
  return `${sessionCookie}=${clear ? '' : token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 604800}${secure ? '; Secure' : ''}`
}
async function sign(payload: Record<string, unknown>, secret: string): Promise<string> {
  const enc = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const header = enc(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = enc(new TextEncoder().encode(JSON.stringify(payload)))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = enc(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${body}`))))
  return `${header}.${body}.${signature}`
}
async function verify(token: string | null, secret: string): Promise<number | null> {
  if (!token) return null
  try {
    const [head, body, signature] = token.split('.')
    if (!head || !body || !signature) return null
    const decode = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0))
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    if (!await crypto.subtle.verify('HMAC', key, decode(signature), new TextEncoder().encode(`${head}.${body}`))) return null
    const header = JSON.parse(new TextDecoder().decode(decode(head))) as { alg?: string }
    const payload = JSON.parse(new TextDecoder().decode(decode(body))) as { sub?: number; exp?: number }
    if (header.alg !== 'HS256' || !Number.isSafeInteger(payload.sub) || (payload.sub ?? 0) < 1 || (payload.exp ?? 0) <= Date.now() / 1000) return null
    return payload.sub!
  } catch { return null }
}
async function currentUser(request: Request, env: Env): Promise<number | null> { return verify(cookieValue(request, sessionCookie), env.JWT_SECRET) }
function sessionToken(id: number, env: Env): Promise<string> { const now = Math.floor(Date.now() / 1000); return sign({ sub: id, iat: now, exp: now + 604800 }, env.JWT_SECRET) }
function parsePortfolio(row: Row): Portfolio {
  return portfolioSchema.parse({ slug: row.slug, displayName: row.display_name, bio: row.bio, instagramUrl: row.instagram_url, instagramUsername: row.instagram_username, instagramPhotoUrl: row.instagram_photo_url, template: row.template, theme: row.theme, font: row.font_family, socials: JSON.parse(String(row.socials_json || '{}')), blocks: JSON.parse(String(row.blocks_json || '[]')), products: JSON.parse(String(row.products_json || '[]')) })
}
async function userView(db: D1Database, userId: number): Promise<SessionView | null> {
  const [userResult, portfolioResult, subscriptionResult] = await Promise.all([
    db.prepare('SELECT id, email FROM users WHERE id = ?').bind(userId).first<User>(),
    db.prepare('SELECT slug, display_name, bio, instagram_url, instagram_username, instagram_photo_url, template, theme, font_family, socials_json, blocks_json, products_json FROM portfolios WHERE user_id = ?').bind(userId).first<Row>(),
    db.prepare('SELECT plan, starts_at, expires_at FROM subscriptions WHERE user_id = ?').bind(userId).first<{ plan: PlanKey; starts_at: string; expires_at: string }>(),
  ])
  if (!userResult || !portfolioResult) return null
  return { user: userResult, portfolio: parsePortfolio(portfolioResult), subscription: subscriptionResult ? { plan: subscriptionResult.plan, startsAt: subscriptionResult.starts_at, expiresAt: subscriptionResult.expires_at, active: Date.parse(subscriptionResult.expires_at) > Date.now() } : null }
}
function imageType(data: Uint8Array): string | null {
  if (data.length >= 8 && [137,80,78,71,13,10,26,10].every((value,index)=>data[index]===value)) return 'image/png'
  if(data.length>=3&&data[0]===255&&data[1]===216&&data[2]===255)return 'image/jpeg'
  if(data.length>=12&&new TextDecoder().decode(data.slice(0,4))==='RIFF'&&new TextDecoder().decode(data.slice(8,12))==='WEBP')return 'image/webp'
  return null
}
function mediaType(data: Uint8Array, declared: string): string | null {
  const txt = (a:number,b:number) => new TextDecoder().decode(data.slice(a,b))
  const mp3 = data.length>=3&&txt(0,3)==='ID3'||data.length>=2&&data[0]===255&&(data[1]&224)===224
  const wav = data.length>=12&&txt(0,4)==='RIFF'&&txt(8,12)==='WAVE'
  const ogg = data.length>=4&&txt(0,4)==='OggS'; const webm=data.length>=4&&[26,69,223,163].every((v,i)=>data[i]===v); const mp4=data.length>=12&&txt(4,8)==='ftyp'
  const supported:Record<string,boolean>={'audio/mpeg':mp3,'audio/wav':wav,'audio/ogg':ogg,'audio/mp4':mp4,'audio/webm':webm,'video/mp4':mp4,'video/webm':webm}
  return supported[declared]?declared:null
}
async function bodyJson(request: Request): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get('content-length') ?? 0) > 210000) return null
  try { const value: unknown = await request.json(); return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : null } catch { return null }
}
const rateBuckets = new Map<string, { count: number; reset: number }>()
function rateLimited(request: Request, scope: string, limit: number, windowMs: number): boolean {
  const now=Date.now(); const ip=request.headers.get('CF-Connecting-IP') ?? 'unknown'; const key=`${scope}:${ip}`; const old=rateBuckets.get(key)
  if(!old||old.reset<=now){rateBuckets.set(key,{count:1,reset:now+windowMs});return false}
  old.count++; return old.count>limit
}
function validateSecret(env: Env): Response | null { return !env.JWT_SECRET || env.JWT_SECRET.length < 32 ? fail('Server authentication is not configured.',500) : null }

async function apiHandler(request: Request, env: Env): Promise<Response> {
  const configError=validateSecret(env); if(configError)return configError
  const url=new URL(request.url); const path=url.pathname; const method=request.method; const db=env.DB; const secure=url.protocol==='https:'
  if(method==='GET'&&path==='/api/health')return json({ok:true})
  if((path==='/api/auth/register'||path==='/api/auth/login')&&method==='POST'){
    if(rateLimited(request,'auth',20,900000))return fail('Too many attempts. Please wait a few minutes and try again.',429)
    const body=await bodyJson(request); const parsed=(path.endsWith('register')?authInput:loginInput).safeParse(body)
    if(!parsed.success)return fail(path.endsWith('register')?'Check the email, password, and Instagram profile URL.':'Enter a valid email and password.',400)
    const email=parsed.data.email.toLowerCase()
    if(path.endsWith('register')){
      const registration=parsed.data as z.infer<typeof authInput>; const instagram=instagramProfileFromUrl(registration.instagramUrl)
      if(!instagram)return fail('Enter a public Instagram profile URL, not a post or reel link.',400)
      if(await db.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first())return fail('An account with that email already exists.',409)
      if(await db.prepare('SELECT 1 FROM portfolios WHERE lower(instagram_username) = lower(?)').bind(instagram.username).first())return fail('That Instagram username is already linked to a Bio Box.',409)
      const passwordHash=await bcrypt.hash(registration.password,12); const createdAt=new Date().toISOString()
      try {
        const user=await db.prepare('INSERT INTO users (email,password_hash,created_at) VALUES (?,?,?)').bind(email,passwordHash,createdAt).run(); const userId=Number(user.meta.last_row_id)
        await db.prepare('INSERT INTO portfolios (user_id,slug,display_name,instagram_url,instagram_username,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').bind(userId,instagram.username.toLowerCase(),instagram.username,instagram.url,instagram.username,createdAt,createdAt).run()
        const token=await sessionToken(userId,env); return json(await userView(db,userId),201,{'Set-Cookie':cookie(token,secure)})
      }catch(error){console.error('Account registration failed:',error);return fail('We could not create your account. Please try again.',500)}
    }
    const login=parsed.data; const user=await db.prepare('SELECT id,password_hash FROM users WHERE email = ?').bind(email).first<{id:number;password_hash:string}>()
    if(!user||!await bcrypt.compare(login.password,user.password_hash))return fail('Email or password is incorrect.',401)
    return json(await userView(db,user.id),200,{'Set-Cookie':cookie(await sessionToken(user.id,env),secure)})
  }
  if(path==='/api/auth/logout'&&method==='POST')return new Response(null,{status:204,headers:{'Set-Cookie':cookie('',secure,true)}})
  if(path==='/api/assets'&&method==='POST'){
    const userId=await currentUser(request,env); if(!userId)return fail('Please sign in to continue.',401)
    let form:FormData;try{form=await request.formData()}catch{return fail('Choose a file to upload.',400)}
    const file=form.get('image'); if(!(file instanceof File))return fail('Choose a file to upload.',400)
    if(file.size>20*1024*1024)return fail('Files must be 20 MB or smaller.',413)
    const data=new Uint8Array(await file.arrayBuffer()); const detected=imageType(data); const mime= file.type.startsWith('image/')?detected:mediaType(data,file.type)
    if(!mime)return fail('Use a JPEG, PNG, or WebP image, or a supported audio/video file.',415)
    if(detected&&data.length>5*1024*1024)return fail('Images must be 5 MB or smaller.',413)
    const id=crypto.randomUUID(); await db.prepare('INSERT INTO assets (id,user_id,mime_type,data,created_at) VALUES (?,?,?,?,?)').bind(id,userId,mime,data,new Date().toISOString()).run()
    return json({imageUrl:`/api/assets/${id}`},201)
  }
  if(method==='GET'&&path.startsWith('/api/assets/')){
    const id=path.slice('/api/assets/'.length); if(!/^[0-9a-f-]{36}$/i.test(id))return fail('Image not found.',404)
    const asset=await db.prepare('SELECT mime_type,data FROM assets WHERE id = ?').bind(id).first<{mime_type:string;data:ArrayBuffer}>(); if(!asset)return fail('Image not found.',404)
    return new Response(asset.data,{headers:{'Content-Type':asset.mime_type,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}})
  }
  if(path==='/api/me'&&method==='GET'){
    const userId=await currentUser(request,env);if(!userId)return fail('Please sign in to continue.',401)
    const view=await userView(db,userId);return view?json(view):fail('Your account could not be found. Please sign in again.',401)
  }
  if(path==='/api/portfolio'&&method==='PUT'){
    const userId=await currentUser(request,env);if(!userId)return fail('Please sign in to continue.',401)
    const parsed=portfolioSchema.safeParse(await bodyJson(request));if(!parsed.success)return fail('Some portfolio details are invalid. Review the fields and try again.',400)
    const portfolio=parsed.data;const instagram=instagramProfileFromUrl(portfolio.instagramUrl);if(!instagram)return fail('Enter a public Instagram profile URL, not a post or reel link.',400)
    if(await db.prepare('SELECT 1 FROM portfolios WHERE lower(instagram_username)=lower(?) AND user_id != ?').bind(instagram.username,userId).first())return fail('That Instagram username is already linked to another Bio Box.',409)
    const existing=await db.prepare('SELECT slug FROM portfolios WHERE user_id = ?').bind(userId).first<{slug:string}>();if(!existing)return fail('Your portfolio could not be found.',404)
    const conflict=await db.prepare('SELECT 1 FROM portfolios WHERE slug=? AND user_id != ?').bind(instagram.username.toLowerCase(),userId).first();const slug=conflict?existing.slug:instagram.username.toLowerCase()
    await db.prepare('UPDATE portfolios SET slug=?,display_name=?,bio=?,instagram_url=?,instagram_username=?,instagram_photo_url=?,template=?,theme=?,font_family=?,socials_json=?,blocks_json=?,products_json=?,updated_at=? WHERE user_id=?').bind(slug,portfolio.displayName,portfolio.bio,instagram.url,instagram.username,portfolio.instagramPhotoUrl,portfolio.template,portfolio.theme,portfolio.font,JSON.stringify(portfolio.socials),JSON.stringify(portfolio.blocks),JSON.stringify(portfolio.products),new Date().toISOString(),userId).run()
    const view=await userView(db,userId);return view?json(view):fail('We could not save your portfolio. Please try again.',500)
  }
  if((path==='/api/link-preview'||path==='/api/product-preview')&&method==='GET'){
    const userId=await currentUser(request,env);if(!userId)return fail('Please sign in to continue.',401)
    if(rateLimited(request,'preview',20,60000))return fail('Too many requests. Please wait a moment and try again.',429)
    const parsed=z.string().url().max(2048).safeParse(url.searchParams.get('url'));if(!parsed.success)return fail(path.endsWith('product-preview')?'Enter a valid product link.':'Enter a valid HTTPS link.',400)
    const preview=path.endsWith('product-preview')?await fetchProductPreview(parsed.data):await fetchLinkPreview(parsed.data)
    if(!preview)return fail(path.endsWith('product-preview')?'We could not sync this store automatically. Add the product photo and price manually.':'No preview is available for this link. You can still add your own title and image.',404)
    return json(preview)
  }
  if(path==='/api/subscription/activate'&&method==='POST'){
    const userId=await currentUser(request,env);if(!userId)return fail('Please sign in to continue.',401)
    const parsed=planInput.safeParse(await bodyJson(request));if(!parsed.success)return fail('Choose a valid plan.',400)
    const {plan,coupon}=parsed.data;if(coupon&&!((coupon==='FREE1MONTH'&&plan==='monthly')||(coupon==='FREE1YEAR'&&plan==='yearly')))return fail('That coupon is invalid for the selected plan.',400)
    const now=new Date();const started=now.toISOString();const expires=new Date(now.getTime()+planCatalog[plan].durationDays*86400000).toISOString()
    const statements=[]
    if(plan==='free')statements.push(db.prepare('INSERT OR IGNORE INTO free_trials (user_id,claimed_at) VALUES (?,?)').bind(userId,started))
    statements.push(db.prepare('INSERT INTO subscriptions (user_id,plan,starts_at,expires_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan,starts_at=excluded.starts_at,expires_at=excluded.expires_at,updated_at=excluded.updated_at').bind(userId,plan,started,expires,started))
    const outcomes=await db.batch(statements);if(plan==='free'&&outcomes[0].meta.changes===0)return fail('Your 7-day pass has already been used. Choose a monthly or yearly plan.',409)
    const view=await userView(db,userId);return view?json(view):fail('Your account could not be found.',401)
  }
  if(method==='GET'&&path.startsWith('/api/public/')){
    const slug=decodeURIComponent(path.slice('/api/public/'.length));const row=await db.prepare(`SELECT p.slug,p.display_name,p.bio,p.instagram_url,p.instagram_username,p.instagram_photo_url,p.template,p.theme,p.font_family,p.socials_json,p.blocks_json,p.products_json,s.plan,s.expires_at FROM portfolios p LEFT JOIN subscriptions s ON s.user_id=p.user_id WHERE p.slug=? OR lower(p.instagram_username)=lower(?) ORDER BY CASE WHEN lower(p.instagram_username)=lower(?) THEN 0 ELSE 1 END LIMIT 1`).bind(slug,slug,slug).first<Row>()
    if(!row)return fail('We could not find this portfolio.',404);if(!row.expires_at||Date.parse(String(row.expires_at))<=Date.now())return fail('This portfolio is not currently published.',404)
    return json({portfolio:parsePortfolio(row)},200,{'Cache-Control':'no-store'})
  }
  return fail('Not found.',404)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url=new URL(request.url)
      if(url.pathname.startsWith('/api/'))return await apiHandler(request,env)
      const assetResponse=await env.ASSETS.fetch(request)
      if(assetResponse.status!==404)return assetResponse
      const index=await env.ASSETS.fetch(new Request(new URL('/index.html',request.url),request))
      return index.status===404?new Response('Not found',{status:404}):index
    } catch(error) { console.error('Worker request failed:',error);return fail('Something went wrong. Please try again.',500) }
  },
}
