use sha2::{Digest, Sha256};
pub mod domain;
mod events;
mod transaction;
pub use events::decode_anchor_event;
pub use transaction::{SystemTransfer, account_keys, decode_system_transfers, decode_transaction};

pub const PROGRAM: &str = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
pub const DECODER: &str = "anchor-dbc-0.2.1-f552f20";
// Anchor's event-CPI tag, not the event discriminator itself.
pub const EVENT_CPI: &[u8] = anchor_lang::event::EVENT_IX_TAG_LE;
pub fn digest(value: impl AsRef<[u8]>) -> String {
    format!("{:x}", Sha256::digest(value.as_ref()))
}

pub fn progress_bps(reserve: u64, threshold: u64) -> Option<u64> {
    if threshold == 0 {
        None
    } else {
        Some(((reserve as u128 * 10000) / threshold as u128).min(10000) as u64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::{AnchorSerialize, Discriminator, prelude::Pubkey};
    use dynamic_bonding_curve::event::EvtInitializePool;
    use serde_json::{Value, json};
    #[test]
    fn official_anchor_initialize_roundtrip() {
        let event = EvtInitializePool {
            pool: Pubkey::new_from_array([1; 32]),
            config: Pubkey::new_from_array([2; 32]),
            creator: Pubkey::new_from_array([3; 32]),
            base_mint: Pubkey::new_from_array([4; 32]),
            pool_type: 0,
            activation_point: u64::MAX,
        };
        let mut bytes = EvtInitializePool::DISCRIMINATOR.to_vec();
        event.serialize(&mut bytes).unwrap();
        let parsed = decode_anchor_event(&bytes).unwrap().unwrap();
        assert_eq!(parsed["activation_point"], u64::MAX.to_string());
        assert!(decode_anchor_event(&bytes[..bytes.len() - 1]).is_err());
        bytes.push(0);
        assert!(decode_anchor_event(&bytes).is_err());
    }
    #[test]
    fn progress_exact_without_float_or_overflow() {
        assert_eq!(progress_bps(u64::MAX, u64::MAX), Some(10000));
        assert_eq!(progress_bps(1, 3), Some(3333));
        assert_eq!(progress_bps(3, 1), Some(10000));
        assert_eq!(progress_bps(1, 0), None);
    }
    #[test]
    fn failed_swaps_never_change_volume() {
        assert!(
            decode_transaction(&json!({"meta":{"err":{"InstructionError":[0,"Custom"]}}}))
                .unwrap()
                .0
                .is_empty()
        );
    }
    #[test]
    fn loaded_addresses_are_resolved_in_runtime_order() {
        let keys = account_keys(
            &json!({"transaction":{"message":{"accountKeys":["a"]}},"meta":{"loadedAddresses":{"writable":["b"],"readonly":["c"]}}}),
        );
        assert_eq!(keys, vec![json!("a"), json!("b"), json!("c")]);
    }

    #[test]
    fn decodes_only_successful_native_sol_transfer_instructions() {
        let mut instruction = vec![2, 0, 0, 0];
        instruction.extend_from_slice(&5_000_000_001u64.to_le_bytes());
        let transaction = json!({
            "transaction": {"message": {"accountKeys": ["source", "recipient", "11111111111111111111111111111111"],
                "instructions": [{"programIdIndex": 2, "accounts": [0, 1], "data": bs58::encode(instruction).into_string()}]}},
            "meta": {"err": null, "loadedAddresses": {"writable": [], "readonly": []}, "innerInstructions": []}
        });
        assert_eq!(
            decode_system_transfers(&transaction),
            vec![SystemTransfer {
                path: vec![0],
                source: "source".into(),
                recipient: "recipient".into(),
                lamports: "5000000001".into(),
            }]
        );

        let mut failed = transaction;
        failed["meta"]["err"] = json!({"InstructionError": [0, "Custom"]});
        assert!(decode_system_transfers(&failed).is_empty());
    }
    #[test]
    fn genuine_devnet_anchor_initialize_and_swap() {
        let initialize: Value = serde_json::from_str(include_str!(
            "../../../fixtures/recorded/dbc-initialize.json"
        ))
        .unwrap();
        let swap: Value =
            serde_json::from_str(include_str!("../../../fixtures/recorded/dbc-swap.json")).unwrap();
        let (events, unsupported) = decode_transaction(&initialize["result"]).unwrap();
        assert!(unsupported.is_empty());
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["kind"], "pool_created");
        assert!(events[0]["quote_mint"].is_string());
        let (events, unsupported) = decode_transaction(&swap["result"]).unwrap();
        assert_eq!(unsupported.len(), 1); // extra deployed variant is quarantined
        assert!(unsupported[0].contains("unsupported Anchor event"));
        // This actual transaction emits EvtSwap AND EvtSwap2. Count it once.
        assert_eq!(events.iter().filter(|e| e["kind"] == "swap").count(), 1);
        assert!(
            events[0]["amount_raw"]
                .as_str()
                .unwrap()
                .parse::<u64>()
                .is_ok()
        );
        assert!(events[0]["executing_instruction_path"].is_array());
        let mut failed = swap["result"].clone();
        failed["meta"]["err"] = json!({"InstructionError":[1,"Custom"]});
        assert!(decode_transaction(&failed).unwrap().0.is_empty());
    }
}
