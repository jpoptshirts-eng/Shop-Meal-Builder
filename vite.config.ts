import type { ViteDevServer } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function noStoreDevHeaders() {
  return {
    name: 'no-store-dev-headers',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        // Prevent stale HTML/assets during rapid local iteration.
        if (
          req.url &&
          (req.url === '/' ||
            req.url.startsWith('/src/') ||
            req.url.startsWith('/@vite') ||
            req.url.startsWith('/node_modules/.vite/'))
        ) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
          res.setHeader('Pragma', 'no-cache')
          res.setHeader('Expires', '0')
          res.setHeader('Surrogate-Control', 'no-store')
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), noStoreDevHeaders()],
  server: {
    port: 5182,
    strictPort: true,
  },
})
