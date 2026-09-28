import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
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

// The service worker. src/sw.js is the SOURCE and dist/sw.js is written here,
// with the build's own stamp and precache list filled in: the shell (/), every
// file under dist/assets, the launcher icons and the root statics below. It is
// derived by the build rather than dropped in public/ for the reason build.json
// is — a worker can only ever describe the build it shipped with — and it is
// served no-store by serve_spa for the same reason too. Registered by
// utils/pwa.js, in a browser only (never inside Telegram).
const ROOT_STATICS = [
  '/manifest.webmanifest',
  '/telegram-web-app.js',
  '/favicon.ico',
  '/favicon-32.png',
  '/favicon-192.png',
  '/apple-touch-icon.png',
  '/icons.svg',
  // Drawn by the ES5 boot screens in index.html (stale-version, slow-link,
  // recovery) and fetched by nothing else — the in-app logo is a data URI —
  // so without this the one screen that shows offline would show it broken.
  '/logo.png',
]
function emitServiceWorker() {
  let root = process.cwd()
  let outDir = 'dist'
  return {
    name: 'emit-service-worker',
    apply: 'build',
    configResolved(config) {
      root = config.root
      outDir = config.build.outDir
    },
    writeBundle() {
      const dist = resolve(root, outDir)
      const assets = readdirSync(resolve(dist, 'assets')).map((f) => `/assets/${f}`)
      // Listed from the SOURCE dir, not dist: public/ is copied by Vite on its
      // own schedule and need not be on disk yet when this hook runs.
      const icons = readdirSync(resolve(root, 'public', 'icons')).map((f) => `/icons/${f}`)
      const precache = ['/', ...assets, ...icons, ...ROOT_STATICS]
      const src = readFileSync(resolve(root, 'src', 'sw.js'), 'utf8')
      // Function replacers: a `$` in the JSON must never be read as a pattern.
      writeFileSync(
        resolve(dist, 'sw.js'),
        src
          .replace('"__BUILD__"', () => JSON.stringify(BUILD_TIME))
          .replace('__PRECACHE__', () => JSON.stringify(precache)),
      )
    },
  }
}

// Every file of the build with its SHA-256 — what the Android app downloads
// when the site is deployed (android/…/PageUpdates.java). It fetches only the
// files it does not already hold, checks each one against this list, and
// starts using the new build only once all of them have arrived, so a phone is
// never left with half of one build and half of another. Written in
// closeBundle, after every other file is on disk (build.json and sw.js are
// written in writeBundle, public/ is copied at renderStart), and served
// no-store by serve_spa for the reason build.json is.
const FILE_LIST = 'build-files.json'
function emitFileList() {
  let root = process.cwd()
  let outDir = 'dist'
  return {
    name: 'emit-file-list',
    apply: 'build',
    configResolved(config) {
      root = config.root
      outDir = config.build.outDir
    },
    closeBundle: {
      order: 'post',
      handler() {
        const dist = resolve(root, outDir)
        // No deploy marker = the build never reached writeBundle (it failed).
        if (!existsSync(resolve(dist, 'build.json'))) return
        const files = {}
        const walk = (dir) => {
          for (const name of readdirSync(dir).sort()) {
            const full = resolve(dir, name)
            if (statSync(full).isDirectory()) {
              walk(full)
              continue
            }
            const rel = relative(dist, full).split(sep).join('/')
            if (rel === FILE_LIST) continue
            const data = readFileSync(full)
            files[rel] = { sha256: createHash('sha256').update(data).digest('hex'), size: data.length }
          }
        }
        walk(dist)
        writeFileSync(
          resolve(dist, FILE_LIST),
          JSON.stringify({ version: APP_VERSION, buildTime: BUILD_TIME, files }) + '\n',
        )
      },
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
    emitServiceWorker(),
    emitFileList(),
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
