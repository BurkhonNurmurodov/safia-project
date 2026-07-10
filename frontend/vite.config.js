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
    // Claude Code preview assigns a free port via PORT when 5173 is taken
    port: Number(process.env.PORT) || 5173,
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:8000',
      '/admin': 'http://localhost:8000',
    },
  },
})
