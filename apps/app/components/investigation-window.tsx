import { useId, type ReactNode } from "react";

export function InvestigationWindow({ sentinel }: { sentinel: ReactNode }) {
  const id = useId();

  return (
    <div className="hero-product" aria-label="Sentinel investigation window">
      <div className="product-window-bar">
        <span className="product-window-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <div className="product-window-tabs" role="tablist" aria-label="Window view">
          <button
            type="button"
            role="tab"
            id={`${id}-tab-sentinel`}
            aria-controls={`${id}-panel-sentinel`}
            aria-selected="true"
          >
            Sentinel
          </button>
        </div>
        <span className="product-window-status">Live data</span>
      </div>
      <div
        className="product-window-panel"
        role="tabpanel"
        id={`${id}-panel-sentinel`}
        aria-labelledby={`${id}-tab-sentinel`}
        tabIndex={0}
      >
        {sentinel}
      </div>
    </div>
  );
}
