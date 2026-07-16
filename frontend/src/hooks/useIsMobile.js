import { useState, useEffect } from "react";

// Viewport-based phone detection (default: below Tailwind's `sm` 640px).
export default function useIsMobile(bp = 640) {
  const query = `(max-width: ${bp - 1}px)`;
  const [mobile, setMobile] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = e => setMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return mobile;
}
