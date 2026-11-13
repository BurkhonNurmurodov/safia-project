// Entry of the motion harness (README.md): mounts page.jsx on the app's own
// stylesheet. The URL hash picks the variant: `#light` the light theme,
// `#strict` a <StrictMode> root.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../src/index.css";
import App from "./page.jsx";

window.__errors = [];
window.addEventListener("error", (e) => window.__errors.push(String(e.message)));
window.addEventListener("unhandledrejection", (e) => window.__errors.push("rejection: " + String(e.reason)));
// A development build of React, or the production one? (run.mjs asserts it.)
window.__dev = import.meta.env.DEV;

document.documentElement.setAttribute("data-theme", location.hash.includes("light") ? "light" : "dark");
const strict = location.hash.includes("strict");
createRoot(document.getElementById("root")).render(strict ? <StrictMode><App /></StrictMode> : <App />);
