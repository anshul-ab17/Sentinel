"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function WorkflowStack({ children }: { children: ReactNode }) {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = root.current;
    if (!section) return;
    const stage = section.querySelector<HTMLElement>(".workflow-steps")!;
    const cards = Array.from(stage.querySelectorAll<HTMLElement>("article"));
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const viewport = window.matchMedia("(min-width: 850px) and (min-height: 700px)");
    let frame = 0;

    const draw = () => {
      frame = 0;
      if (section.dataset.animated !== "true") return;
      const top = parseFloat(getComputedStyle(section.firstElementChild!).top);
      const distance = section.offsetHeight - section.firstElementChild!.getBoundingClientRect().height;
      const progress = Math.max(0, Math.min(1, (top - section.getBoundingClientRect().top) / distance));
      const stride = (stage.clientWidth + 20) / 3;
      cards.forEach((card, index) => {
        const phase = Math.max(0, Math.min(1, progress * 3.4 - index));
        const ease = phase * phase * (3 - 2 * phase);
        const start = stride + index * 26;
        const x = start + (index * stride - start) * ease;
        const y = (1 - ease) * (32 + index * 14) - Math.sin(phase * Math.PI) * 52;
        card.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${(1 - ease) * (index - 1) * 3}deg)`;
        card.style.setProperty("--card-progress", String(ease));
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    const sync = () => {
      section.dataset.animated = String(viewport.matches && !preference.matches);
      cards.forEach(card => { card.style.removeProperty("transform"); card.style.removeProperty("--card-progress"); });
      schedule();
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(section);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", sync);
    preference.addEventListener("change", sync);
    viewport.addEventListener("change", sync);
    sync();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", sync);
      preference.removeEventListener("change", sync);
      viewport.removeEventListener("change", sync);
    };
  }, []);

  return <section ref={root} id="workflow" className="landing-workflow" aria-labelledby="workflow-heading">
    <div className="workflow-pin">{children}<div className="workflow-caption" aria-hidden="true"><span>THE INVESTIGATION FILES / 01—03</span><span>Scroll to unfold ↓</span></div></div>
  </section>;
}
