import { BrandLogo } from "@app/components/brand-logo";
import { WalletConnect } from "@app/components/wallet-connect";

import type { Metadata } from "next";
import "./signup.css";

export const metadata: Metadata = {
  title: "Welcome to Sentinel",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    <main className="signup-page">
      <section className="signup-content" aria-labelledby="signup-heading">
        <BrandLogo size={32} />
        <h1 id="signup-heading">Connect your wallet</h1>
        <p className="signup-description">Choose Backpack, Phantom, or Coinbase to continue.</p>
        <WalletConnect redirectTo="/dashboard" variant="signup" />
      </section>
    </main>
  );
}
