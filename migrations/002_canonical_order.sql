ALTER TABLE canonical_events ADD COLUMN transaction_index integer NOT NULL DEFAULT 0;
CREATE INDEX canonical_order ON canonical_events(cluster,pool_address,slot,transaction_index,instruction_path,ordinal);
