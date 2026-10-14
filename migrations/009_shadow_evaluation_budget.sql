CREATE TABLE ai_shadow_budget_usage (
    usage_day date PRIMARY KEY,
    requests_reserved integer NOT NULL DEFAULT 0 CHECK (requests_reserved >= 0),
    input_tokens bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_shadow_evaluations (
    id bigserial PRIMARY KEY,
    processing_job_id uuid NOT NULL UNIQUE REFERENCES processing_jobs(id) ON DELETE CASCADE,
    investigation_id uuid REFERENCES investigations(id) ON DELETE SET NULL,
    cluster text NOT NULL,
    pool_address text NOT NULL,
    cache_key text NOT NULL REFERENCES ai_assessments(cache_key),
    model text NOT NULL,
    status text NOT NULL,
    classification text,
    signal_ids jsonb NOT NULL CHECK (jsonb_typeof(signal_ids) = 'array'),
    evidence_ids jsonb NOT NULL CHECK (jsonb_typeof(evidence_ids) = 'array'),
    result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
    input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_shadow_evaluations_pool_time
    ON ai_shadow_evaluations(cluster, pool_address, created_at DESC);

ALTER TABLE ai_shadow_budget_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_shadow_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY worker_shadow_budget ON ai_shadow_budget_usage TO sentinel_worker
    USING (true) WITH CHECK (true);
CREATE POLICY worker_shadow_evaluations ON ai_shadow_evaluations TO sentinel_worker
    USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON ai_shadow_budget_usage TO sentinel_worker;
GRANT SELECT, INSERT ON ai_shadow_evaluations TO sentinel_worker;
GRANT USAGE, SELECT ON SEQUENCE ai_shadow_evaluations_id_seq TO sentinel_worker;
