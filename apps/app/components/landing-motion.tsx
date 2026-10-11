"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Content stays visible without JavaScript; motion only enhances its arrival. */
export function LandingMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = root.current;
    if (!container || !("IntersectionObserver" in window)) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Map<Element, Animation>();
    const revealed = new Set<Element>();
    const groups = [
      ".hero-copy > *", ".hero-product", ".hero-protocol",
      ".landing-developers > *", ".landing-faq > div:first-child",
      ".faq-items > details", ".landing-closing > *", ".landing-footer > *",
    ];
    const delays = new Map<Element, number>();
    for (const selector of groups) {
      container.querySelectorAll(selector).forEach((element, index) => delays.set(element, Math.min(index, 3) * 75));
    }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        revealed.add(entry.target);
        if (preference.matches || entry.target.contains(document.activeElement)) continue;
        const animation = entry.target.animate([
          { opacity: 0, transform: "translateY(18px)" },
          { opacity: 1, transform: "translateY(0)" },
        ], { duration: 650, delay: delays.get(entry.target) ?? 0, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "backwards" });
        animations.set(entry.target, animation);
        animation.onfinish = () => animations.delete(entry.target);
      }
    }, { threshold: 0.08, rootMargin: "0px 0px -20px 0px" });

    const syncPreference = () => {
      observer.disconnect();
      animations.forEach(animation => animation.cancel());
      animations.clear();
      if (!preference.matches) delays.forEach((_, element) => {
        if (!revealed.has(element)) observer.observe(element);
      });
    };
    const onFocus = (event: FocusEvent) => {
      if (!(event.target instanceof Node)) return;
      for (const [element, animation] of animations) {
        if (element.contains(event.target)) {
          animation.cancel();
          animations.delete(element);
        }
      }
    };
    syncPreference();
    preference.addEventListener("change", syncPreference);
    container.addEventListener("focusin", onFocus);
    return () => {
      observer.disconnect();
      animations.forEach(animation => animation.cancel());
      preference.removeEventListener("change", syncPreference);
      container.removeEventListener("focusin", onFocus);
    };
  }, []);

  return <div className="landing" ref={root}>{children}</div>;
}
