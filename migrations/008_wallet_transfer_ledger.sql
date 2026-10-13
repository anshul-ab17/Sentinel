CREATE TABLE wallet_transfers (
    event_id text PRIMARY KEY,
    cluster text NOT NULL,
    signature text NOT NULL,
    slot numeric(20,0) NOT NULL,
    transaction_index integer NOT NULL,
    instruction_path jsonb NOT NULL,
    source_wallet text NOT NULL,
    recipient_wallet text NOT NULL,
    lamports numeric(20,0) NOT NULL CHECK (lamports > 0),
    block_time bigint,
    observation_id text NOT NULL REFERENCES chain_observations(id),
    active boolean NOT NULL DEFAULT true,
    UNIQUE (cluster, signature, instruction_path)
);

CREATE INDEX wallet_transfers_source_order
    ON wallet_transfers(cluster, source_wallet, slot DESC, transaction_index DESC);
CREATE INDEX wallet_transfers_recipient_order
    ON wallet_transfers(cluster, recipient_wallet, slot DESC, transaction_index DESC);

GRANT SELECT ON wallet_transfers TO sentinel_api, sentinel_worker;
GRANT SELECT, INSERT, UPDATE ON wallet_transfers TO sentinel_engine;
