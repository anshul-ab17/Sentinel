"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export function InvestigationWindow({
  sentinel,
  children,
}: {
  sentinel: ReactNode;
  children: ReactNode;
}) {
  const [active, setActive] = useState(0);
  const tabs = useRef<HTMLDivElement>(null);
  const id = useId();
  const labels = ["Sentinel", "Investigation workspace"];

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === "ArrowRight" || event.key === "ArrowLeft"
        ? 1 - index
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? 1
            : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabs.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  }

  return (
    <div className="hero-product" aria-label="Sentinel investigation window">
      <div className="product-window-bar">
        <span className="product-window-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <div className="product-window-tabs" ref={tabs} role="tablist" aria-label="Window view">
          {labels.map((label, index) => (
            <button
              key={label}
              type="button"
              role="tab"
              id={`${id}-tab-${index}`}
              aria-controls={`${id}-panel-${index}`}
              aria-selected={active === index}
              tabIndex={active === index ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={(event) => navigate(event, index)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="product-window-status">Live data</span>
      </div>
      <div
        className="product-window-panel"
        role="tabpanel"
        id={`${id}-panel-0`}
        aria-labelledby={`${id}-tab-0`}
        hidden={active !== 0}
        tabIndex={0}
      >
        {sentinel}
      </div>
      <div
        className="product-window-panel"
        role="tabpanel"
        id={`${id}-panel-1`}
        aria-labelledby={`${id}-tab-1`}
        hidden={active !== 1}
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  );
}
