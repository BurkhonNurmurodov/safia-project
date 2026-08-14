import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// ONE source of truth for the version: the repo-root VERSION file, which
// backend/app/version.py reads too. Bump that file, never this one.
let APP_VERSION = '0.0.0'
try {
  APP_VERSION = readFileSync(fileURLToPath(new URL('../VERSION', import.meta.url)), 'utf8').trim() || APP_VERSION
} catch {
  // No VERSION file (a stripped checkout) — the app still builds, unversioned.
}

// The build timestamp, NOT the git SHA: the Stop hook builds and only then
// commits, so any SHA baked in here would name the PREVIOUS commit — worse
// than no SHA at all. The stamp has no such off-by-one, and the deployed
// commit comes from the server at runtime (/api/version).
const BUILD_TIME = new Date().toISOString()

// The deploy marker. Emitted next to index.html so a RUNNING tab can ask
// "which build is live right now?" and offer a reload when the answer stops
// matching the stamp baked into its own bundle.
//
// It is emitted by the build rather than dropped in public/ so it can only ever
// describe the build it shipped with, and it must be served no-store (see
// serve_spa in backend/app/main.py) — a cached marker reports the build the
// user already has, and the prompt would never fire.
function emitBuildInfo() {
  let root = process.cwd()
  let outDir = 'dist'
  return {
    name: 'emit-build-info',
    apply: 'build',
    configResolved(config) {
      root = config.root
      outDir = config.build.outDir
    },
    // Written to disk in writeBundle rather than handed to the bundler via
    // this.emitFile: Vite 8 runs Rolldown, which dropped the emitted asset
    // silently — and a marker that silently isn't there is a feature that
    // silently does nothing.
    writeBundle() {
      writeFileSync(
        resolve(root, outDir, 'build.json'),
        JSON.stringify({ version: APP_VERSION, buildTime: BUILD_TIME }) + '\n',
      )
    },
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  plugins: [
    react(),
    tailwindcss(),
    emitBuildInfo(),
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
