// THE brand emblem in the app chrome (sidebar, PageLoader, browser login).
// It renders BOTH drawings — the emblem on its ink ground and the same emblem
// on cream — and index.css shows the one for the theme in force
// (.brand-logo-dark / .brand-logo-light, keyed on <html data-theme>). CSS, not
// useTheme(): PageLoader also stands in for whole pages before every provider
// has mounted, and the boot script paints a stored light theme onto
// data-theme before React runs, so the right logo is there from the first
// frame. The hidden one is display:none, so a screen reader hears one alt.
// Both are inlined data URIs (assets/logoChrome.js) — no network fetch.
import logoDark, { logoChromeLight as logoLight } from "../../assets/logoChrome.js";

export default function BrandLogo({ alt = "Safia", className = "", style }) {
  return (
    <>
      <img src={logoDark} alt={alt} className={`brand-logo-dark ${className}`} style={style} />
      <img src={logoLight} alt={alt} className={`brand-logo-light ${className}`} style={style} />
    </>
  );
}
