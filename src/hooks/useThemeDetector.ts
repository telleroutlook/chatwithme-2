import { useEffect, useState } from "react";

/**
 * Hook to detect the current theme (dark/light) based on data-mode attribute on documentElement.
 */
export function useThemeDetector() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.getAttribute("data-mode") === "dark";
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.getAttribute("data-mode") === "dark";
      setIsDark(dark);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-mode"],
    });

    return () => observer.disconnect();
  }, []);

  return isDark;
}
