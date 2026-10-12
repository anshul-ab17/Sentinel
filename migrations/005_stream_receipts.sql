ALTER TABLE chain_observations ALTER COLUMN block_hash DROP NOT NULL;
DROP POLICY engine_analysis_jobs ON processing_jobs;
CREATE POLICY engine_processing_jobs ON processing_jobs TO sentinel_engine USING (kind IN ('analysis','hydrate')) WITH CHECK (kind IN ('analysis','hydrate'));
