// App-chrome brand logo (sidebar header + PageLoader + browser login), inlined
// as base64 data URIs at build time via `?inline` so the bytes are baked into
// the hashed JS bundle and need NO separate network fetch.
//
// Why not the stable public /logo.png: that GET still passes through the
// Engintron microcache (see [[prod-topology-engintron-cache]]) and the
// Imunify360 WebShield anti-bot layer (see [[imunify360-webshield-antibot]]).
// When either returns a bad response once (anti-bot challenge HTML in the
// Telegram WebView, or a 502/empty during a Passenger restart), that response
// gets cached under the stable URL — and because the URL never changes, every
// refresh re-serves the poisoned entry (the "no matter how many times I refresh
// it's gone" symptom). A data URI has no URL to fetch, so nothing can intercept
// or poison it.
//
// Two small 192px palette-quantized copies (~9 KB each) of frontend/public/
// logo.png — the Safia IMS emblem (2026-10-13), transparent outside its
// circle — sized for the 96px loader / 36px sidebar: the emblem on its ink
// ground, and the same drawing on a cream ground for the light theme
// (2026-10-14). Both are rendered by scripts/render-icons.py, never by hand;
// components/ui/BrandLogo.jsx draws them and the theme shows one. The
// full-res /logo.png (and /logo-light-v2.png) stay for the ES5 boot overlay in
// index.html (which can't import).
import logoChrome from "./logo-chrome.png?inline";
import logoChromeLight from "./logo-chrome-light.png?inline";

export { logoChromeLight };
export default logoChrome;
