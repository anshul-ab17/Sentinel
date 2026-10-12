"use client";

import { useState } from "react";

type WalletProvider = {
  publicKey?: { toString(): string } | null;
  connect: () => Promise<{ publicKey?: { toString(): string } }>;
};

declare global {
  interface Window {
    solana?: WalletProvider;
  }
}

export function WalletConnect({ label = "Connect" }: { label?: string }) {
  const [address, setAddress] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [walletAvailable, setWalletAvailable] = useState(false);

  async function connect() {
    setWalletAvailable(Boolean(window.solana));
    if (!window.solana) {
      setMessage("Install a Solana wallet to connect.");
      return;
    }
    setConnecting(true);
    setMessage("");
    try {
      const wallet = await window.solana.connect();
      setAddress(wallet.publicKey?.toString() ?? window.solana.publicKey?.toString() ?? null);
    } catch {
      setMessage("Wallet connection was cancelled.");
    } finally {
      setConnecting(false);
    }
  }

  return <div className="wallet-connect-wrap">
    <button type="button" className="wallet-connect" onClick={connect} disabled={connecting}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 .1l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7 M14 11a5 5 0 0 0-7-.1l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7 M8 16l8-8"/></svg>
      <span>{connecting ? "Connecting" : address ? `${address.slice(0, 4)}…${address.slice(-4)}` : label}</span>
    </button>
    {message && <div className="wallet-connect-message" role="status">{message}{!walletAvailable && <> <a href="https://phantom.app/download" target="_blank" rel="noreferrer">Get Phantom</a></>}</div>}
  </div>;
}
