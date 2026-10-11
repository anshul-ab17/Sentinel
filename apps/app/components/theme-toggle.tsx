"use client";

export function ThemeToggle() {
  function toggleTheme() {
    const root = document.documentElement;
    const current = root.dataset.theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const theme = current === "dark" ? "light" : "dark";
    root.dataset.theme = theme;
    try { localStorage.setItem("sentinel-theme", theme); } catch { /* Theme still works when storage is unavailable. */ }
  }

  return <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label="Toggle light and dark theme" title="Toggle light and dark theme">
    <svg className="theme-sun" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>
    <svg className="theme-moon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z"/></svg>
    <span className="theme-sun">Light mode</span><span className="theme-moon">Dark mode</span>
  </button>;
}
