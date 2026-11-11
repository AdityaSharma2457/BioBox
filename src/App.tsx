import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, makeBlockId, previewProduct, savePortfolio, uploadImage, type AccountView, type LinkPreview, type ProductPreview } from './api'
import type { Portfolio, PortfolioBlock, PortfolioProduct, PortfolioSocials, PlanKey } from '../shared/model'
import './App.css'

type AuthContextValue = {
  account: AccountView | null
  loading: boolean
  refresh: () => Promise<AccountView | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside the application')
  return context
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AccountView | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const current = await api<AccountView>('/me')
      setAccount(current)
      setLoadError('')
      return current
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setAccount(null)
        setLoadError('')
        return null
      }
      setLoadError(error instanceof Error ? error.message : 'We could not load your account.')
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void api<AccountView>('/me', { signal: controller.signal })
      .then((current) => {
        if (!controller.signal.aborted) {
          setAccount(current)
          setLoadError('')
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.status === 401) {
          setAccount(null)
          setLoadError('')
          return
        }
        setLoadError(error instanceof Error ? error.message : 'We could not load your account.')
        console.error('Unable to load the current account:', error)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  const signOut = useCallback(async () => {
    await api<void>('/auth/logout', { method: 'POST' })
    setAccount(null)
  }, [])

  const value = useMemo(() => ({ account, loading, refresh, signOut }), [account, loading, refresh, signOut])
  return <AuthContext.Provider value={value}>{loadError && <div className="session-error" role="alert">{loadError} Refresh the page to try again.</div>}{children}</AuthContext.Provider>
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/plans" element={<Protected><PlansPage /></Protected>} />
          <Route path="/editor" element={<Protected><EditorPage /></Protected>} />
          <Route path="/:slug" element={<PublicPortfolioPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

function Protected({ children }: { children: ReactNode }) {
  const { account, loading } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingPage />
  if (!account) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link to="/" className={`brand${inverse ? ' brand-inverse' : ''}`} aria-label="Bio Box home">
      <BioBoxMark />
      <span>bio box</span>
    </Link>
  )
}

function BioBoxMark() {
  return <span className="brand-mark biobox-mark" aria-hidden="true"><i /><i /><i /><i /></span>
}

function HomePage() {
  const { account, loading } = useAuth()
  return (
    <main className="marketing">
      <header className="topbar marketing-topbar">
        <Brand />
        <nav className="topbar-actions">
          {!loading && account
            ? <Link className="button button-dark button-small" to={account.subscription?.active ? '/editor' : '/plans'}>Your workspace <span aria-hidden="true">↗</span></Link>
            : <><Link className="text-link" to="/login">Log in</Link><Link className="button button-dark button-small" to="/register">Get started <span aria-hidden="true">↗</span></Link></>}
        </nav>
      </header>
      <section className="hero-section">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> YOUR WHOLE WORLD, ONE LINK</div>
          <h1>Everything you are.<br /><em>One little corner.</em></h1>
          <p>Make a beautiful home for your work, your playlists, your shop, and all the things you want people to find.</p>
          <div className="hero-actions">
            <Link to="/register" className="button button-dark">Make your page <span aria-hidden="true">↗</span></Link>
            <span className="quiet-note">No tech skills needed. Ever.</span>
          </div>
          <div className="hero-proof"><span className="proof-avatars"><i>J</i><i>A</i><i>M</i></span><span>Made for people with things to share.</span></div>
        </div>
        <div className="hero-art" aria-label="Example creator portfolio page">
          <div className="art-spark art-spark-one">✳</div>
          <div className="art-spark art-spark-two">✴</div>
          <div className="preview-card">
            <div className="preview-cover">
              <div className="cover-sun" />
              <div className="cover-leaf cover-leaf-one" />
              <div className="cover-leaf cover-leaf-two" />
              <div className="cover-label">STUDIO<br />NOTES · 04</div>
            </div>
            <div className="preview-profile">
              <div className="preview-avatar">m</div>
              <div><strong>Maya Chen</strong><small>artist, maker, daydreamer</small></div>
              <span className="instagram-chip">◎</span>
            </div>
            <div className="preview-link preview-link-feature">
              <div className="mini-cover mini-cover-music">♫</div>
              <span><b>little songs for slow mornings</b><small>Spotify · playlist</small></span><i>↗</i>
            </div>
            <div className="preview-link"><span className="preview-icon">✦</span><b>Shop my handmade ceramics</b><i>↗</i></div>
            <div className="preview-link"><span className="preview-icon peach">▶</span><b>Latest film — on YouTube</b><i>↗</i></div>
            <div className="preview-caption"><span /> a little piece of the internet, just for me</div>
          </div>
          <div className="art-note art-note-left">your vibe,<br />your rules <span>↗</span></div>
          <div className="art-note art-note-right">made in<br />a few clicks <span>✿</span></div>
        </div>
      </section>
      <section className="feature-strip">
        <div><span className="feature-number">01</span><strong>Pick a look</strong><p>Thoughtful templates, lovely colors.</p></div>
        <div><span className="feature-number">02</span><strong>Add your things</strong><p>Photos, music, videos, and more.</p></div>
        <div><span className="feature-number">03</span><strong>Share your link</strong><p>One home for your whole internet.</p></div>
      </section>
      <footer className="marketing-footer"><Brand /><span>Make room for everything you are.</span><Link to="/register">Start your page ↗</Link></footer>
    </main>
  )
}

function AuthPage({ mode }: { mode: 'register' | 'login' }) {
  const isRegister = mode === 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [instagramUrl, setInstagramUrl] = useState('')
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const { account, loading, refresh } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const destination = (location.state as { from?: string } | null)?.from ?? '/editor'

  useEffect(() => {
    if (!loading && account) navigate(account.subscription?.active ? '/editor' : '/plans', { replace: true })
  }, [account, loading, navigate])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setWorking(true)
    try {
      const normalizedInstagram = instagramUrl.trim().startsWith('http')
        ? instagramUrl.trim()
        : `https://${instagramUrl.trim()}`
      await api<AccountView>(isRegister ? '/auth/register' : '/auth/login', {
        method: 'POST',
        body: JSON.stringify(isRegister ? { email, password, instagramUrl: normalizedInstagram } : { email, password }),
      })
      const current = await refresh()
      navigate(isRegister || !current?.subscription?.active ? '/plans' : destination, { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Please try again.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <main className="auth-page">
      <header className="topbar"><Brand /><Link className="text-link" to={isRegister ? '/login' : '/register'}>{isRegister ? 'Already have an account?' : 'New to Bio Box?'} <b>{isRegister ? 'Log in' : 'Get started'}</b></Link></header>
      <section className="auth-layout">
        <div className="auth-aside">
          <span className="eyebrow"><span className="eyebrow-dot" /> A LITTLE SPACE THAT'S ALL YOURS</span>
          <h1>{isRegister ? <>Start with<br /><em>your people.</em></> : <>Welcome<br /><em>back in.</em></>}</h1>
          <p>{isRegister ? 'We’ll use your Instagram profile to get your page started. You can make it yours from there.' : 'Your corner of the internet is right where you left it.'}</p>
          <div className="auth-doodle">✳</div>
        </div>
        <form className="form-card auth-form" onSubmit={submit}>
          <div className="form-heading"><span className="form-kicker">{isRegister ? 'LET’S MAKE SOMETHING' : 'GOOD TO SEE YOU'}</span><h2>{isRegister ? 'Create your account' : 'Log in to your account'}</h2><p>{isRegister ? 'A few details, then your page is yours.' : 'Pick up where you left off.'}</p></div>
          <label>Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
          <label>Password<input type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} required minLength={10} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isRegister ? '10–72 characters' : 'Your password'} /><small>Use 10–72 characters.</small></label>
          {isRegister && <label>Your Instagram profile<input type="text" inputMode="url" required value={instagramUrl} onChange={(event) => setInstagramUrl(event.target.value)} placeholder="instagram.com/yourname" /><small>We’ll use the username from your link. Instagram doesn’t share profile photos from a URL alone, so you can add yours in the editor.</small></label>}
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="button button-dark button-wide" disabled={working}>{working ? 'One moment…' : isRegister ? 'Create my account' : 'Log in'} <span aria-hidden="true">↗</span></button>
          {isRegister && <p className="form-legal">By continuing, you agree to keep things kind and respectful.</p>}
        </form>
      </section>
    </main>
  )
}

function PlansPage() {
  const { account, refresh, signOut } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [couponPlan, setCouponPlan] = useState<PlanKey>('monthly')
  const [coupon, setCoupon] = useState('')
  const [error, setError] = useState('')
  const [workingPlan, setWorkingPlan] = useState<PlanKey | null>(null)
  const navigate = useNavigate()

  async function activate(plan: PlanKey, code?: string) {
    setWorkingPlan(plan)
    setError('')
    try {
      await api('/subscription/activate', { method: 'POST', body: JSON.stringify({ plan, coupon: code }) })
      await refresh()
      navigate('/editor', { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We could not activate that plan.')
    } finally {
      setWorkingPlan(null)
    }
  }

  async function applyCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await activate(couponPlan, coupon)
  }

  return (
    <main className="plans-page">
      <header className="topbar workspace-topbar"><Brand /><div className="topbar-actions"><span className="account-email">{account?.user.email}</span><button className="text-link button-as-link" onClick={() => void signOut().then(() => navigate('/'))}>Sign out</button></div></header>
      <section className="plans-content">
        <div className="plans-heading"><span className="eyebrow"><span className="eyebrow-dot" /> YOUR NEXT LITTLE STEP</span><h1>A home for your<br /><em>whole world.</em></h1><p>Choose how long you’d like your page to stay live. You can change things up anytime.</p></div>
        <div className="plan-grid">
          <article className="plan-card">
            <div className="plan-label">A FIRST LOOK</div><h2>7-day pass</h2><div className="plan-price">Free</div><p className="plan-description">Your first week to make it yours and share it with the world.</p>
            <ul><li>One beautiful portfolio</li><li>All templates and colors</li><li>Share your own link</li></ul>
            <button className="button button-outline button-wide" disabled={workingPlan !== null} onClick={() => void activate('free')}>{workingPlan === 'free' ? 'Setting things up…' : 'Start my 7 days'}</button>
          </article>
          <article className="plan-card plan-card-featured">
            <div className="plan-badge">A LITTLE MORE ROOM</div><h2>Monthly</h2><div className="plan-price"><span>₹</span>750 <small>/ month</small></div><p className="plan-description">For the things you’re making right now.</p>
            <ul><li>Everything in the 7-day pass</li><li>Your page stays live for 30 days</li><li>Make changes whenever you like</li></ul>
            <button className="button button-dark button-wide" disabled={workingPlan !== null} onClick={() => void activate('monthly')}>{workingPlan === 'monthly' ? 'Opening checkout…' : 'Choose monthly'} <span aria-hidden="true">↗</span></button>
          </article>
          <article className="plan-card">
            <div className="plan-label">BEST FOR THE LONG RUN</div><h2>Yearly</h2><div className="plan-price"><span>₹</span>3,000 <small>/ year</small></div><p className="plan-description">One less thing to think about all year.</p>
            <ul><li>Everything in the monthly plan</li><li>Your page stays live for 365 days</li><li>One payment for the year</li></ul>
            <button className="button button-outline button-wide" disabled={workingPlan !== null} onClick={() => void activate('yearly')}>{workingPlan === 'yearly' ? 'Opening checkout…' : 'Choose yearly'}</button>
          </article>
        </div>
        <div className="coupon-invite"><span className="coupon-star">✳</span><div><strong>Have a little code?</strong><small>Use a coupon to unlock a longer plan.</small></div><button className="button button-coupon" onClick={() => { setError(''); setModalOpen(true) }}>Enter coupon <span aria-hidden="true">↗</span></button></div>
        <p className="demo-payment-note">Demo checkout: no payment is collected in this version.</p>
      </section>
      {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false) }}>
        <section className="coupon-modal" role="dialog" aria-modal="true" aria-labelledby="coupon-title">
          <button className="modal-close" aria-label="Close coupon window" onClick={() => setModalOpen(false)}>×</button>
          <span className="coupon-modal-icon">✳</span><span className="form-kicker">A LITTLE SOMETHING FOR YOU</span><h2 id="coupon-title">Apply your code</h2><p>Choose the plan your code is for. We’ll activate it as soon as it checks out.</p>
          <form onSubmit={applyCoupon}>
            <label>Plan<select value={couponPlan} onChange={(event) => setCouponPlan(event.target.value as PlanKey)}><option value="monthly">Monthly — ₹750</option><option value="yearly">Yearly — ₹3,000</option></select></label>
            <label>Coupon code<input autoFocus autoComplete="off" spellCheck={false} value={coupon} onChange={(event) => setCoupon(event.target.value)} placeholder="e.g. FREE1MONTH" /></label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="button button-dark button-wide" disabled={workingPlan !== null || !coupon.trim()}>{workingPlan ? 'Checking code…' : 'Apply code'} <span aria-hidden="true">↗</span></button>
          </form>
          <small className="coupon-hint">Available codes: FREE1MONTH · FREE1YEAR</small>
        </section>
      </div>}
    </main>
  )
}

const themeChoices = [
  { color: '#d8e6d5', name: 'Sage' },
  { color: '#f3d9cd', name: 'Peach' },
  { color: '#ded8ee', name: 'Lilac' },
  { color: '#d6e5ec', name: 'Sky' },
  { color: '#f0e5c4', name: 'Butter' },
]

const fontChoices = [
  { value: 'sans', name: 'Clean sans', sample: 'The quick brown fox' },
  { value: 'serif', name: 'Editorial serif', sample: 'The quick brown fox' },
  { value: 'rounded', name: 'Soft rounded', sample: 'The quick brown fox' },
  { value: 'mono', name: 'Modern mono', sample: 'The quick brown fox' },
] as const

const socialFields = [
  { key: 'instagram', label: 'Instagram link', placeholder: 'instagram.com/yourname', type: 'url' },
  { key: 'youtube', label: 'YouTube channel', placeholder: 'youtube.com/@yourchannel', type: 'url' },
  { key: 'x', label: 'X profile', placeholder: 'x.com/yourname', type: 'url' },
  { key: 'facebook', label: 'Facebook page', placeholder: 'facebook.com/yourpage', type: 'url' },
  { key: 'snapchat', label: 'Snapchat profile', placeholder: 'snapchat.com/add/yourname', type: 'url' },
  { key: 'email', label: 'Business email', placeholder: 'hello@example.com', type: 'email' },
] as const

function EditorPage() {
  const { account, refresh, signOut } = useAuth()
  const [draft, setDraft] = useState<Portfolio>(() => account?.portfolio ?? {
    slug: 'my-page',
    displayName: '',
    bio: '',
    instagramUrl: 'https://www.instagram.com/creator/',
    instagramUsername: 'creator',
    instagramPhotoUrl: '',
    template: 'paper',
    theme: '#d8e6d5',
    font: 'sans',
    socials: { instagram: '', youtube: '', x: '', facebook: '', snapchat: '', email: '' },
    blocks: [],
    products: [],
  })
  const [saved, setSaved] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [linkDescription, setLinkDescription] = useState('')
  const [linkImageUrl, setLinkImageUrl] = useState('')
  const [productUrl, setProductUrl] = useState('')
  const [productTitle, setProductTitle] = useState('')
  const [productImageUrl, setProductImageUrl] = useState('')
  const [productPrice, setProductPrice] = useState('')
  const [productCurrency, setProductCurrency] = useState('INR')
  const [productPreview, setProductPreview] = useState<ProductPreview | null>(null)
  const [productPreviewUrl, setProductPreviewUrl] = useState('')
  const [productSyncMessage, setProductSyncMessage] = useState('')
  const [syncingProductId, setSyncingProductId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [copied, setCopied] = useState(false)
  const navigate = useNavigate()

  if (!account?.subscription?.active) return <Navigate to="/plans" replace />

  function update<K extends keyof Portfolio>(field: K, value: Portfolio[K]) {
    setDraft((current) => current ? { ...current, [field]: value } : current)
    setSaved(false)
    setMessage('')
  }

  function updateSocial<K extends keyof PortfolioSocials>(field: K, value: PortfolioSocials[K]) {
    update('socials', { ...draft.socials, [field]: value })
  }

  async function upload(file: File, onUploaded: (url: string) => void) {
    setUploading(true)
    setMessage('')
    try {
      onUploaded(await uploadImage(file))
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'That image could not be uploaded.')
    } finally {
      setUploading(false)
    }
  }

  async function addLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    let url: URL
    try {
      url = new URL(linkUrl.trim().startsWith('http') ? linkUrl.trim() : `https://${linkUrl.trim()}`)
      if (url.protocol !== 'https:') throw new Error()
    } catch {
      setMessage('Add a valid HTTPS link.')
      return
    }

    let preview: LinkPreview | null = null
    try {
      preview = await api<LinkPreview>(`/link-preview?url=${encodeURIComponent(url.toString())}`)
    } catch (caught) {
      if (!(caught instanceof ApiError && caught.status === 404)) {
        setMessage(caught instanceof Error ? caught.message : 'We could not check that link.')
        return
      }
    }
    const block: PortfolioBlock = {
      id: makeBlockId(),
      type: 'link',
      url: url.toString(),
      title: linkTitle.trim() || preview?.title || 'A link worth opening',
      description: linkDescription.trim(),
      imageUrl: linkImageUrl.trim() || preview?.imageUrl,
      provider: preview?.provider || providerFromUrl(url),
    }
    update('blocks', [...draft.blocks, block])
    setLinkUrl('')
    setLinkTitle('')
    setLinkDescription('')
    setLinkImageUrl('')
    setMessage(preview ? `${preview.provider} preview added.` : 'Link added. Add a title or image to make it feel like yours.')
  }

  function normalizeProductUrl(value: string): string | null {
    try {
      const url = new URL(value.trim().startsWith('http') ? value.trim() : `https://${value.trim()}`)
      return url.protocol === 'https:' ? url.toString() : null
    } catch {
      return null
    }
  }

  async function syncProductDetails() {
    const url = normalizeProductUrl(productUrl)
    if (!url) {
      setProductSyncMessage('Add a valid HTTPS product link first.')
      return
    }
    setProductSyncMessage('')
    setSyncingProductId('draft')
    try {
      const preview = await previewProduct(url)
      setProductPreview(preview)
      setProductPreviewUrl(url)
      if (!productTitle.trim()) setProductTitle(preview.title)
      if (!productImageUrl.trim() && preview.imageUrl) setProductImageUrl(preview.imageUrl)
      if (!productPrice.trim() && preview.price) setProductPrice(preview.price)
      if (preview.currency) setProductCurrency(preview.currency)
      setProductSyncMessage(`Found product details on ${preview.provider}. Review and add them below.`)
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) {
        setProductPreview(null)
        setProductSyncMessage('This store did not share product details. Add the image and price yourself.')
      } else {
        setProductSyncMessage(caught instanceof Error ? caught.message : 'We could not sync this product.')
      }
    } finally {
      setSyncingProductId('')
    }
  }

  async function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (draft.products.length >= 20) {
      setProductSyncMessage('You can add up to 20 products.')
      return
    }
    const url = normalizeProductUrl(productUrl)
    if (!url) {
      setProductSyncMessage('Add a valid HTTPS product link.')
      return
    }
    let preview = productPreview && productPreviewUrl === url ? productPreview : null
    if (!preview) {
      try {
        preview = await previewProduct(url)
      } catch (caught) {
        if (!(caught instanceof ApiError && caught.status === 404)) {
          setProductSyncMessage(caught instanceof Error ? caught.message : 'We could not sync this product.')
        }
      }
    }
    const product: PortfolioProduct = {
      id: makeBlockId(),
      url,
      title: productTitle.trim() || preview?.title || 'Featured product',
      imageUrl: productImageUrl.trim() || preview?.imageUrl || '',
      price: productPrice.trim() || preview?.price || '',
      currency: productCurrency || preview?.currency || 'INR',
    }
    update('products', [...draft.products, product])
    setProductUrl('')
    setProductTitle('')
    setProductImageUrl('')
    setProductPrice('')
    setProductCurrency('INR')
    setProductPreview(null)
    setProductPreviewUrl('')
    setProductSyncMessage(preview ? 'Product added with the latest details we could find.' : 'Product added. Store data was unavailable, so you can edit its details.')
  }

  async function refreshProduct(product: PortfolioProduct) {
    setSyncingProductId(product.id)
    setProductSyncMessage('')
    try {
      const preview = await previewProduct(product.url)
      update('products', draft.products.map((item) => item.id === product.id ? {
        ...item,
        title: preview.title || item.title,
        imageUrl: preview.imageUrl || item.imageUrl,
        price: preview.price || item.price,
        currency: preview.currency || item.currency,
      } : item))
      setProductSyncMessage(`Updated ${product.title} from ${preview.provider}.`)
    } catch (caught) {
      setProductSyncMessage(caught instanceof Error ? caught.message : 'We could not refresh this product.')
    } finally {
      setSyncingProductId('')
    }
  }

  function updateProduct(id: string, field: 'title' | 'price', value: string) {
    update('products', draft.products.map((product) => product.id === id ? { ...product, [field]: value } : product))
  }

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      const result = await savePortfolio(draft)
      await refresh()
      setDraft(result.portfolio)
      setSaved(true)
      setMessage('Your changes are saved.')
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'We could not save your page.')
    } finally {
      setSaving(false)
    }
  }

  function setInstagramUrl(value: string) {
    const normalized = value.trim().startsWith('http') ? value.trim() : `https://${value.trim()}`
    let username = draft.instagramUsername
    try {
      const url = new URL(normalized)
      if (['www.instagram.com', 'instagram.com'].includes(url.hostname)) {
        username = url.pathname.split('/').filter(Boolean)[0] ?? username
      }
    } catch {
      username = draft.instagramUsername
    }
    setDraft({ ...draft, instagramUrl: normalized, instagramUsername: username })
    setSaved(false)
  }

  function removeBlock(id: string) {
    update('blocks', draft.blocks.filter((block) => block.id !== id))
  }

  function updateImageBlock(id: string, field: 'alt' | 'caption', value: string) {
    update('blocks', draft.blocks.map((block) =>
      block.id === id && block.type === 'image' ? { ...block, [field]: value } : block,
    ))
  }

  async function copyPageLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${draft.slug}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setMessage('Copy is unavailable here. You can copy the link shown above.')
    }
  }

  return (
    <main className="editor-page">
      <header className="topbar editor-topbar">
        <Brand />
        <div className="editor-topbar-center"><span className={`save-dot${saved ? ' is-saved' : ''}`} />{saved ? 'All changes saved' : 'Unsaved changes'}</div>
        <div className="topbar-actions"><Link className="button button-quiet button-small" to={`/${draft.slug}`} target="_blank" rel="noreferrer">Preview <span aria-hidden="true">↗</span></Link><button className="button button-dark button-small" disabled={saving || saved} onClick={() => void save()}>{saving ? 'Saving…' : 'Save page'}</button><button className="button-as-link logout-button" onClick={() => void signOut().then(() => navigate('/'))}>Log out</button></div>
      </header>
      <div className="editor-workspace">
        <section className="editor-panel">
          <div className="editor-welcome"><span className="eyebrow"><span className="eyebrow-dot" /> YOUR LITTLE CORNER</span><h1>Make it <em>yours.</em></h1><p>Start with the basics. You can change anything later.</p></div>
          <div className="editor-section">
            <div className="section-title"><span>01</span><div><h2>Your profile</h2><p>The first hello on your page.</p></div></div>
            <label>Instagram profile<input value={draft.instagramUrl} onChange={(event) => setInstagramUrl(event.target.value)} placeholder="instagram.com/yourname" /></label>
            <label>What should we call you?<input value={draft.displayName} maxLength={60} onChange={(event) => update('displayName', event.target.value)} placeholder="Your name or creative name" /></label>
            <label>A little about you<textarea value={draft.bio} maxLength={180} onChange={(event) => update('bio', event.target.value)} placeholder="A line or two that feels like you…" rows={3} /><span className="field-counter">{draft.bio.length}/180</span></label>
            <div className="social-editor">
              <div className="social-editor-heading"><strong>Find me elsewhere</strong><span>OPTIONAL</span></div>
              <div className="social-fields">
                {socialFields.map(({ key, label, placeholder, type }) => <label key={key}>{label}<input type={type} inputMode={type === 'url' ? 'url' : 'email'} value={draft.socials[key]} onChange={(event) => updateSocial(key, event.target.value)} placeholder={placeholder} /></label>)}
              </div>
            </div>
            <label>Profile photo URL <span className="optional-label">optional</span><input value={draft.instagramPhotoUrl.startsWith('/api/assets/') ? '' : draft.instagramPhotoUrl} onChange={(event) => update('instagramPhotoUrl', event.target.value)} placeholder="https://…" /><span className="upload-help">Instagram doesn’t provide a reliable photo from a public profile link. Paste a photo URL or upload the current photo.</span></label>
            <label className="upload-field">Or upload a profile photo<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, (url) => update('instagramPhotoUrl', url)); event.target.value = '' }} /><span className="upload-help">{uploading ? 'Uploading…' : 'JPEG, PNG, or WebP · up to 5 MB'}</span></label>
          </div>
          <div className="editor-section">
            <div className="section-title"><span>02</span><div><h2>Pick your look</h2><p>A color and a feeling to start with.</p></div></div>
            <div className="template-picker">
              {(['paper', 'studio', 'night'] as const).map((template) => <button type="button" className={`template-option ${draft.template === template ? 'selected' : ''}`} key={template} onClick={() => update('template', template)}><span className={`template-swatch template-${template}`}><i /><i /><i /></span><span>{template === 'paper' ? 'Paper' : template === 'studio' ? 'Studio' : 'After hours'}</span></button>)}
            </div>
            <div className="theme-picker" role="radiogroup" aria-label="Portfolio accent color">
              {themeChoices.map((theme) => <button type="button" key={theme.color} className={`theme-option${draft.theme === theme.color ? ' selected' : ''}`} style={{ '--swatch': theme.color } as React.CSSProperties} aria-label={`${theme.name} color`} aria-checked={draft.theme === theme.color} role="radio" onClick={() => update('theme', theme.color)} />)}
            </div>
            <div className="font-picker" role="radiogroup" aria-label="Portfolio font">
              {fontChoices.map((font) => <button type="button" key={font.value} className={`font-option font-sample-${font.value}${draft.font === font.value ? ' selected' : ''}`} aria-checked={draft.font === font.value} role="radio" onClick={() => update('font', font.value)}><span>{font.sample}</span><small>{font.name}</small></button>)}
            </div>
          </div>
          <div className="editor-section">
            <div className="section-title"><span>03</span><div><h2>Add your things</h2><p>Links, music, videos, and little moments.</p></div></div>
            <form className="add-link-form" onSubmit={(event) => void addLink(event)}>
              <label>Paste a link<input type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="Spotify, YouTube, your shop…" required /></label>
              <label>Give it a name <span className="optional-label">optional</span><input value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} placeholder="We’ll look for a title for you" /></label>
              <label>Short note <span className="optional-label">optional</span><input value={linkDescription} onChange={(event) => setLinkDescription(event.target.value)} placeholder="What should people know?" /></label>
              <label>Cover image URL <span className="optional-label">optional</span><input value={linkImageUrl} onChange={(event) => setLinkImageUrl(event.target.value)} placeholder="Add your own image if you like" /></label>
              <p className="preview-hint">For Spotify, YouTube, and SoundCloud, we’ll try to find the name and cover art. Your pasted URL stays behind the scenes.</p>
              <button className="button button-outline" disabled={!linkUrl.trim()}>＋ Add a link</button>
            </form>
            <label className="upload-field add-image-upload">Add a photo<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, (url) => update('blocks', [...draft.blocks, { id: makeBlockId(), type: 'image', imageUrl: url, alt: '', caption: '' }])); event.target.value = '' }} /><span className="upload-help">{uploading ? 'Uploading…' : 'A photo, artwork, or a favorite moment'}</span></label>
            {draft.blocks.length > 0 && <div className="block-list"><div className="block-list-heading">ON YOUR PAGE <span>{draft.blocks.length}</span></div>{draft.blocks.map((block, index) => <div className="block-row" key={block.id}>
              {block.type === 'image' ? <div className="block-thumb image-thumb">{block.imageUrl && <img src={block.imageUrl} alt="" />}</div> : <div className="block-thumb link-thumb">{block.imageUrl ? <img src={block.imageUrl} alt="" /> : <span>↗</span>}</div>}
              <div className="block-row-copy">{block.type === 'image' ? <><input aria-label={`Caption for photo ${index + 1}`} value={block.caption} onChange={(event) => updateImageBlock(block.id, 'caption', event.target.value)} placeholder="Caption or QR label" /><input aria-label={`Alternative text for photo ${index + 1}`} value={block.alt} onChange={(event) => updateImageBlock(block.id, 'alt', event.target.value)} placeholder="Describe the image" /></> : <><strong>{block.title}</strong><small>{block.provider || 'Link'}</small></>}</div>
              <button type="button" className="remove-block" aria-label={`Remove ${block.type === 'image' ? 'photo' : block.title}`} onClick={() => removeBlock(block.id)}>×</button>
            </div>)}</div>}
          </div>
          <div className="editor-section">
            <div className="section-title"><span>04</span><div><h2>Your shop shelf</h2><p>Feature products, merch, and things you love.</p></div></div>
            <p className="product-sync-note">Paste a product link and we’ll try to sync its photo and price. Some stores block previews, so you can always add or edit details yourself.</p>
            <form className="product-form" onSubmit={(event) => void addProduct(event)}>
              <label>Product link<input type="text" inputMode="url" required value={productUrl} onChange={(event) => { setProductUrl(event.target.value); setProductPreview(null); setProductPreviewUrl(''); setProductSyncMessage('') }} placeholder="Amazon, Myntra, your own shop…" /></label>
              <button type="button" className="sync-product-button" disabled={!productUrl.trim() || syncingProductId === 'draft'} onClick={() => void syncProductDetails()}>{syncingProductId === 'draft' ? 'Syncing…' : '↻ Sync product details'}</button>
              <label>Product name <span className="optional-label">optional</span><input value={productTitle} onChange={(event) => setProductTitle(event.target.value)} placeholder="We’ll look for a name for you" /></label>
              <div className="product-price-fields">
                <label>Price <span className="optional-label">optional</span><input inputMode="decimal" value={productPrice} onChange={(event) => setProductPrice(event.target.value)} placeholder="1,499" /></label>
                <label>Currency<select value={productCurrency} onChange={(event) => setProductCurrency(event.target.value)}><option value="INR">INR ₹</option><option value="USD">USD $</option><option value="EUR">EUR €</option><option value="GBP">GBP £</option></select></label>
              </div>
              <label>Product image URL <span className="optional-label">optional</span><input type="url" value={productImageUrl.startsWith('/api/assets/') ? '' : productImageUrl} onChange={(event) => setProductImageUrl(event.target.value)} placeholder="Synced from the store or add your own" /></label>
              <label className="upload-field">Or upload a product photo<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, setProductImageUrl); event.target.value = '' }} /><span className="upload-help">{uploading ? 'Uploading…' : 'JPEG, PNG, or WebP · up to 5 MB'}</span></label>
              {productSyncMessage && <p className="product-sync-message" role="status">{productSyncMessage}</p>}
              <button className="button button-outline" disabled={!productUrl.trim() || draft.products.length >= 20}>＋ Add to my shop shelf</button>
            </form>
            {draft.products.length > 0 && <div className="product-editor-list"><div className="block-list-heading">YOUR FEATURED PRODUCTS <span>{draft.products.length}</span></div>{draft.products.map((product) => <div className="product-editor-row" key={product.id}>
              <div className="product-editor-thumb">{product.imageUrl && <img src={product.imageUrl} alt="" />}</div>
              <div className="product-editor-fields"><input aria-label="Product name" value={product.title} onChange={(event) => updateProduct(product.id, 'title', event.target.value)} /><input aria-label="Product price" value={product.price} onChange={(event) => updateProduct(product.id, 'price', event.target.value)} placeholder="Price" /></div>
              <button type="button" className="sync-item-button" aria-label={`Refresh ${product.title} details`} title="Refresh image and price" disabled={syncingProductId === product.id} onClick={() => void refreshProduct(product)}>{syncingProductId === product.id ? '…' : '↻'}</button>
              <button type="button" className="remove-block" aria-label={`Remove ${product.title}`} onClick={() => update('products', draft.products.filter((item) => item.id !== product.id))}>×</button>
            </div>)}</div>}
          </div>
          <div className="editor-section address-section">
            <div className="section-title"><span>05</span><div><h2>Your address</h2><p>A little link you can put in your bio.</p></div></div>
            <label>Page link<div className="slug-input"><span>{window.location.host}/</span><input value={draft.slug} maxLength={30} onChange={(event) => update('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} /></div></label>
          </div>
          {message && <div className={`editor-message${message.includes('could not') || message.includes('invalid') || message.includes('taken') ? ' message-error' : ''}`} role="status">{message}</div>}
          <button className="button button-dark button-wide save-bottom" disabled={saving || saved} onClick={() => void save()}>{saving ? 'Saving your page…' : saved ? 'All changes saved' : 'Save my page'} <span aria-hidden="true">↗</span></button>
        </section>
        <aside className="live-preview">
          <div className="preview-toolbar"><span><i /> LIVE PREVIEW</span><span>YOUR PAGE</span></div>
          <PortfolioDisplay portfolio={draft} preview />
          <div className="share-card"><div className="share-spark">↗</div><span>LOOKING LIKE YOU</span><p>Save your page, then add this link to your bio.</p><div className="share-url">{window.location.host}/{draft.slug}</div><button className="copy-link-button" disabled={!saved} onClick={() => void copyPageLink()}>{copied ? 'Copied ✓' : 'Copy link'}</button></div>
        </aside>
      </div>
    </main>
  )
}

const portfolioFontFamilies: Record<Portfolio['font'], string> = {
  sans: "'DM Sans', 'Segoe UI', sans-serif",
  serif: "'DM Serif Display', Georgia, serif",
  rounded: "'Nunito', 'DM Sans', sans-serif",
  mono: "'Space Mono', monospace",
}

function SocialLinks({ portfolio }: { portfolio: Portfolio }) {
  const links = [
    { key: 'youtube', icon: '▶', label: 'YouTube', href: portfolio.socials.youtube },
    { key: 'x', icon: '𝕏', label: 'X', href: portfolio.socials.x },
    { key: 'facebook', icon: 'f', label: 'Facebook', href: portfolio.socials.facebook },
    { key: 'snapchat', icon: '👻', label: 'Snapchat', href: portfolio.socials.snapchat },
    { key: 'email', icon: '✉', label: 'Business email', href: portfolio.socials.email ? `mailto:${portfolio.socials.email}` : '' },
  ]
  const visibleLinks = links.filter((item) => item.href)
  if (!visibleLinks.length) return null
  return <nav className="portfolio-socials" aria-label="Social profiles">{visibleLinks.map(({ key, icon, label, href }) => <a key={key} href={href} target={key === 'email' ? undefined : '_blank'} rel={key === 'email' ? undefined : 'noreferrer'} aria-label={label} title={label}><span aria-hidden="true">{icon}</span></a>)}</nav>
}

function formatProductPrice(product: PortfolioProduct): string {
  if (!product.price) return ''
  const value = Number(product.price.replace(/,/g, ''))
  if (!Number.isFinite(value)) return `${product.currency} ${product.price}`
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: product.currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${product.currency} ${product.price}`
  }
}

function ProductCarousel({ products }: { products: PortfolioProduct[] }) {
  const track = useRef<HTMLDivElement>(null)
  if (!products.length) return null
  return (
    <section className="product-shelf" aria-label="Featured products">
      <div className="product-shelf-heading"><div><span>THE GOOD STUFF</span><h2>Shop the shelf</h2></div><div className="carousel-controls"><button type="button" aria-label="Scroll products left" onClick={() => track.current?.scrollBy({ left: -220, behavior: 'smooth' })}>←</button><button type="button" aria-label="Scroll products right" onClick={() => track.current?.scrollBy({ left: 220, behavior: 'smooth' })}>→</button></div></div>
      <div className="product-carousel-track" ref={track} tabIndex={0} aria-label="Product carousel">
        {products.map((product) => <a key={product.id} className="product-card" href={product.url} target="_blank" rel="noreferrer">
          <div className="product-card-image"><ProductArtwork imageUrl={product.imageUrl} title={product.title} /><span className="product-open" aria-hidden="true">↗</span></div>
          <strong>{product.title}</strong>
          {product.price && <span className="product-card-price">{formatProductPrice(product)}</span>}
        </a>)}
      </div>
    </section>
  )
}

function ProductArtwork({ imageUrl, title }: { imageUrl: string; title: string }) {
  const [unavailable, setUnavailable] = useState(false)
  if (!imageUrl || unavailable) return <span className="product-art-fallback" aria-hidden="true">✳</span>
  return <img src={imageUrl} alt={title} loading="lazy" onError={() => setUnavailable(true)} />
}

function PortfolioDisplay({ portfolio, preview = false }: { portfolio: Portfolio; preview?: boolean }) {
  const photo = portfolio.instagramPhotoUrl
  const initial = portfolio.displayName.trim().charAt(0).toUpperCase() || '✳'
  return (
    <div className={`portfolio-display portfolio-${portfolio.template}${preview ? ' is-preview' : ''}`} style={{ '--portfolio-theme': portfolio.theme, '--portfolio-font': portfolioFontFamilies[portfolio.font] } as React.CSSProperties}>
      <div className="portfolio-cover"><div className="cover-orb" /><div className="cover-lines" /><span>MADE WITH A LITTLE LOVE</span></div>
      <div className="portfolio-identity">
        <div className="portfolio-avatar">{photo ? <img src={photo} alt={`${portfolio.displayName} profile`} /> : <span>{initial}</span>}</div>
        <div className="identity-name">{portfolio.displayName || 'Your name'}</div>
        <div className="identity-handle">{portfolio.instagramUsername ? `@${portfolio.instagramUsername}` : '@yourname'}</div>
        {portfolio.bio && <p className="identity-bio">{portfolio.bio}</p>}
        <a className="instagram-follow" href={portfolio.socials.instagram || portfolio.instagramUrl} target="_blank" rel="noreferrer">Follow along on Instagram <span>↗</span></a>
        <SocialLinks portfolio={portfolio} />
      </div>
      <div className="portfolio-blocks">
        {portfolio.blocks.map((block) => block.type === 'image'
          ? <figure className="portfolio-photo" key={block.id}><img src={block.imageUrl} alt={block.alt} />{block.caption && <figcaption>{block.caption}</figcaption>}</figure>
          : <a className="portfolio-link-card" key={block.id} href={block.url} target="_blank" rel="noreferrer">
            {block.imageUrl ? <div className="portfolio-link-art"><img src={block.imageUrl} alt="" /></div> : <div className="portfolio-link-art placeholder-art" style={{ backgroundColor: portfolio.theme }}><span>{block.provider === 'Spotify' ? '♫' : block.provider === 'YouTube' ? '▶' : '✳'}</span></div>}
            <span className="portfolio-link-copy"><strong>{block.title}</strong>{block.description && <small>{block.description}</small>}<small className="provider-label">{block.provider || 'LINK'}</small></span><span className="link-arrow">↗</span>
          </a>)}
      </div>
      <ProductCarousel products={portfolio.products} />
      {!preview && <footer className="portfolio-footer"><span>MADE WITH A LITTLE LOVE</span><Link className="biobox-cta" to="/"><BioBoxMark /><span>Create your own Bio Box</span><b aria-hidden="true">↗</b></Link></footer>}
    </div>
  )
}

function PublicPortfolioPage() {
  const { slug = '' } = useParams()
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api<{ portfolio: Portfolio }>(`/public/${encodeURIComponent(slug)}`)
      .then((result) => { if (active) setPortfolio(result.portfolio) })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'This page is unavailable.') })
    return () => { active = false }
  }, [slug])

  if (error) return <StatusPage title="A little quiet here." description={error} action={<Link className="button button-dark" to="/">Back to Bio Box</Link>} />
  if (!portfolio) return <LoadingPage />
  return <main className="public-page"><PortfolioDisplay portfolio={portfolio} /></main>
}

function NotFoundPage() {
  return <StatusPage title="This link wandered off." description="We couldn’t find the page you were looking for." action={<Link className="button button-dark" to="/">Go home</Link>} />
}

function StatusPage({ title, description, action }: { title: string; description: string; action: ReactNode }) {
  return <main className="status-page"><Brand /><div className="status-mark">✳</div><h1>{title}</h1><p>{description}</p>{action}</main>
}

function LoadingPage() {
  return <main className="loading-page"><span className="loading-flower">✳</span><span>Opening your page…</span></main>
}

function providerFromUrl(url: URL): string {
  if (url.hostname.endsWith('spotify.com')) return 'Spotify'
  if (url.hostname === 'youtu.be' || url.hostname.endsWith('youtube.com')) return 'YouTube'
  if (url.hostname.endsWith('soundcloud.com')) return 'SoundCloud'
  if (url.hostname === 'instagram.com' || url.hostname.endsWith('.instagram.com')) return 'Instagram'
  if (url.hostname === 'tiktok.com' || url.hostname.endsWith('.tiktok.com')) return 'TikTok'
  return 'LINK'
}

export default App
