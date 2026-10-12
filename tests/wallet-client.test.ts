import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, verify } from "node:crypto";

import bs58 from "bs58";

import { getWallets, authenticateWallet } from "../apps/app/components/wallet-session.ts";
test("Wallet Standard signMessage fallback verifies without an account in its output", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window"),
    previousFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "window", { value: new EventTarget(), configurable: true });
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const bytes = publicKey.export({ type: "spki", format: "der" }).subarray(-32);
  const account = {
    address: bs58.encode(bytes),
    publicKey: bytes,
    chains: ["solana:devnet" as const],
    features: ["solana:signMessage"] as const,
  };
  const wallet = {
    version: "1.0.0" as const,
    name: "Test wallet",
    icon: "data:image/svg+xml;base64,PHN2Zy8+" as const,
    chains: account.chains,
    accounts: [account],
    features: {
      "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: [account] }) },
      "solana:signMessage": {
        version: "1.0.0",
        signMessage: async ({ message }: { message: Uint8Array }) => [
          {
            signedMessage: message,
            signature: sign(null, message, privateKey),
            signatureType: "ed25519",
          },
        ],
      },
    },
  };
  const unregister = getWallets().register(wallet);
  let verified = false;
  globalThis.fetch = async (input, init) => {
    if (input === "/v1/auth/challenge")
      return Response.json({
        id: "test",
        input: {},
        message: Buffer.from("Stored sign-in challenge").toString("base64"),
      });
    assert.equal(input, "/v1/auth/verify");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.id, "test");
    assert.ok(
      verify(
        null,
        Buffer.from(body.signedMessage, "base64"),
        publicKey,
        Buffer.from(body.signature, "base64"),
      ),
    );
    verified = true;
    return Response.json({ address: account.address });
  };
  try {
    const result = await authenticateWallet(wallet);
    assert.equal(result.address, account.address);
    assert.ok(verified);
  } finally {
    unregister();
    globalThis.fetch = previousFetch;
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
