import 'dotenv/config'
import { createApp } from './app.js'
import { createDatabase } from './db.js'

const isProduction = process.env.NODE_ENV === 'production'
const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret || (isProduction && jwtSecret.length < 32)) {
  throw new Error('Set JWT_SECRET to a random secret of at least 32 characters.')
}

const app = createApp({
  db: createDatabase(),
  jwtSecret,
  clientOrigin: process.env.CLIENT_ORIGIN,
  isProduction,
})
const port = Number(process.env.PORT ?? 4000)

app.listen(port, () => {
  console.log(`Bio Box API listening on http://localhost:${port}`)
})
