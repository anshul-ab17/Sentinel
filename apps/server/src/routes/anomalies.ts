import { metadata } from "../repository.ts";
import { originGuard, userFor } from "../auth.ts";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { RuntimeConfig } from "../../../../packages/config/runtime.ts";
import type { Database } from "../../../../packages/database/store.ts";

const supportedRules = [
  {
    id: "early-buyer-concentration",
    version: "0.1.0",
    title: "Early buyer concentration",
    severity: "high",
    description: "Measures observed early quote volume held by the top three attributed buyers.",
    limitations: ["Volume share is not token ownership or proof of common control"],
  },
  {
    id: "shared-funding",
    version: "0.1.0",
    title: "Shared observed funder",
    severity: "medium",
    description: "Finds multiple observed early buyers funded by one source before buying.",
    limitations: ["Exchange and service funding can create benign shared sources"],
  },
  {
    id: "large-transfer",
    version: "0.1.0",
    title: "Large SOL transfer",
    severity: "medium",
    description: "Flags a covered transfer at or above the configured raw lamport threshold.",
    limitations: ["Transfer intent and recipient ownership are unknown"],
  },
] as const;

const signalParams = {
  type: "object",
  required: ["signalId"],
  properties: { signalId: { type: "string", minLength: 1, maxLength: 128 } },
};
const listQuery = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["active", "retracted", "acknowledged", "resolved"] },
    severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
    ruleId: { type: "string", maxLength: 80 },
    poolId: { type: "string", maxLength: 128 },
    cursor: { type: "string", maxLength: 128 },
    limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
  },
};

export function registerAnomalyRoutes(app: FastifyInstance, db: Database, config: RuntimeConfig) {
  const cluster = config.mode === "fixture" ? "fixture" : config.cluster;
  const envelope = async (data: unknown) => ({ ...(await metadata(db, config)), data });
  const privateGuard = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!["GET", "HEAD"].includes(request.method) && originGuard(config, request, reply)) return;
    if (!(await userFor(db, request)))
      return reply.code(401).send({ error: "authentication_required" });
  };

  app.get<{
    Querystring: {
      status?: "active" | "retracted" | "acknowledged" | "resolved";
      severity?: string;
      ruleId?: string;
      poolId?: string;
      cursor?: string;
      limit?: number;
    };
  }>("/v1/anomalies", { schema: { querystring: listQuery } }, async (request) => {
    const viewer = await userFor(db, request);
    const { status, severity, ruleId, poolId, cursor, limit = 25 } = request.query;
    const rows = (
      await db.query(
        `SELECT s.id,s.pool_address,s.rule_id,s.rule_version,s.severity,s.status,
                  s.payload,s.updated_at,a.status AS acknowledgement
             FROM signals s
             LEFT JOIN signal_acknowledgements a
               ON a.signal_id=s.id AND a.user_id=$2::uuid
            WHERE s.cluster=$1
              AND ($3::text IS NULL OR s.status=$3 OR a.status=$3)
              AND ($4::text IS NULL OR s.severity=$4)
              AND ($5::text IS NULL OR s.rule_id=$5)
              AND ($6::text IS NULL OR s.pool_address=$6)
              AND ($7::text IS NULL OR (s.updated_at,s.id) <
                (SELECT updated_at,id FROM signals WHERE cluster=$1 AND id=$7))
            ORDER BY s.updated_at DESC,s.id DESC LIMIT $8`,
        [
          cluster,
          viewer,
          status ?? null,
          severity ?? null,
          ruleId ?? null,
          poolId ?? null,
          cursor ?? null,
          limit + 1,
        ],
      )
    ).rows;
    return envelope({
      items: rows.slice(0, limit).map((row) => ({
        id: row.id,
        pool_id: row.pool_address,
        rule_id: row.rule_id,
        rule_version: row.rule_version,
        severity: row.severity,
        status: row.status,
        acknowledgement: row.acknowledgement ?? "open",
        first_seen: row.payload.timestamp ?? null,
        last_seen_at: row.updated_at,
        evidence_count: Array.isArray(row.payload.evidence) ? row.payload.evidence.length : 0,
        finding: row.payload,
      })),
      next_cursor: rows.length > limit ? rows[limit - 1].id : null,
    });
  });

  app.get("/v1/anomalies/rules", async () => envelope(supportedRules));

  app.get<{ Querystring: { window?: string } }>(
    "/v1/anomalies/summary",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: { window: { type: "string", enum: ["24h", "7d", "30d"], default: "24h" } },
        },
      },
    },
    async (request) => {
      const window = request.query.window ?? "24h";
      const interval = window === "7d" ? "7 days" : window === "30d" ? "30 days" : "24 hours";
      const result = await db.query(
        `SELECT rule_id,severity,status,count(*)::integer AS count
           FROM signals WHERE cluster=$1 AND updated_at >= now() - $2::interval
           GROUP BY rule_id,severity,status ORDER BY rule_id,severity,status`,
        [cluster, interval],
      );
      return envelope({
        window,
        findings: result.rows,
        active_count: result.rows
          .filter((row) => row.status === "active")
          .reduce((total, row) => total + row.count, 0),
        rule_count: supportedRules.length,
        rules: supportedRules.map((rule) => rule.id),
        limitations: ["Counts cover persisted deterministic findings in the configured cluster"],
      });
    },
  );

  app.get<{ Params: { signalId: string } }>(
    "/v1/anomalies/:signalId",
    { schema: { params: signalParams } },
    async (request, reply) => {
      const signal = (
        await db.query(
          "SELECT id,pool_address,rule_id,rule_version,severity,status,payload,updated_at FROM signals WHERE cluster=$1 AND id=$2",
          [cluster, request.params.signalId],
        )
      ).rows[0];
      return signal ? envelope(signal) : reply.code(404).send({ error: "finding_not_found" });
    },
  );

  app.get<{ Params: { signalId: string } }>(
    "/v1/anomalies/:signalId/evidence",
    { schema: { params: signalParams } },
    async (request, reply) => {
      const finding = (
        await db.query("SELECT payload FROM signals WHERE cluster=$1 AND id=$2", [
          cluster,
          request.params.signalId,
        ])
      ).rows[0];
      if (!finding) return reply.code(404).send({ error: "finding_not_found" });
      const ids: string[] = Array.isArray(finding.payload.evidence)
        ? finding.payload.evidence.filter((id: unknown): id is string => typeof id === "string")
        : [];
      if (!ids.length) return envelope({ signal_id: request.params.signalId, items: [] });
      const evidence = await db.query(
        `SELECT event_id,pool_address,kind,slot,signature,instruction_path,payload,
                provider,block_hash,received_at
           FROM (
             SELECT e.event_id,e.pool_address,e.kind,e.slot::text AS slot,e.slot AS order_slot,
                    e.signature,e.instruction_path,e.payload,o.provider,o.block_hash,o.received_at
               FROM canonical_events e
               JOIN chain_observations o ON o.id=e.observation_id
              WHERE e.cluster=$1 AND e.event_id=ANY($2::text[])
             UNION ALL
             SELECT t.event_id,NULL::text,'native_sol_transfer',t.slot::text,t.slot,
                    t.signature,t.instruction_path,
                    jsonb_build_object('event_id',t.event_id,'source',t.source_wallet,
                      'recipient',t.recipient_wallet,'lamports',t.lamports::text,
                      'block_time',t.block_time),
                    o.provider,o.block_hash,o.received_at
               FROM wallet_transfers t
               JOIN chain_observations o ON o.id=t.observation_id
              WHERE t.cluster=$1 AND t.event_id=ANY($2::text[]) AND t.active
           ) AS evidence_rows
          ORDER BY order_slot,event_id`,
        [cluster, ids],
      );
      return envelope({ signal_id: request.params.signalId, items: evidence.rows });
    },
  );

  app.patch<{
    Params: { signalId: string };
    Body: { status: "acknowledged" | "resolved"; note?: string };
  }>(
    "/v1/me/anomalies/:signalId/acknowledgement",
    {
      preHandler: privateGuard,
      schema: {
        params: signalParams,
        body: {
          type: "object",
          required: ["status"],
          additionalProperties: false,
          properties: {
            status: { type: "string", enum: ["acknowledged", "resolved"] },
            note: { type: "string", maxLength: 2000 },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await db.query(
        `INSERT INTO signal_acknowledgements(user_id,signal_id,status,note)
         SELECT $1,$2,$3,$4 WHERE EXISTS
           (SELECT 1 FROM signals WHERE cluster=$5 AND id=$2)
         ON CONFLICT(user_id,signal_id) DO UPDATE
           SET status=excluded.status,note=excluded.note,updated_at=now()
         RETURNING signal_id,status,note,updated_at`,
        [
          await userFor(db, request),
          request.params.signalId,
          request.body.status,
          request.body.note ?? "",
          cluster,
        ],
      );
      return result.rows[0]
        ? envelope(result.rows[0])
        : reply.code(404).send({ error: "finding_not_found" });
    },
  );

  app.get("/v1/me/alert-rules", { preHandler: privateGuard }, async (request) => {
    const rows = (
      await db.query(
        "SELECT rule_id,enabled,minimum_severity,cooldown_seconds,settings,updated_at FROM alert_rule_preferences WHERE user_id=$1 ORDER BY rule_id",
        [await userFor(db, request)],
      )
    ).rows;
    const configured = new Map(rows.map((row) => [row.rule_id, row]));
    return envelope(
      supportedRules.map((rule) => ({
        ...rule,
        enabled: configured.get(rule.id)?.enabled ?? true,
        minimum_severity: configured.get(rule.id)?.minimum_severity ?? "low",
        cooldown_seconds: configured.get(rule.id)?.cooldown_seconds ?? 300,
        settings: configured.get(rule.id)?.settings ?? {},
      })),
    );
  });

  app.put<{
    Params: { ruleId: string };
    Body: {
      enabled: boolean;
      minimum_severity: "low" | "medium" | "high" | "critical";
      cooldown_seconds: number;
    };
  }>(
    "/v1/me/alert-rules/:ruleId",
    {
      preHandler: privateGuard,
      schema: {
        params: {
          type: "object",
          required: ["ruleId"],
          properties: { ruleId: { type: "string", maxLength: 80 } },
        },
        body: {
          type: "object",
          required: ["enabled", "minimum_severity", "cooldown_seconds"],
          additionalProperties: false,
          properties: {
            enabled: { type: "boolean" },
            minimum_severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
            cooldown_seconds: { type: "integer", minimum: 0, maximum: 604800 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!supportedRules.some((rule) => rule.id === request.params.ruleId))
        return reply.code(404).send({ error: "rule_not_found" });
      const row = (
        await db.query(
          `INSERT INTO alert_rule_preferences(user_id,rule_id,enabled,minimum_severity,cooldown_seconds)
           VALUES($1,$2,$3,$4,$5)
           ON CONFLICT(user_id,rule_id) DO UPDATE SET enabled=excluded.enabled,
             minimum_severity=excluded.minimum_severity,cooldown_seconds=excluded.cooldown_seconds,
             updated_at=now()
           RETURNING rule_id,enabled,minimum_severity,cooldown_seconds,settings,updated_at`,
          [
            await userFor(db, request),
            request.params.ruleId,
            request.body.enabled,
            request.body.minimum_severity,
            request.body.cooldown_seconds,
          ],
        )
      ).rows[0];
      return envelope(row);
    },
  );
}
