CREATE TABLE signal_acknowledgements (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    signal_id text NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
    status text NOT NULL CHECK (status IN ('acknowledged','resolved')),
    note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 2000),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, signal_id)
);
CREATE INDEX signal_acknowledgements_user_updated
    ON signal_acknowledgements(user_id, updated_at DESC);

CREATE TABLE alert_rule_preferences (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rule_id text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    minimum_severity text NOT NULL DEFAULT 'low'
        CHECK (minimum_severity IN ('low','medium','high','critical')),
    cooldown_seconds integer NOT NULL DEFAULT 300
        CHECK (cooldown_seconds BETWEEN 0 AND 604800),
    settings jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(settings) = 'object'),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, rule_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE
    ON signal_acknowledgements, alert_rule_preferences TO sentinel_api;
GRANT SELECT ON alert_rule_preferences TO sentinel_worker;
