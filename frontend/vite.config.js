import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    minify: 'esbuild',
    // Telegram Desktop on old Windows is capped at WebView2 109 — keep JS
    // compatible and let Lightning CSS emit fallbacks for oklch()/color-mix()
    target: 'es2019',
    cssTarget: 'chrome87',
  },
  server: {
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:8000',
      '/admin': 'http://localhost:8000',
    },
  },
})
