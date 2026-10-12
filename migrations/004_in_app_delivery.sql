CREATE TABLE worker_checkpoints (name text PRIMARY KEY, cursor bigint NOT NULL DEFAULT 0);
CREATE TABLE in_app_alerts (id text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), signal_id text NOT NULL REFERENCES signals(id), incident_key text NOT NULL UNIQUE, status text NOT NULL, payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX in_app_alerts_user ON in_app_alerts(user_id,updated_at);
CREATE INDEX outbox_topic ON outbox_events(topic,id);
GRANT SELECT,INSERT,UPDATE ON worker_checkpoints,in_app_alerts TO sentinel_worker;
GRANT SELECT ON in_app_alerts,watchlists,notification_preferences TO sentinel_api,sentinel_worker;
DROP POLICY worker_outbox ON outbox_events;
CREATE POLICY worker_outbox ON outbox_events TO sentinel_worker USING (user_id IS NULL OR topic IN ('assessment','alert')) WITH CHECK (topic IN ('assessment','alert') AND user_id IS NOT NULL);
