pub mod domain;
mod events;
mod transaction;
pub use events::decode_anchor_event;
pub use transaction::{SystemTransfer, account_keys, decode_system_transfers, decode_transaction};

pub const PROGRAM: &str = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
pub const DECODER: &str = "anchor-dbc-0.2.1-f552f20";
// Anchor's event-CPI tag, not the event discriminator itself.
pub const EVENT_CPI: &[u8] = anchor_lang::event::EVENT_IX_TAG_LE;
#[path = "lib/primitives.rs"]
mod primitives;
pub use primitives::{digest, progress_bps};

#[cfg(test)]
#[path = "lib/tests.rs"]
mod tests;
