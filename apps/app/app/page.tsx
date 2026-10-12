import { BrandLogo } from "@app/components/brand-logo";
import { LandingFaq } from "@app/components/landing-faq";
import { LandingMotion } from "@app/components/landing-motion";
import { WorkflowStack } from "@app/components/workflow-stack";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "@app/components/theme-toggle";
import { LaunchPreview } from "@app/components/launch-preview";
import { Icon } from "@app/components/icon";
import { WalletConnect } from "@app/components/wallet-connect";
import "./landing.css";

export const metadata: Metadata = {
  title: "Sentinel · See the story behind the launch",
  description: "Explore Solana launch activity, trace wallet funding, and replay evidence-backed findings. Try Sentinel's synthetic Meteora DBC demo.",
};

export default function Home() {
  return <LandingMotion>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="landing-header"><Link href="/" className="landing-brand" aria-label="Sentinel home"><span className="landing-brand-mark"><BrandLogo size={36}/></span>sentinel<span className="landing-brand-ai">AI</span></Link>
      <nav className="landing-nav" aria-label="Main navigation"><a href="#workflow">How it works</a><a href="#approach">Our approach</a><a href="#questions">FAQ</a></nav>
      <div className="landing-header-actions"><ThemeToggle/><Link className="landing-nav-cta" href="/dashboard"><Icon name="arrow" size={17}/>Open dashboard</Link><WalletConnect/></div>
    </header>
    <main id="main-content" className="landing-main">
      <section className="landing-hero" aria-labelledby="hero-heading">
        <Image className="hero-background hero-background-dark" src="/hero-background.png" alt="" fill sizes="100vw" preload/>
        <Image className="hero-background hero-background-light" src="/hero-background-light-v2.png" alt="" fill sizes="100vw" loading="eager"/>
        <div className="hero-shade" aria-hidden="true"/>
        <div className="hero-copy"><span className="hero-status"><Icon name="shield" size={15}/>Solana launch intelligence</span>
          <h1 id="hero-heading"><span className="hero-line"><span>Every launch.</span></span><span className="hero-line"><span>A clearer picture.</span></span></h1><p className="hero-description">Trace the wallets. Understand the signals.<br/>Investigate Solana launches with evidence you can follow.</p>
          <div className="hero-actions"><Link href="/dashboard" className="landing-primary">Explore the demo<Icon name="arrow" size={18}/></Link><a href="#workflow" className="landing-secondary"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="m7 4 13 8-13 8V4Z"/></svg>See how it works</a></div>
        </div>
        <a className="hero-scroll" href="#workflow"><span>Scroll to investigate</span><Icon name="arrow" size={16}/></a>
      </section>

      <WorkflowStack><div className="section-intro"><div><p className="section-kicker">How it works / From activity to understanding</p><h2 id="workflow-heading">Follow the signal.<br/>Keep the evidence.</h2></div><p>A focused investigation workflow, from the first purchase to a finding you can inspect and reproduce.</p></div>
        <div className="workflow-steps"><article><span className="workflow-icon"><Icon name="launch" size={24}/></span><span className="workflow-number">01 / Observe</span><h3>Start with what happened.</h3><p>Explore pool activity and early purchases. Keep every observation connected to its source event.</p><span className="workflow-detail">Pool events &amp; wallet activity</span></article>
          <article><span className="workflow-icon"><Icon name="signal" size={24}/></span><span className="workflow-number">02 / Investigate</span><h3>Look at the connections.</h3><p>Review buying concentration, shared funding sources, and large transfers through transparent rules.</p><span className="workflow-detail">Three deterministic detection rules</span></article>
          <article><span className="workflow-icon"><Icon name="replay" size={24}/></span><span className="workflow-number">03 / Verify</span><h3>Rewind. Inspect. Reproduce.</h3><p>Replay the same event window, inspect the evidence, and export a structured investigation report.</p><span className="workflow-detail">Versioned rules &amp; replay digests</span></article></div>
      </WorkflowStack>

      <section id="approach" className="landing-approach" aria-labelledby="approach-heading">
        <div className="approach-copy"><p className="section-kicker">Built for a closer look</p><h2 id="approach-heading">A signal is<br/>just the start.</h2><p>A pattern gives you a question. The evidence helps you decide what to investigate next.</p>
          <div className="approach-principles"><div><Icon name="check" size={16}/><span>Trace each finding to its source events.</span></div><div><Icon name="check" size={16}/><span>See the rule behind the signal.</span></div><div><Icon name="check" size={16}/><span>Keep observations separate from conclusions.</span></div></div>
          <Link href="/dashboard" className="landing-secondary">Take a closer look<Icon name="arrow" size={16}/></Link>
        </div>
        <div className="hero-product"><div className="product-window-bar"><span className="product-window-dots" aria-hidden="true"><i/><i/><i/></span><span>Sentinel / Investigation workspace</span><span className="product-window-status">Demo preview</span></div><div className="hero-product-body"><aside className="product-context"><div className="product-context-heading"><Icon name="shield" size={18}/><strong>Follow the evidence.</strong></div><p>An investigation begins with a question.</p><div className="product-question">Who’s behind the early buying?</div><div className="product-context-steps"><span><Icon name="check" size={15}/>Explore the launch</span><span><Icon name="check" size={15}/>Trace funding links</span><span><Icon name="check" size={15}/>Inspect the finding</span></div><Link href="/dashboard">Try it in the dashboard<Icon name="arrow" size={15}/></Link><small>Synthetic events. Real detection rules.</small></aside><div className="hero-visual"><LaunchPreview/></div></div></div>
      </section>

      <section id="questions" className="landing-faq" aria-labelledby="questions-heading"><div className="faq-intro"><p className="section-kicker">Before you explore</p><h2 id="questions-heading">A few things<br/>worth knowing.</h2></div><LandingFaq/></section>

      <div className="landing-ruler" aria-hidden="true"/>
      <section className="landing-closing" aria-labelledby="closing-heading"><div><h2 id="closing-heading">See the launch.<br/>Understand the signals.</h2><p>Trace the wallets. Follow the evidence. Start with Sentinel.</p></div><Link href="/dashboard" className="landing-primary">Get started<Icon name="arrow" size={18}/></Link></section>
      <div className="landing-ruler" aria-hidden="true"/>
    </main>
    <footer className="landing-footer">
      <div className="footer-intro"><p className="footer-statement">SIGNALS IN.<br/>EVIDENCE OUT.</p><Link href="/dashboard">Open Sentinel<Icon name="arrow" size={16}/></Link></div>
      <nav className="footer-links" aria-label="Explore Sentinel"><h3>Explore</h3><Link href="/">Home</Link><a href="#workflow">How it works</a><a href="#questions">Questions</a></nav>
      <nav className="footer-links" aria-label="Sentinel product"><h3>Product</h3><Link href="/dashboard">Dashboard</Link><a href="#approach">Our approach</a><a href="/api/pools" target="_blank" rel="noreferrer">Sample API</a></nav>
      <nav className="footer-links" aria-label="Sentinel resources"><h3>Resources</h3><a href="https://github.com/anshul-ab17/Sentinel" target="_blank" rel="noreferrer">GitHub<Icon name="arrow" size={14}/></a><a href="#questions">Data &amp; coverage</a></nav>
      <Link href="/" className="footer-emblem" aria-label="Sentinel home"><BrandLogo size={96}/></Link>
      <div className="footer-legal"><span>Sentinel | Built for the Solana ecosystem.</span><span>Development | Not financial advice.</span></div>
    </footer>
  </LandingMotion>;
}
