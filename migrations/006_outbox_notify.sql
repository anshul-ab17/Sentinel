CREATE OR REPLACE FUNCTION notify_sentinel_outbox_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM pg_notify('sentinel_outbox', NEW.id::text);
    RETURN NEW;
END;
$$;

CREATE TRIGGER outbox_events_notify_sentinel
AFTER INSERT ON outbox_events
FOR EACH ROW
EXECUTE FUNCTION notify_sentinel_outbox_event();
