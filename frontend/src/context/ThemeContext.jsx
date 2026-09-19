import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    // An installed app's title bar (and a phone browser's chrome) paints
    // <meta name="theme-color">. Keep it on the header's own --bg-base so a
    // theme switch never leaves a dark bar over a light app; the manifest
    // carries the dark values because dark is the default.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      // Read off the stylesheet (data-theme is already set above), never a
      // hand copy of the hex: index.css is the one place the colour lives.
      const bg = getComputedStyle(root).getPropertyValue("--bg-base").trim();
      if (bg) meta.setAttribute("content", bg);
    }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
