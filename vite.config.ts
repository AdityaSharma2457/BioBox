import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), cloudflare({ viteEnvironment: { name: 'worker' } })],
  environments: {
    worker: { build: { sourcemap: true } },
  },
  server: {
    host: '0.0.0.0', // Listen on all network interfaces
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
