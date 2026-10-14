import { BrandLogo } from "@app/components/brand-logo";
import { WalletConnect } from "@app/components/wallet-connect";

import type { Metadata } from "next";
import "./signup.css";

export const metadata: Metadata = {
  title: "Welcome to Sentinel",
  robots: { index: false, follow: false },
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Only accept same-origin paths so a crafted `next` value cannot redirect off-site.
  const redirectTo = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  return (
    <main className="signup-page">
      <section className="signup-content" aria-labelledby="signup-heading">
        <BrandLogo size={32} />
        <h1 id="signup-heading">Connect your wallet</h1>
        <p className="signup-description">Choose your wallet to continue.</p>
        <WalletConnect redirectTo={redirectTo} variant="signup" />
      </section>
    </main>
  );
}
