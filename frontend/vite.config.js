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
    // Telegram Desktop on old Windows can run the legacy EdgeHTML/Chakra WebView
    // (UA "…Chrome/70… Edge/18…" — Chakra, not real V8). It parses almost all of
    // ES2019 but NOT optional catch binding (`try{}catch{}` with no `(e)`), so an
    // es2019 bundle threw "Expected '(' … bundle never started" and never mounted.
    // Pin the actual engines so esbuild down-levels exactly what they lack
    // (optional catch binding, object spread, async iteration, ?. / ??) while
    // keeping native async/await (both engines have it → no regenerator bloat).
    // Let Lightning CSS emit fallbacks for oklch()/color-mix().
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
