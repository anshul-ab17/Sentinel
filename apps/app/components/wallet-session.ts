"use client";
import { getWallets } from "@wallet-standard/app";
export { getWallets };
type Account = { address: string; publicKey: Uint8Array };
type Signed = {
  account: Account;
  signedMessage: Uint8Array;
  signature: Uint8Array;
  signatureType?: string;
};
type Connect = { connect: () => Promise<{ accounts: readonly Account[] }> };
type SignIn = { signIn: (input: Record<string, string>) => Promise<Signed[]> };
type SignMessage = {
  signMessage: (input: {
    account: Account;
    message: Uint8Array;
  }) => Promise<Omit<Signed, "account">[]>;
};
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
export const installedWallets = () =>
  getWallets()
    .get()
    .filter(
      (wallet) =>
        wallet.features["standard:connect"] &&
        (wallet.features["solana:signIn"] || wallet.features["solana:signMessage"]),
    );
const walletProviders = [
  {
    label: "Backpack",
    matches: (name: string) => name.toLowerCase().includes("backpack"),
    installUrl: "https://backpack.app/downloads",
  },
  {
    label: "Phantom",
    matches: (name: string) => name.toLowerCase().includes("phantom"),
    installUrl: "https://phantom.app/download",
  },
  {
    label: "Coinbase Wallet",
    matches: (name: string) => name.toLowerCase().includes("coinbase"),
    installUrl: "https://www.coinbase.com/wallet/downloads",
  },
];
export const featuredWallets = (wallets = installedWallets()) => {
  return walletProviders.map((provider) => {
    const wallet = wallets.find((candidate) => provider.matches(candidate.name));
    return { wallet, label: provider.label, installUrl: provider.installUrl };
  });
};
async function api(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Wallet sign-in could not be verified.");
  return response.json();
}
export async function logoutWallet() {
  await api("/v1/auth/logout", {});
  window.dispatchEvent(new Event("sentinel-session"));
}
export async function authenticateWallet(wallet: ReturnType<typeof installedWallets>[number]) {
  const { accounts } = await (wallet.features["standard:connect"] as Connect).connect();
  const account = accounts[0];
  if (!account) throw new Error("No wallet account selected.");
  const challenge = await api("/v1/auth/challenge", { address: account.address });
  let output: Signed;
  if (wallet.features["solana:signIn"])
    [output] = await (wallet.features["solana:signIn"] as SignIn).signIn(challenge.input);
  else {
    const [signed] = await (wallet.features["solana:signMessage"] as SignMessage).signMessage({
      account,
      message: Uint8Array.from(atob(challenge.message), (c) => c.charCodeAt(0)),
    });
    if (!signed) throw new Error("Wallet did not return a signature.");
    output = { ...signed, account };
  }
  if (
    !output ||
    output.account.address !== account.address ||
    (output.signatureType && output.signatureType !== "ed25519")
  )
    throw new Error("Wallet identity changed. Sign in again.");
  await api("/v1/auth/verify", {
    id: challenge.id,
    signedMessage: base64(output.signedMessage),
    signature: base64(output.signature),
  });
  window.dispatchEvent(new Event("sentinel-session"));
  const events = wallet.features["standard:events"] as
    | {
        on?: (
          name: string,
          callback: (change: { accounts?: readonly Account[] }) => void,
        ) => () => void;
      }
    | undefined;
  const unsubscribe = events?.on?.("change", (change) => {
    if (change.accounts && change.accounts[0]?.address !== account.address)
      void logoutWallet().catch(() => {});
  });
  return { address: account.address, unsubscribe };
}
