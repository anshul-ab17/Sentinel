"use client";

export function ThemeToggle() {
  function toggleTheme() {
    const root = document.documentElement;
    const current = root.dataset.theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const theme = current === "dark" ? "light" : "dark";
    root.dataset.theme = theme;
    try { localStorage.setItem("sentinel-theme", theme); } catch { /* Theme still works when storage is unavailable. */ }
  }

  return <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label="Toggle light and dark theme">
    <svg className="theme-sun" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M8 6h4v2h2v4h-2v2H8v-2H6V8h2V6ZM9 1h2v3H9zM9 16h2v3H9zM1 9h3v2H1zM16 9h3v2h-3zM3 3h2v2H3zM15 3h2v2h-2zM3 15h2v2H3zM15 15h2v2h-2z"/>
    </svg>
    <svg className="theme-moon" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M8 2h4v2H8v4h2v2h2v2h4v-2h2v4h-2v2h-2v2H6v-2H4v-2H2V6h2V4h4V2Z"/>
    </svg>
  </button>;
}
