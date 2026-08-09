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
    // Telegram Desktop on old Windows can fall back to the legacy EdgeHTML/Chakra
    // WebView (UA "…Chrome/70… Edge/18…" — Chakra, not real V8). These pins once
    // made the bundle parse there, but route code-splitting (App.jsx
    // lazyWithReload) put dynamic import() into the entry chunk — syntax
    // Vite/esbuild deliberately never down-level — so Chakra dies at parse again
    // and the ES5 boot overlay in index.html now owns that case with an
    // "outdated Windows browser" notice (phone / site in a real browser / IT
    // installs WebView2). The pins stay for chrome70-class Android WebViews,
    // which DO parse dynamic import (Chrome 63+) but still need ?. / ?? /
    // optional catch binding down-leveled; native async/await is kept (no
    // regenerator bloat). Let Lightning CSS emit fallbacks for oklch()/color-mix().
    target: ['es2017', 'chrome70', 'edge18'],
    cssTarget: 'chrome87',
  },
  server: {
    // Claude Code preview assigns a free port via PORT when 5173 is taken;
    // API_PORT lets a parallel session pair with its own backend instance
    port: Number(process.env.PORT) || 5173,
    allowedHosts: true,
    proxy: {
      '/api': `http://localhost:${process.env.API_PORT || 8000}`,
      '/admin': `http://localhost:${process.env.API_PORT || 8000}`,
    },
  },
})
