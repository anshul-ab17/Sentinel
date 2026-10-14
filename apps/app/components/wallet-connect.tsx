"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { BrandLogo } from "@app/components/brand-logo";

import {
  authenticateWallet,
  featuredWallets,
  installedWallets,
  logoutWallet,
} from "./wallet-session";
export function WalletConnect({
  label = "Connect wallet",
  redirectTo,
  variant = "default",
}: {
  label?: string;
  redirectTo?: string;
  variant?: "default" | "signup";
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
    <div
      className={`wallet-connect-wrap${variant === "signup" ? " wallet-connect-wrap-signup" : ""}`}
    >
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
                <span className="wallet-picker-handle" aria-hidden="true" />
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
                <BrandLogo size={30} />
                <h2 id="wallet-picker-title">Connect a wallet</h2>
                <p>
                  Choose your preferred wallet to continue
                  <br />
                  with Sentinel.
                </p>
              </div>
              <div className="wallet-picker-options">
                {choices.map(({ wallet, label: walletLabel, installUrl }, index) => (
                  <div className="wallet-picker-option-wrap" key={walletLabel}>
                    {index === 3 && <p className="wallet-picker-more">More options</p>}
                    {wallet ? (
                      <button
                        type="button"
                        className="wallet-picker-option"
                        disabled={connecting}
                        onClick={() => void connect(wallet)}
                      >
                        <WalletProviderIcon name={walletLabel} />
                        <span className="wallet-picker-option-copy">
                          <span className="wallet-picker-name">{walletLabel}</span>
                          <span className="wallet-picker-state">
                            {connectingWallet === wallet.name
                              ? "Connecting?"
                              : `Connect using ${walletLabel}`}
                          </span>
                        </span>
                        <WalletChevron />
                      </button>
                    ) : (
                      <a
                        className="wallet-picker-option"
                        href={installUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <WalletProviderIcon name={walletLabel} />
                        <span className="wallet-picker-option-copy">
                          <span className="wallet-picker-name">{walletLabel}</span>
                          <span className="wallet-picker-state">Connect using {walletLabel}</span>
                        </span>
                        <WalletChevron />
                      </a>
                    )}
                  </div>
                ))}
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

function WalletChevron() {
  return (
    <svg className="wallet-picker-arrow" viewBox="0 0 20 20" aria-hidden="true">
      <path d="m7 4 6 6-6 6" />
    </svg>
  );
}

function WalletProviderIcon({ name }: { name: string }) {
  const provider = name.toLowerCase().split(" ")[0];

  return (
    <span className={`wallet-picker-icon wallet-picker-icon-${provider}`} aria-hidden="true">
      {provider === "phantom" && (
        <svg viewBox="0 0 32 32">
          <path d="M6 20c0-7.2 5.1-13 12.1-13 6.4 0 10.2 4.8 10.2 10.3 0 4.4-2.6 7.3-5.5 7.3-1.5 0-2.4-.8-2.4-2.3 0-.6.2-1.2.4-1.8h-1.1c-.8 2.5-2.4 4.1-4.4 4.1-1.4 0-2.2-.9-2.2-2.3 0-.6.1-1.2.3-1.8h-1c-.9 2.4-2.4 4-4.2 4C6.8 24.5 6 22.8 6 20Z" />
        </svg>
      )}
      {provider === "backpack" && (
        <svg viewBox="0 0 32 32">
          <path d="M9 11V8a7 7 0 0 1 14 0v3h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V13a2 2 0 0 1 2-2h2Zm3 0h8V8a4 4 0 0 0-8 0v3Zm-2 7v6h12v-6H10Zm3-2h6v2h-6v-2Z" />
        </svg>
      )}
      {provider === "coinbase" && (
        <svg viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="13" />
          <path className="wallet-provider-cutout" d="M11 12h10v8H11z" />
        </svg>
      )}
      {provider === "solflare" && (
        <svg viewBox="0 0 32 32">
          <path d="m16 2 3.1 9.1L28 6l-5.1 8.9L32 18l-9.1 3.1L28 30l-8.9-5.1L16 34l-3.1-9.1L4 30l5.1-8.9L0 18l9.1-3.1L4 6l8.9 5.1L16 2Z" />
        </svg>
      )}
      {provider === "torus" && (
        <svg viewBox="0 0 32 32">
          <path d="M4 6h24v7H19v15h-7V13H4z" />
          <circle cx="25" cy="24" r="4" />
        </svg>
      )}
      {provider === "ledger" && (
        <svg viewBox="0 0 32 32">
          <path d="M4 13V5h8M20 5h8v8M28 19v8h-8M12 27H4v-8" />
        </svg>
      )}
    </span>
  );
}
