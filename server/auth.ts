import type { RequestHandler } from 'express'
import jwt from 'jsonwebtoken'

export const sessionCookie = 'gather_session'

export function issueSession(userId: number, secret: string): string {
  return jwt.sign({ sub: userId }, secret, { expiresIn: '7d' })
}

export function requireAuth(secret: string): RequestHandler {
  return (req, res, next) => {
    const token = req.cookies?.[sessionCookie]
    if (typeof token !== 'string') {
      res.status(401).json({ error: 'Please sign in to continue.' })
      return
    }
    try {
      const payload = jwt.verify(token, secret)
      const userId = typeof payload === 'object' && payload.sub ? Number(payload.sub) : NaN
      if (!Number.isSafeInteger(userId) || userId < 1) {
        res.status(401).json({ error: 'Your session is invalid. Please sign in again.' })
        return
      }
      res.locals.userId = userId
      next()
    } catch {
      res.status(401).json({ error: 'Your session expired. Please sign in again.' })
    }
  }
}
