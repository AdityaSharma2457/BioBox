declare module '@cloudflare/vite-plugin' {
  export function cloudflare(options?: { viteEnvironment?: { name?: string } }): import('vite').Plugin
}
