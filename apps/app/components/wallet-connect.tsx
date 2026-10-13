"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

import {
  authenticateWallet,
  featuredWallets,
  installedWallets,
  logoutWallet,
} from "./wallet-session";
export function WalletConnect({
  label = "Connect wallet",
  redirectTo,
}: {
  label?: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [address, setAddress] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);
  const [choices, setChoices] = useState<ReturnType<typeof featuredWallets>>([]);
  const unsubscribe = useRef<(() => void) | undefined>(undefined);
  const dialogRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const refresh = () => {
      void fetch("/v1/me", { credentials: "same-origin" })
        .then(async (response) =>
          setAddress(response.ok ? ((await response.json()).wallets[0]?.address ?? null) : null),
        )
        .catch(() => setAddress(null));
    };
    refresh();
    window.addEventListener("sentinel-session", refresh);
    return () => {
      window.removeEventListener("sentinel-session", refresh);
      unsubscribe.current?.();
    };
  }, []);
  useEffect(() => {
    if (!choices.length) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !connecting) setChoices([]);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.cancelAnimationFrame(frame);
    };
  }, [choices.length, connecting]);
  async function connect(wallet?: ReturnType<typeof installedWallets>[number]) {
    setMessage("");
    if (address) {
      setConnecting(true);
      try {
        await logoutWallet();
        setAddress(null);
        unsubscribe.current?.();
      } catch {
        setMessage("Could not sign out. Please retry.");
      } finally {
        setConnecting(false);
      }
      return;
    }
    const available = installedWallets();
    const featured = featuredWallets(available);
    if (!wallet) {
      setChoices(featured);
      if (featured.length === 0)
        setMessage("Install Backpack, Phantom, or Coinbase Wallet to continue.");
      return;
    }
    setConnecting(true);
    setConnectingWallet(wallet.name);
    try {
      const result = await authenticateWallet(wallet);
      unsubscribe.current?.();
      unsubscribe.current = result.unsubscribe;
      setAddress(result.address);
      setChoices([]);
      if (redirectTo) router.replace(redirectTo);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet sign-in cancelled.");
    } finally {
      setConnecting(false);
      setConnectingWallet(null);
    }
  }
  return (
    <div className="wallet-connect-wrap">
      <button
        type="button"
        className="wallet-connect"
        onClick={() => void connect()}
        disabled={connecting}
        aria-label={address ? "Sign out of wallet session" : label}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10 13a5 5 0 0 0 7 .1l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7 M14 11a5 5 0 0 0-7-.1l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7 M8 16l8-8" />
        </svg>
        <span>
          {connecting
            ? "Signing in"
            : address
              ? `${address.slice(0, 4)}…${address.slice(-4)}`
              : label}
        </span>
      </button>
      {choices.length > 0 &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="wallet-picker-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !connecting) setChoices([]);
            }}
          >
            <section
              ref={dialogRef}
              className="wallet-picker"
              role="dialog"
              aria-modal="true"
              aria-labelledby="wallet-picker-title"
              tabIndex={-1}
            >
              <header className="wallet-picker-header">
                <div className="wallet-picker-brand" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M7.5 4.5h9l3 3v12h-15v-12l3-3Z" />
                    <path d="M8 4.5v5h8v-5M9 14h6" />
                  </svg>
                </div>
                <button
                  type="button"
                  className="wallet-picker-close"
                  aria-label="Close wallet picker"
                  disabled={connecting}
                  onClick={() => setChoices([])}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m5 5 10 10M15 5 5 15" />
                  </svg>
                </button>
              </header>
              <div className="wallet-picker-copy">
                <p className="wallet-picker-eyebrow">SENTINEL WALLET</p>
                <h2 id="wallet-picker-title">Connect a wallet</h2>
                <p>Choose a wallet to securely access your investigation workspace.</p>
              </div>
              <div className="wallet-picker-options">
                {choices.map(({ wallet, label: walletLabel, installUrl }) =>
                  wallet ? (
                    <button
                      type="button"
                      key={walletLabel}
                      disabled={connecting}
                      onClick={() => void connect(wallet)}
                    >
                      <span
                        className={`wallet-picker-icon wallet-picker-icon-${walletLabel.split(" ")[0].toLowerCase()}`}
                        aria-hidden="true"
                      >
                        {walletLabel.slice(0, 1)}
                      </span>
                      <span className="wallet-picker-name">{walletLabel}</span>
                      <span className="wallet-picker-state">
                        {connectingWallet === wallet.name ? "Connecting…" : "Detected"}
                      </span>
                      <span className="wallet-picker-arrow" aria-hidden="true">
                        ↗
                      </span>
                    </button>
                  ) : (
                    <a key={walletLabel} href={installUrl} target="_blank" rel="noreferrer">
                      <span
                        className={`wallet-picker-icon wallet-picker-icon-${walletLabel.split(" ")[0].toLowerCase()}`}
                        aria-hidden="true"
                      >
                        {walletLabel.slice(0, 1)}
                      </span>
                      <span className="wallet-picker-name">{walletLabel}</span>
                      <span className="wallet-picker-state">Install</span>
                      <span className="wallet-picker-arrow" aria-hidden="true">
                        ↗
                      </span>
                    </a>
                  ),
                )}
              </div>
              {message && (
                <p className="wallet-picker-error" role="alert">
                  {message}
                </p>
              )}
              <footer className="wallet-picker-footer">
                <span className="wallet-picker-secure-mark" aria-hidden="true">
                  ✓
                </span>
                <span>Secure connection. No transaction will be submitted.</span>
              </footer>
            </section>
          </div>,
          document.body,
        )}
      {message && choices.length === 0 && (
        <div className="wallet-connect-message" role="status">
          {message}
        </div>
      )}
    </div>
  );
}
