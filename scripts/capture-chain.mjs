import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

import bs58 from "bs58";
const url = process.env.SOLANA_HTTP_URL ?? "https://api.mainnet-beta.solana.com";
const idl = JSON.parse(
  await readFile(new URL("../backend/protocol/dbc-idl.json", import.meta.url), "utf8"),
);
const names = new Map(
  idl.events.map((e) => [Buffer.from(e.discriminator).toString("hex"), e.name]),
);
async function call(method, params) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`RPC status ${response.status}`);
  const text = await response.text();
  const body = JSON.parse(text);
  if (body.error) throw new Error(`RPC ${method} rejected`);
  return { result: body.result, text };
}
const genesis = (await call("getGenesisHash", [])).result;
const signatures = (
  await call("getSignaturesForAddress", [idl.address, { commitment: "finalized", limit: 20 }])
).result;
const directory = new URL("../fixtures/recorded/", import.meta.url);
await mkdir(directory, { recursive: true });
const captured = new Set();
for (const row of signatures) {
  if (row.err) continue;
  let result, text;
  try {
    ({ result, text } = await call("getTransaction", [
      row.signature,
      { commitment: "finalized", encoding: "json", maxSupportedTransactionVersion: 0 },
    ]));
  } catch {
    console.log("Transaction unavailable; preserving capture boundary");
    break;
  }
  if (!result) continue;
  const variants = [];
  for (const group of result.meta?.innerInstructions ?? [])
    for (const ix of group.instructions) {
      if (!ix.data) continue;
      const bytes = Buffer.from(bs58.decode(ix.data));
      if (bytes.subarray(0, 8).toString("hex") === "e445a52e51cb9a1d") {
        const name = names.get(bytes.subarray(8, 16).toString("hex"));
        if (name) variants.push(name);
      }
    }
  const wanted = variants.includes("EvtInitializePool")
    ? "initialize"
    : variants.includes("EvtSwap2")
      ? "swap"
      : null;
  if (wanted && !captured.has(wanted)) {
    await writeFile(new URL(`dbc-${wanted}.json`, directory), text);
    await writeFile(
      new URL(`dbc-${wanted}.manifest.json`, directory),
      JSON.stringify(
        {
          synthetic: false,
          signature: row.signature,
          slot: String(result.slot),
          genesis_hash: genesis,
          commitment: "finalized",
          variants,
          captured_at: new Date().toISOString(),
          raw_sha256: createHash("sha256").update(text).digest("hex"),
          source: "Public Solana HTTP RPC; credential-free recorded response",
          decoder_revision: "f552f20aa3c1c7631427c3827aeea7c58b902813",
        },
        null,
        2,
      ),
    );
    console.log("Captured", wanted, row.signature);
    captured.add(wanted);
  }
  if (captured.size === 2) break;
  await new Promise((resolve) => setTimeout(resolve, 1500));
}
console.log("Captured kinds:", [...captured].join(", "));
