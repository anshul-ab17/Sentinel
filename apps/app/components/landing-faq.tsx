"use client";

import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

const questions = [
  {
    question: "Is Sentinel monitoring live launches?",
    answer:
      "Sentinel reads finalized Solana data for the configured cluster and indexes supported Meteora DBC events. Coverage is partial and begins at the configured start slot; unsupported event variants are excluded.",
  },
  {
    question: "Does an alert mean a token is unsafe?",
    answer:
      "No. Alerts describe observed patterns that may warrant investigation. Shared funding does not establish common ownership, and a signal is not proof of wrongdoing or a prediction of price.",
  },
  {
    question: "Where does AI fit in?",
    answer:
      "Detection rules run independently of AI. Summaries currently use labeled templates. A future AI integration will explain structured evidence; it will not serve as proof.",
  },
  {
    question: "Can I reproduce a finding?",
    answer:
      "Choose an indexed pool and time window in Launch Autopsy. Identical finalized events and rule configuration produce the same replay digest.",
  },
];

export function LandingFaq() {
  const [active, setActive] = useState(0);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const id = useId();
  const topics = ["Live coverage", "Reading signals", "AI & evidence", "Replay & verification"];

  function move(direction: number) {
    setActive((current) => (current + direction + questions.length) % questions.length);
  }

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const next =
      event.key === "ArrowRight"
        ? (active + 1) % questions.length
        : event.key === "ArrowLeft"
          ? (active + questions.length - 1) % questions.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? questions.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  }

  function startGesture(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    gesture.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function finishGesture(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    gesture.current = null;
    if (!start) return;
    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    if (Math.abs(x) > 48 && Math.abs(x) > Math.abs(y)) move(x < 0 ? 1 : -1);
  }

  return (
    <div
      className="faq-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label="Questions about Sentinel"
      tabIndex={0}
      onKeyDown={navigate}
    >
      <div className="faq-carousel-nav">
        <button type="button" aria-label="Previous question" onClick={() => move(-1)}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M19 12H5m6-6-6 6 6 6" />
          </svg>
        </button>
        <button type="button" aria-label="Next question" onClick={() => move(1)}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M5 12h14m-6-6 6 6-6 6" />
          </svg>
        </button>
      </div>
      <div
        className="faq-carousel-stage"
        onPointerDown={startGesture}
        onPointerUp={finishGesture}
        onPointerCancel={() => {
          gesture.current = null;
        }}
      >
        {questions.map((item, index) => {
          const relative = (index - active + questions.length) % questions.length;
          const offset = relative > questions.length / 2 ? relative - questions.length : relative;
          const focused = active === index;
          return (
            <article
              className={`faq-riff-card faq-riff-card-${index}`}
              data-active={focused}
              key={item.question}
              style={
                {
                  "--card-offset": offset,
                  "--card-distance": Math.abs(offset),
                  zIndex: questions.length - Math.abs(offset),
                } as CSSProperties
              }
              role="group"
              aria-roledescription="slide"
              aria-label={`Question ${index + 1} of ${questions.length}`}
              aria-hidden={!focused}
              inert={!focused}
            >
              <div className="faq-riff-top">
                <span>{topics[index]}</span>
                <span aria-hidden="true">0{index + 1}</span>
              </div>
              <h3 id={`${id}-question-${index}`}>{item.question}</h3>
              <p>{item.answer}</p>
              <div className="faq-riff-bottom">
                <span>Sentinel</span>
                <span>Product notes</span>
              </div>
            </article>
          );
        })}
      </div>
      <div className="faq-carousel-pagination">
        <span className="faq-carousel-count">
          0{active + 1} / 0{questions.length}
        </span>
        <div className="faq-carousel-dots" aria-label="Choose a question">
          {questions.map((item, index) => (
            <button
              key={item.question}
              type="button"
              aria-label={`Question ${index + 1}: ${item.question}`}
              aria-current={active === index ? "true" : undefined}
              onClick={() => setActive(index)}
            >
              <span />
            </button>
          ))}
        </div>
      </div>
      <p className="faq-carousel-announcement" role="status" aria-live="polite" aria-atomic="true">
        Question {active + 1} of {questions.length}: {questions[active].question}
      </p>
    </div>
  );
}
