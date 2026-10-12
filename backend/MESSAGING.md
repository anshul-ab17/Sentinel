# ADR 002: durable jobs now; broker decision based on measured needs

The DDIA principles applied here are explicit delivery semantics, atomic writes,
idempotent consumers, replayable logs, bounded memory, ordering by entity rather
than receipt time, and recoverability after partial failure.

Initial decision: PostgreSQL transaction + jobs/outbox. Evidence and its pending
work commit together. Workers claim with SKIP LOCKED, carry a fenced lease token,
retry with backoff and acknowledge only after their result commits. A crash after
commit is handled by the idempotency key. This is at-least-once processing.

No Kafka requirement has been demonstrated. If measured outbox load, independent
consumer retention, or ingestion fan-out warrants a broker, prefer evaluating
NATS JetStream with persistent replicated streams, durable pull consumers,
explicit acknowledgement, bounded fetch and per-pool ordering. Core NATS alone
does not provide durable replay. The SQL outbox remains the publication boundary;
broker acknowledgement never replaces a committed evidence record.

RabbitMQ quorum queues are an alternative for routed task/notification delivery,
with publisher confirms and manual consumer acknowledgements. Re-deliveries still
require application idempotency. Classic task queues alone do not provide the same
independent historical replay model as a retained stream.

Selection gate: benchmark the same outage, backlog, replay, ordering and consumer
crash scenarios; measure p95/p99 latency, retention/cost and operational capacity.
Do not claim universal exactly-once delivery or global canonical chain ordering.

References: https://docs.nats.io/concepts/jetstream and
https://www.rabbitmq.com/docs/reliability. DDIA is used as design guidance; this
document does not quote or claim a book endorsement of a particular broker.
