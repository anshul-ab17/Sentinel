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
    const progress = container.querySelector<HTMLElement>(".landing-progress");
    let frame = 0;
    const drawProgress = () => {
      frame = 0;
      const distance = document.documentElement.scrollHeight - window.innerHeight;
      progress?.style.setProperty(
        "--scroll-progress",
        String(distance > 0 ? Math.max(0, Math.min(1, window.scrollY / distance)) : 0),
      );
    };
    const scheduleProgress = () => {
      if (!frame) frame = requestAnimationFrame(drawProgress);
    };
    const groups = [
      ".landing-header > *",
      ".hero-copy > :not(h1)",
      ".hero-line > span",
      ".section-intro > *",
      ".approach-copy > *",
      ".hero-product",
      ".approach-principles > div",
      ".landing-faq > div:first-child",
      ".faq-carousel",
      ".landing-closing > *",
      ".landing-footer > *",
    ];
    const delays = new Map<Element, number>();
    for (const selector of groups) {
      container
        .querySelectorAll(selector)
        .forEach((element, index) => delays.set(element, Math.min(index, 3) * 75));
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          revealed.add(entry.target);
          if (preference.matches || entry.target.contains(document.activeElement)) continue;
          const isHeadline = entry.target.matches(".hero-line > span");
          const isWindow = entry.target.matches(".hero-product");
          const animation = entry.target.animate(
            [
              {
                opacity: isHeadline ? 1 : 0,
                transform: isHeadline
                  ? "translateY(110%)"
                  : isWindow
                    ? "translateY(46px) scale(.96)"
                    : "translateY(26px)",
              },
              { opacity: 1, transform: "translateY(0) scale(1)" },
            ],
            {
              duration: isHeadline || isWindow ? 1000 : 750,
              delay: delays.get(entry.target) ?? 0,
              easing: "cubic-bezier(.22, 1, .36, 1)",
              fill: "backwards",
            },
          );
          animations.set(entry.target, animation);
          animation.onfinish = () => animations.delete(entry.target);
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -20px 0px" },
    );
    const sceneObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          (entry.target as HTMLElement).dataset.inView = String(entry.isIntersecting);
        });
      },
      { threshold: 0.1 },
    );
    container
      .querySelectorAll(".landing-hero, .hero-product")
      .forEach((element) => sceneObserver.observe(element));

    const syncPreference = () => {
      observer.disconnect();
      animations.forEach((animation) => animation.cancel());
      animations.clear();
      container.dataset.motion = String(!preference.matches);
      if (!preference.matches)
        delays.forEach((_, element) => {
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
    drawProgress();
    window.addEventListener("scroll", scheduleProgress, { passive: true });
    window.addEventListener("resize", scheduleProgress);
    preference.addEventListener("change", syncPreference);
    container.addEventListener("focusin", onFocus);
    return () => {
      observer.disconnect();
      sceneObserver.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleProgress);
      window.removeEventListener("resize", scheduleProgress);
      delete container.dataset.motion;
      animations.forEach((animation) => animation.cancel());
      preference.removeEventListener("change", syncPreference);
      container.removeEventListener("focusin", onFocus);
    };
  }, []);

  return (
    <div className="landing" ref={root}>
      <div className="landing-progress" aria-hidden="true" />
      {children}
    </div>
  );
}
