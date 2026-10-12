import { createHash, randomBytes, randomUUID } from "node:crypto";

import bs58 from "bs58";
import { createSignInMessage, verifySignIn } from "@solana/wallet-standard-util";

import { transaction, type Database } from "../../../packages/database/store.ts";

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { RuntimeConfig } from "../../../packages/config/runtime.ts";

export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const cookie = (request: FastifyRequest, name: string) =>
  request.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(name + "="))
    ?.slice(name.length + 1);
export const cookieValue = (name: string, value: string, seconds: number, config: RuntimeConfig) =>
  `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${config.secureCookies ? "; Secure" : ""}`;
export async function userFor(db: Database, request: FastifyRequest): Promise<string | null> {
  const token = cookie(request, "sentinel_session");
  if (!token) return null;
  return (
    (
      await db.query("SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>now()", [
        hash(token),
      ])
    ).rows[0]?.user_id ?? null
  );
}
export function originGuard(config: RuntimeConfig, request: FastifyRequest, reply: FastifyReply) {
  if (request.headers.origin !== config.origin)
    return reply.code(403).send({ error: "origin_rejected" });
}
export function registerAuth(app: FastifyInstance, db: Database, config: RuntimeConfig) {
  const mutation = {
    preHandler: async (request: FastifyRequest, reply: FastifyReply) =>
      originGuard(config, request, reply),
  };
  app.post<{ Body: { address: string } }>(
    "/v1/auth/challenge",
    {
      ...mutation,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["address"],
          properties: { address: { type: "string", minLength: 32, maxLength: 44 } },
        },
      },
    },
    async (request, reply) => {
      const address = request.body.address;
      try {
        if (bs58.decode(address).length !== 32) throw new Error();
      } catch {
        return reply.code(400).send({ error: "invalid_wallet" });
      }
      const id = randomUUID(),
        flow = randomBytes(32).toString("base64url"),
        issuedAt = new Date().toISOString(),
        expirationTime = new Date(Date.now() + 300000).toISOString();
      const input = {
        domain: config.domain,
        address,
        statement: "Sign in to Sentinel. No transaction will be submitted.",
        uri: config.origin,
        version: "1",
        chainId: config.cluster === "mainnet-beta" ? "mainnet" : config.cluster,
        nonce: randomBytes(24).toString("hex"),
        issuedAt,
        expirationTime,
        requestId: id,
      };
      await db.query(
        "INSERT INTO auth_challenges(id,flow_hash,input,expires_at) VALUES($1,$2,$3,$4)",
        [id, hash(flow), input, expirationTime],
      );
      reply.header("Set-Cookie", cookieValue("sentinel_flow", flow, 300, config));
      return { id, input, message: Buffer.from(createSignInMessage(input)).toString("base64") };
    },
  );
  app.post<{ Body: { id: string; signedMessage: string; signature: string } }>(
    "/v1/auth/verify",
    {
      ...mutation,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["id", "signedMessage", "signature"],
          properties: {
            id: { type: "string", format: "uuid" },
            signedMessage: { type: "string", maxLength: 4096 },
            signature: { type: "string", maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      const flow = cookie(request, "sentinel_flow");
      if (!flow) return reply.code(401).send({ error: "challenge_invalid" });
      const result = await transaction(db, async (client) => {
        const challenge = (
          await client.query(
            "SELECT * FROM auth_challenges WHERE id=$1 AND flow_hash=$2 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",
            [request.body.id, hash(flow)],
          )
        ).rows[0];
        if (!challenge) return null;
        const signedMessage = Buffer.from(request.body.signedMessage, "base64"),
          signature = Buffer.from(request.body.signature, "base64");
        const publicKey = bs58.decode(challenge.input.address);
        const expected = createSignInMessage(challenge.input);
        if (
          !signedMessage.equals(Buffer.from(expected)) ||
          signature.length !== 64 ||
          !verifySignIn(challenge.input, {
            account: {
              address: challenge.input.address,
              publicKey,
              chains: [`solana:${config.cluster}`],
              features: ["solana:signIn"],
            },
            signedMessage,
            signature,
          })
        )
          return null;
        await client.query("UPDATE auth_challenges SET consumed_at=now() WHERE id=$1", [
          challenge.id,
        ]);
        let user = (
          await client.query("SELECT user_id FROM wallets WHERE address=$1", [
            challenge.input.address,
          ])
        ).rows[0]?.user_id;
        if (!user) {
          // Serialize first sign-in of the same wallet across concurrent browser flows.
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            challenge.input.address,
          ]);
          user = (
            await client.query("SELECT user_id FROM wallets WHERE address=$1", [
              challenge.input.address,
            ])
          ).rows[0]?.user_id;
          if (!user) {
            user = randomUUID();
            await client.query("INSERT INTO users(id) VALUES($1)", [user]);
            await client.query("INSERT INTO wallets(address,user_id) VALUES($1,$2)", [
              challenge.input.address,
              user,
            ]);
          }
        }
        const previous = cookie(request, "sentinel_session");
        if (previous)
          await client.query("DELETE FROM sessions WHERE token_hash=$1", [hash(previous)]);
        const token = randomBytes(32).toString("base64url");
        await client.query(
          "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
          [hash(token), user],
        );
        return { token, user, address: challenge.input.address };
      });
      if (!result) return reply.code(401).send({ error: "challenge_invalid" });
      reply.header("Set-Cookie", [
        cookieValue("sentinel_session", result.token, 604800, config),
        cookieValue("sentinel_flow", "", 0, config),
      ]);
      return { user_id: result.user, address: result.address };
    },
  );
  app.get("/v1/me", async (request, reply) => {
    const user = await userFor(db, request);
    if (!user) return reply.code(401).send({ error: "authentication_required" });
    return {
      user_id: user,
      wallets: (await db.query("SELECT address FROM wallets WHERE user_id=$1", [user])).rows,
    };
  });
  app.post("/v1/auth/logout", mutation, async (request, reply) => {
    const token = cookie(request, "sentinel_session");
    if (token) await db.query("DELETE FROM sessions WHERE token_hash=$1", [hash(token)]);
    reply.header("Set-Cookie", cookieValue("sentinel_session", "", 0, config));
    return { ok: true };
  });
}
