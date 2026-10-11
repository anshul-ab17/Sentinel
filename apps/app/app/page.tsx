import { BrandLogo } from "@app/components/brand-logo";
import { LandingMotion } from "@app/components/landing-motion";
import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@app/components/theme-toggle";
import { LaunchPreview } from "@app/components/launch-preview";
import { Icon } from "@app/components/icon";
import "./landing.css";

export const metadata: Metadata = {
  title: "Sentinel · See the story behind the launch",
  description: "Explore Solana launch activity, trace wallet funding, and replay evidence-backed findings. Try Sentinel's synthetic Meteora DBC demo.",
};

export default function Home() {
  return <LandingMotion>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="landing-header"><Link href="/" className="landing-brand" aria-label="Sentinel home"><span className="landing-brand-mark"><BrandLogo size={36}/></span>sentinel<span className="landing-brand-ai">AI</span></Link>
      <nav className="landing-nav" aria-label="Main navigation"><a href="#workflow">How it works</a><a href="#developers">For developers</a><a href="#questions">Questions</a></nav>
      <div className="landing-header-actions"><ThemeToggle/><Link className="landing-nav-cta" href="/dashboard">Open dashboard<Icon name="arrow" size={16}/></Link></div>
    </header>
    <main id="main-content" className="landing-main">
      <section className="landing-hero" aria-labelledby="hero-heading"><div className="hero-copy"><span className="hero-status"><Icon name="shield" size={14}/>Solana launch intelligence</span>
        <h1 id="hero-heading">Every launch.<br/>A clearer picture.</h1><p className="hero-description">Trace the wallets. Understand the signals.<br className="hero-description-break"/> Investigate Solana launches with evidence you can follow.</p>
        <div className="hero-actions"><Link href="/dashboard" className="landing-primary">Explore the demo<Icon name="arrow" size={18}/></Link><a href="#workflow" className="landing-secondary">See how it works</a></div>
        <p className="hero-note">No wallet connection. Just a closer look.</p>
      </div><div className="hero-product"><div className="product-window-bar"><span className="product-window-dots" aria-hidden="true"><i/><i/><i/></span><span>Sentinel / Investigation workspace</span><span className="product-window-status">Demo preview</span></div><div className="hero-product-body"><aside className="product-context"><div className="product-context-heading"><Icon name="shield" size={18}/><strong>Follow the evidence.</strong></div><p>An investigation begins with a question.</p><div className="product-question">Who’s behind the early buying?</div><div className="product-context-steps"><span><Icon name="check" size={15}/>Explore the launch</span><span><Icon name="check" size={15}/>Trace funding links</span><span><Icon name="check" size={15}/>Inspect the finding</span></div><Link href="/dashboard">Try it in the dashboard<Icon name="arrow" size={15}/></Link><small>Synthetic events. Real detection rules.</small></aside><div className="hero-visual"><LaunchPreview/></div></div></div><div className="hero-protocol"><span>Built around</span><strong>Meteora DBC</strong><span className="protocol-divider"/><strong>Solana</strong><span className="protocol-divider"/><span>Evidence-first research</span></div></section>

      <section id="workflow" className="landing-workflow" aria-labelledby="workflow-heading"><div className="section-intro"><div><p className="section-kicker">From activity to understanding</p><h2 id="workflow-heading">Follow the signal.<br/>Keep the evidence.</h2></div><p>A focused investigation workflow, from the first purchase to a finding you can inspect and reproduce.</p></div>
        <div className="workflow-steps"><article><span className="workflow-icon"><Icon name="launch" size={24}/></span><span className="workflow-number">01 / Observe</span><h3>Start with what happened.</h3><p>Explore pool activity and early purchases. Keep every observation connected to its source event.</p><span className="workflow-detail">Pool events &amp; wallet activity</span></article>
          <article><span className="workflow-icon"><Icon name="signal" size={24}/></span><span className="workflow-number">02 / Investigate</span><h3>Look at the connections.</h3><p>Review buying concentration, shared funding sources, and large transfers through transparent rules.</p><span className="workflow-detail">Three deterministic detection rules</span></article>
          <article><span className="workflow-icon"><Icon name="replay" size={24}/></span><span className="workflow-number">03 / Verify</span><h3>Rewind. Inspect. Reproduce.</h3><p>Replay the same event window, inspect the evidence, and export a structured investigation report.</p><span className="workflow-detail">Versioned rules &amp; replay digests</span></article></div>
      </section>

      <section id="developers" className="landing-developers" aria-labelledby="developers-heading"><div><p className="section-kicker">Intelligence you can build on</p><h2 id="developers-heading">Your workflow.<br/>Structured evidence.</h2><p>Explore the same pools, events, and findings through the development API. Build around readable signals with explicit data coverage.</p><a className="landing-secondary" href="/api/pools" target="_blank" rel="noreferrer">Inspect the sample API<Icon name="code" size={18}/></a><span className="api-disclosure">Development endpoints currently return synthetic data.</span></div>
        <div className="api-preview"><div className="api-preview-header"><span><span className="api-method">GET</span> /api/pools</span><span>JSON response</span></div><pre aria-label="Illustrative API response"><code>{`{
  "coverage": {
    "mode": "demo",
    "liveIngestion": false
  },
  "pools": [
    {
      "address": "demo-orbit-pool",
      "name": "Orbit",
      "symbol": "ORBIT"
    }
  ]
}`}</code></pre><div className="api-preview-footer"><Icon name="code" size={15}/>Abridged example · No API key needed for the local demo</div></div>
      </section>

      <section id="questions" className="landing-faq" aria-labelledby="questions-heading"><div><p className="section-kicker">Before you explore</p><h2 id="questions-heading">A few things<br/>worth knowing.</h2></div><div className="faq-items">
        <details><summary>Is Sentinel monitoring live launches?</summary><p>Not yet. This development preview uses synthetic pools, wallets, and transactions. Live Solana ingestion and database persistence are the next milestones.</p></details>
        <details><summary>Does an alert mean a token is unsafe?</summary><p>No. Alerts describe observed patterns that may warrant investigation. Shared funding does not establish common ownership, and a signal is not proof of wrongdoing or a prediction of price.</p></details>
        <details><summary>Where does AI fit in?</summary><p>Detection rules run independently of AI. Summaries currently use labeled templates. A future AI integration will explain structured evidence; it will not serve as proof.</p></details>
        <details><summary>Can I reproduce a finding?</summary><p>Yes, within the demo dataset. Choose a pool and time window in Launch Autopsy. Identical finalized events and rule configuration produce the same replay digest.</p></details>
      </div></section>

      <div className="landing-ruler" aria-hidden="true"/>
      <section className="landing-closing" aria-labelledby="closing-heading"><div><h2 id="closing-heading">See the launch.<br/>Understand the signals.</h2><p>Trace the wallets. Follow the evidence. Start with Sentinel.</p></div><Link href="/dashboard" className="landing-primary">Get started<Icon name="arrow" size={18}/></Link></section>
      <div className="landing-ruler" aria-hidden="true"/>
    </main>
    <footer className="landing-footer">
      <div className="footer-intro"><p className="footer-statement">SIGNALS IN.<br/>EVIDENCE OUT.</p><Link href="/dashboard">Open Sentinel<Icon name="arrow" size={16}/></Link></div>
      <nav className="footer-links" aria-label="Explore Sentinel"><h3>Explore</h3><Link href="/">Home</Link><a href="#workflow">How it works</a><a href="#questions">Questions</a></nav>
      <nav className="footer-links" aria-label="Sentinel product"><h3>Product</h3><Link href="/dashboard">Dashboard</Link><a href="#developers">For developers</a><a href="/api/pools" target="_blank" rel="noreferrer">Sample API</a></nav>
      <nav className="footer-links" aria-label="Sentinel resources"><h3>Resources</h3><a href="https://github.com/anshul-ab17/Sentinel" target="_blank" rel="noreferrer">GitHub<Icon name="arrow" size={14}/></a><a href="#questions">Data &amp; coverage</a></nav>
      <Link href="/" className="footer-emblem" aria-label="Sentinel home"><BrandLogo size={96}/></Link>
      <div className="footer-legal"><span>Sentinel AI ? Built for the Solana ecosystem.</span><span>Development preview ? Not financial advice.</span></div>
    </footer>
  </LandingMotion>;
}
