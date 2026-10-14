"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import { Icon } from "@app/components/icon";

const principles = [
  "Trace each finding to its source events.",
  "See the rule behind the signal.",
  "Keep observations separate from conclusions.",
];

export function ApproachAccordion() {
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (index + 1) % principles.length
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index + principles.length - 1) % principles.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? principles.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    root.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  }

  return (
    <div
      className="approach-accordion"
      ref={root}
      role="group"
      aria-label="Investigation principles"
      onMouseLeave={() => setActive(0)}
    >
      {principles.map((principle, index) => (
        <button
          key={principle}
          type="button"
          className={`approach-accordion-card approach-accordion-card-${index}`}
          aria-pressed={active === index}
          onClick={() => setActive(index)}
          onMouseEnter={() => setActive(index)}
          onFocus={() => setActive(index)}
          onKeyDown={(event) => navigate(event, index)}
        >
          <span className="approach-accordion-index" aria-hidden="true">
            0{index + 1}
          </span>
          <span className="approach-accordion-label">
            <Icon name="check" size={18} />
            <span>{principle}</span>
          </span>
          <span className="approach-accordion-expand" aria-hidden="true">
            <Icon name="arrow" size={20} />
          </span>
        </button>
      ))}
    </div>
  );
}
