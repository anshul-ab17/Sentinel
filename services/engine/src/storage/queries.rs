// SQL statements used by finalized block persistence.

pub(super) const CHECKPOINT_STAGE: &str = r#"
INSERT INTO provider_checkpoints(cluster,
    provider,
    stage,
    slot) VALUES($1,
    'http-blocks',
    $2,
    $3::numeric) ON CONFLICT(cluster,
    provider,
    stage) DO UPDATE SET slot=GREATEST(provider_checkpoints.slot,
    excluded.slot),
    updated_at=now()
"#;

pub(super) const INSERT_OBSERVATION: &str = r#"
INSERT INTO chain_observations(id,
    cluster,
    signature,
    slot,
    block_hash,
    provider,
    commitment,
    raw) VALUES($1,
    $2,
    $3,
    $4::numeric,
    $5,
    'http-blocks',
    'finalized',
    $6)
ON CONFLICT DO NOTHING
"#;

pub(super) const UPSERT_WALLET_TRANSFER: &str = r#"
INSERT INTO wallet_transfers(
    event_id,cluster,signature,slot,transaction_index,instruction_path,
    source_wallet,recipient_wallet,lamports,block_time,observation_id
) VALUES($1,$2,$3,$4::numeric,$5,$6,$7,$8,$9::numeric,$10,$11)
ON CONFLICT(event_id) DO UPDATE
SET active=true,observation_id=excluded.observation_id,block_time=excluded.block_time
"#;

pub(super) const RECORD_UNSUPPORTED_COVERAGE: &str = r#"
INSERT INTO coverage_intervals(cluster,
    start_slot,
    end_slot,
    status,
    detail) SELECT $1,
    $2::numeric,
    $2::numeric,
    'unsupported',
    $3
WHERE NOT EXISTS(SELECT 1 FROM coverage_intervals
WHERE cluster=$1 AND start_slot=$2::numeric AND detail=$3)
"#;

pub(super) const UPSERT_CANONICAL_EVENT: &str = r#"
INSERT INTO canonical_events(event_id,
    cluster,
    pool_address,
    kind,
    slot,
    signature,
    instruction_path,
    ordinal,
    commitment,
    observation_id,
    payload,
    transaction_index) VALUES($1,
    $2,
    $3,
    $4,
    $5::numeric,
    $6,
    $7,
    $8,
    'finalized',
    $9,
    $10,
    $11)
ON CONFLICT(event_id) DO UPDATE
SET observation_id=excluded.observation_id,
    slot=excluded.slot,
    commitment='finalized',
    payload=excluded.payload,
    active=true,
    transaction_index=excluded.transaction_index
"#;

pub(super) const UPSERT_POOL_STATE: &str = r#"
INSERT INTO pools(cluster,
    address,
    base_mint,
    quote_mint,
    config_address,
    creator,
    lifecycle,
    state,
    slot) VALUES($1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    $8,
    $9::numeric)
ON CONFLICT(cluster,
    address) DO UPDATE
SET base_mint=COALESCE(excluded.base_mint,
    pools.base_mint),
    quote_mint=COALESCE(excluded.quote_mint,
    pools.quote_mint),
    config_address=COALESCE(excluded.config_address,
    pools.config_address),
    creator=COALESCE(excluded.creator,
    pools.creator),
    lifecycle=CASE WHEN excluded.lifecycle='discovered' OR (excluded.lifecycle='active_curve' AND pools.lifecycle IN ('curve_complete',
    'migration_pending',
    'migrated')) THEN pools.lifecycle ELSE excluded.lifecycle END,
    state=pools.state||excluded.state,
    slot=excluded.slot,
    updated_at=now()
WHERE pools.slot<=excluded.slot
"#;

pub(super) const INSERT_POOL_OUTBOX: &str = r#"
INSERT INTO outbox_events(topic,
    entity_id,
    payload,
    dedup_key) VALUES('pool',
    $1,
    $2,
    $3)
ON CONFLICT DO NOTHING
"#;

pub(super) const ADVANCE_FINALIZED_CHECKPOINT: &str = r#"
INSERT INTO provider_checkpoints(cluster,
    provider,
    stage,
    slot) VALUES($1,
    'http-blocks',
    $2,
    $3::numeric)
ON CONFLICT(cluster,
    provider,
    stage) DO UPDATE
SET slot=GREATEST(provider_checkpoints.slot,
    excluded.slot),
    updated_at=now()
"#;

pub(super) const ENQUEUE_POOL_ANALYSIS: &str = r#"
INSERT INTO processing_jobs(id,
    kind,
    dedup_key,
    payload) VALUES(gen_random_uuid(),
    'analysis',
    $1,
    $2)
ON CONFLICT DO NOTHING
"#;
