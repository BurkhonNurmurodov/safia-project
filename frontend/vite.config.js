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
  '/favicon-32-v2.png',
  '/favicon-192-v2.png',
  '/apple-touch-icon-v2.png',
  '/icons.svg',
  // Drawn by the ES5 boot screens in index.html (stale-version, slow-link,
  // recovery) and fetched by nothing else — the in-app logo is a data URI —
  // so without this the one screen that shows offline would show it broken.
  // logo-light-v2.png is the same emblem on cream, for the light theme.
  '/logo.png',
  '/logo-light-v2.png',
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

// The version and the build stamp travel in index.html, NEVER in a JS chunk
// (2026-10-23). A chunk's file name hashes its content AND the names of the
// chunks it imports, so a value that changes every build (the stamp) or every
// commit (VERSION) inlined into one shared chunk renamed 227 of 231 files on
// every deploy — a backend-only deploy included — and every phone re-downloaded
// the whole app (~1.7 MB brotli) through the slow Cloudflare route after each
// of ~20 deploys a day. index.html is served no-store and is the one file a
// navigation always re-fetches, so it carries them for free; utils/version.js
// reads the tag. `guardStampOutOfChunks` fails the build if the stamp ever
// reaches a chunk again (a `define`, an import of build.json …).
function injectBuildMeta() {
  return {
    name: 'inject-build-meta',
    transformIndexHtml() {
      return [{
        tag: 'meta',
        attrs: { name: 'safia-build', 'data-version': APP_VERSION, 'data-built': BUILD_TIME },
        injectTo: 'head',
      }]
    },
  }
}

// ONE language per reader (2026-10-23). src/i18n/translations.js holds every
// UI string in all four languages (~2.4 MB) and stays the ONE file people edit;
// shipped whole, it was a 2.1 MB chunk every page load downloaded and parsed
// before the first paint, although a reader only ever reads one of the four.
// This plugin cuts it into four modules — `virtual:i18n/<lang>` — each holding
// that language's strings plus whatever an older key still needs from the
// fallback chain LangContext applies (uz for uz_cyrl, then en), so a pack
// alone answers exactly what the whole dictionary did. src/i18n/packs.js loads
// the reader's one; index.html starts fetching it before the app code runs
// (the inline preload injected below), so it adds no round trip in a row.
// A pack is emitted as JSON.parse('…'): V8 parses a JSON string far faster
// than the same object written as a JS literal.
const I18N_PREFIX = 'virtual:i18n/'
const I18N_LANGS = ['uz', 'uz_cyrl', 'ru', 'en']
function i18nPacks() {
  let root = process.cwd()
  let cache = null // { mtime, dict }
  const source = () => resolve(root, 'src', 'i18n', 'translations.js')
  const readDict = () => {
    const file = source()
    const mtime = statSync(file).mtimeMs
    if (cache && cache.mtime === mtime) return cache.dict
    const text = readFileSync(file, 'utf8')
    const body = text.replace(/export\s+default\s+t\s*;?\s*$/, '')
    if (body === text || !/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*const t = \{/.test(body)) {
      throw new Error('src/i18n/translations.js must stay `const t = { … }; export default t;` — the i18n pack plugin reads it as one object literal.')
    }
    const dict = new Function(`${body}\nreturn t;`)()
    cache = { mtime, dict }
    return dict
  }
  const pack = (dict, lang) => {
    const own = dict[lang] || {}
    const pick = (from, skip) => Object.fromEntries(
      Object.entries(from || {}).filter(([k]) => !(k in own) && !(skip && k in skip)))
    const uz = lang === 'uz_cyrl' ? pick(dict.uz) : {}
    const en = lang === 'en' ? {} : pick(dict.en, uz)
    return { own, uz, en }
  }
  return {
    name: 'i18n-packs',
    configResolved(config) { root = config.root },
    resolveId(id) {
      if (id.startsWith(I18N_PREFIX) && I18N_LANGS.includes(id.slice(I18N_PREFIX.length))) return `\0${id}`
      return null
    },
    load(id) {
      if (!id.startsWith(`\0${I18N_PREFIX}`)) return null
      this.addWatchFile(source())
      const json = JSON.stringify(pack(readDict(), id.slice(I18N_PREFIX.length + 1)))
      return `export default JSON.parse(${JSON.stringify(json)})`
    },
    // Dev: an edit to translations.js reloads the page (the packs are virtual,
    // so HMR has no module of the file's own to swap).
    handleHotUpdate({ file, server }) {
      if (file === source()) {
        cache = null
        for (const lang of I18N_LANGS) {
          const mod = server.moduleGraph.getModuleById(`\0${I18N_PREFIX}${lang}`)
          if (mod) server.moduleGraph.invalidateModule(mod)
        }
        server.ws.send({ type: 'full-reload' })
        return []
      }
    },
    // Build: name each pack's file in index.html and fetch the reader's one
    // at once — the language is in localStorage, the app code is not needed to
    // know it. Also puts the pack in the boot watchdog's view (it counts every
    // modulepreload), so a slow pack reads as «still downloading», not as an
    // app that never painted.
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.bundle) return []
        const files = {}
        for (const f of Object.values(ctx.bundle)) {
          if (f.type !== 'chunk' || !f.facadeModuleId) continue
          const m = f.facadeModuleId.match(/^\0virtual:i18n\/(\w+)$/)
          if (m) files[m[1]] = `/${f.fileName}`
        }
        if (Object.keys(files).length !== I18N_LANGS.length) {
          throw new Error(`i18n-packs: expected ${I18N_LANGS.length} language chunks, found ${Object.keys(files).join(', ') || 'none'}`)
        }
        const code = `(function(){try{var f=${JSON.stringify(files)};var l=null;try{l=localStorage.getItem("lang")}catch(e){}`
          + `var h=f[l||"uz"]||f.en;var e=document.createElement("link");e.rel="modulepreload";e.setAttribute("crossorigin","");e.href=h;`
          + `document.head.appendChild(e)}catch(e){}})();`
        return [{ tag: 'script', children: code, injectTo: 'head' }]
      },
    },
  }
}

function guardStampOutOfChunks() {
  return {
    name: 'guard-stamp-out-of-chunks',
    apply: 'build',
    generateBundle(_options, bundle) {
      const hit = Object.values(bundle).filter(
        (f) => f.type === 'chunk' && f.code.includes(BUILD_TIME))
      if (hit.length) {
        this.error(
          `The build stamp is inside ${hit.length} JS chunk(s) (${hit.map((f) => f.fileName).slice(0, 5).join(', ')}): ` +
          'every deploy would rename every asset and every user would re-download the whole app. ' +
          'Read APP_VERSION / BUILD_TIME from utils/version.js (the index.html meta tag), never from a define.')
      }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    i18nPacks(),
    injectBuildMeta(),
    guardStampOutOfChunks(),
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
