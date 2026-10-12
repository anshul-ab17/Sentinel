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
        <h1 id="signup-heading">
          Welcome to Sentinel<span>Your investigation workspace</span>
        </h1>
        <button
          className="signup-google"
          type="button"
          disabled
          aria-label="Continue with Google, coming soon"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M21.8 12.2c0-.7-.1-1.4-.2-2.2H12v4.2h5.5a4.8 4.8 0 0 1-2 3.1v2.6h3.4c2-1.8 2.9-4.4 2.9-7.7ZM12 22c2.8 0 5.1-.9 6.9-2.5l-3.4-2.6c-.9.6-2.1.9-3.5.9-2.7 0-5-1.8-5.8-4.2H2.7v2.7A10 10 0 0 0 12 22ZM6.2 13.6a6 6 0 0 1 0-3.2V7.7H2.7a10 10 0 0 0 0 8.6l3.5-2.7ZM12 6.2c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.5 9.5 0 0 0 12 2a10 10 0 0 0-9.3 5.7l3.5 2.7C7 8 9.3 6.2 12 6.2Z" />
          </svg>
          Continue with Google
        </button>
        <div className="signup-divider">
          <span>OR</span>
        </div>
        <WalletConnect label="Connect wallet" />
      </section>
    </main>
  );
}
