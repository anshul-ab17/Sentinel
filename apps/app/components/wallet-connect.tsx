"use client";
import { useEffect, useRef, useState } from "react";

import { authenticateWallet, installedWallets, logoutWallet } from "./wallet-session";
export function WalletConnect({ label = "Connect" }: { label?: string }) {
  const [address, setAddress] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [choices, setChoices] = useState<ReturnType<typeof installedWallets>>([]);
  const unsubscribe = useRef<(() => void) | undefined>(undefined);
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
    if (!wallet && available.length > 1) {
      setChoices(available);
      return;
    }
    wallet ??= available[0];
    if (!wallet) {
      setMessage("Install a Wallet Standard compatible Solana wallet to sign in.");
      return;
    }
    setConnecting(true);
    setChoices([]);
    try {
      const result = await authenticateWallet(wallet);
      unsubscribe.current?.();
      unsubscribe.current = result.unsubscribe;
      setAddress(result.address);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet sign-in cancelled.");
    } finally {
      setConnecting(false);
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
      {choices.length > 0 && (
        <div className="wallet-connect-message">
          {choices.map((wallet) => (
            <button type="button" key={wallet.name} onClick={() => void connect(wallet)}>
              {wallet.name}
            </button>
          ))}
        </div>
      )}
      {message && (
        <div className="wallet-connect-message" role="status">
          {message}
        </div>
      )}
    </div>
  );
}
