"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [choices, setChoices] = useState<ReturnType<typeof featuredWallets>>([]);
  const unsubscribe = useRef<(() => void) | undefined>(undefined);
  const connectWrapRef = useRef<HTMLDivElement | null>(null);

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
    if (!isWalletOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!connectWrapRef.current?.contains(event.target as Node)) {
        setIsWalletOpen(false);
        setChoices([]);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsWalletOpen(false);
        setChoices([]);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isWalletOpen]);

  async function connect(wallet?: ReturnType<typeof installedWallets>[number]) {
    setMessage("");
    if (address) {
      setConnecting(true);
      try {
        await logoutWallet();
        setAddress(null);
        setIsWalletOpen(false);
        setChoices([]);
        unsubscribe.current?.();
      } catch {
        setMessage("Could not sign out. Please retry.");
      } finally {
        setConnecting(false);
      }
      return;
    }
    if (!wallet) return;

    setConnecting(true);
    try {
      const result = await authenticateWallet(wallet);
      unsubscribe.current?.();
      unsubscribe.current = result.unsubscribe;
      setAddress(result.address);
      setIsWalletOpen(false);
      setChoices([]);
      if (redirectTo) router.replace(redirectTo);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet sign-in cancelled.");
    } finally {
      setConnecting(false);
    }
  }

  function toggleWalletOptions() {
    if (address) {
      void connect();
      return;
    }
    setMessage("");
    if (isWalletOpen) {
      setIsWalletOpen(false);
      setChoices([]);
      return;
    }
    setChoices(featuredWallets(installedWallets()).slice(0, 3));
    setIsWalletOpen(true);
  }

  return (
    <div
      ref={connectWrapRef}
      className={`wallet-connect-wrap${variant === "signup" ? " wallet-connect-wrap-signup" : ""}`}
    >
      <button
        type="button"
        className="wallet-connect"
        onClick={toggleWalletOptions}
        disabled={connecting}
        aria-label={address ? "Sign out of wallet session" : label}
        aria-expanded={isWalletOpen}
        aria-controls="wallet-options"
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

      {isWalletOpen && (
        <div id="wallet-options" className="wallet-options">
          {choices.map(({ wallet, label: walletLabel, installUrl }) => (
            <WalletOption
              key={walletLabel}
              label={walletLabel}
              installUrl={installUrl}
              icon={wallet?.icon}
              connecting={connecting}
              onConnect={wallet ? () => void connect(wallet) : undefined}
            />
          ))}
          {message && (
            <p className="wallet-options-error" role="alert">
              {message}
            </p>
          )}
        </div>
      )}
      {message && !isWalletOpen && (
        <div className="wallet-connect-message" role="alert">
          {message}
        </div>
      )}
    </div>
  );
}

function WalletOption({
  label,
  installUrl,
  icon,
  connecting,
  onConnect,
}: {
  label: string;
  installUrl: string;
  icon?: string;
  connecting: boolean;
  onConnect?: () => void;
}) {
  const name = label === "Coinbase Wallet" ? "Coinbase Wallet" : label;
  const content = (
    <>
      <WalletIcon name={label} icon={icon} />
      <span>{name}</span>
    </>
  );

  if (!onConnect) {
    return (
      <a className="wallet-option" href={installUrl} target="_blank" rel="noreferrer">
        {content}
      </a>
    );
  }

  return (
    <button className="wallet-option" type="button" disabled={connecting} onClick={onConnect}>
      {content}
    </button>
  );
}

function WalletIcon({ name, icon }: { name: string; icon?: string }) {
  const provider = name.toLowerCase().split(" ")[0];

  if (icon) {
    return <img className="wallet-option-icon" src={icon} alt="" />;
  }

  if (provider === "backpack") {
    return <img className="wallet-option-icon" src="/backpack-wallet.png" alt="" />;
  }

  if (provider === "phantom") {
    return (
      <svg
        className="wallet-option-icon wallet-option-icon-phantom"
        viewBox="0 0 32 32"
        aria-hidden="true"
      >
        <path d="M6 20c0-7.2 5.1-13 12.1-13 6.4 0 10.2 4.8 10.2 10.3 0 4.4-2.6 7.3-5.5 7.3-1.5 0-2.4-.8-2.4-2.3 0-.6.2-1.2.4-1.8h-1.1c-.8 2.5-2.4 4.1-4.4 4.1-1.4 0-2.2-.9-2.2-2.3 0-.6.1-1.2.3-1.8h-1c-.9 2.4-2.4 4-4.2 4C6.8 24.5 6 22.8 6 20Z" />
      </svg>
    );
  }

  return (
    <svg
      className="wallet-option-icon wallet-option-icon-coinbase"
      viewBox="0 0 32 32"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="13" />
      <path d="M11 12h10v8H11z" />
    </svg>
  );
}
