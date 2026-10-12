# Acceptance record

Implemented foundation follows phases A/B, with initial auth, deterministic rule
and asynchronous delivery pieces from C/E. This is not completion of all six
research phases or a production-readiness declaration.

Real devnet samples: `fixtures/recorded/dbc-{initialize,swap}.json` and full blocks.
They reference the same DBC pool. The current swap emits legacy/current events;
one canonical swap is decoded. An additional deployed event discriminator absent
from the pinned source/IDL is retained and flagged, not silently accepted.

Automated checks include official Anchor serialization, integer boundary math,
loaded keys, failed-transaction exclusion, recorded init/swap decoding, PostgreSQL
overlap replay, rollback/checkpoint behavior, nonce concurrent consumption,
origin/domain/expiry rejection, cross-user objects, private SSE filtering and
cursor resume/expiry, job lease recovery, schema integer validation, and AI outage
circuit breaking. Container and UI smoke-test outcomes are recorded after running.

Not established: continuous live-provider retention/reconnect parity at load,
provisional fork correction, deployed bytecode/source parity, full holder/funding
coverage, quote parity, destination liquidity accounting or AI quality improvements.
No provider is declared fastest and no at-scale latency target is claimed.
