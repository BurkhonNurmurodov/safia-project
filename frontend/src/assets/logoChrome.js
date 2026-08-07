// App-chrome brand logo (sidebar header + PageLoader), inlined as a base64
// data URI at build time via `?inline` so the bytes are baked into the hashed
// JS bundle and need NO separate network fetch.
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
// This is a small 192px palette-quantized copy (~8 KB) of frontend/public/
// logo.png, sized for the 96px loader / 36px sidebar. The full-res /logo.png
// stays for the ES5 boot overlay in index.html (which can't import).
import logoChrome from "./logo-chrome.png?inline";

export default logoChrome;
