use serde_json::Value;

use super::{SYSTEM_PROGRAM, SystemTransfer, account_keys, key};

fn decode_system_transfer(
    keys: &[Value],
    instruction: &Value,
    path: Vec<usize>,
) -> Option<SystemTransfer> {
    if key(keys, &instruction["programIdIndex"]) != Some(SYSTEM_PROGRAM) {
        return None;
    }
    let accounts = instruction["accounts"].as_array()?;
    let source = key(keys, accounts.first()?)?.to_owned();
    let data = bs58::decode(instruction["data"].as_str()?)
        .into_vec()
        .ok()?;
    if data.len() < 12 {
        return None;
    }
    let opcode = u32::from_le_bytes(data[..4].try_into().ok()?);
    let recipient_index = match opcode {
        2 => 1,
        11 => 2,
        _ => return None,
    };
    let recipient = key(keys, accounts.get(recipient_index)?)?.to_owned();
    let lamports = u64::from_le_bytes(data[4..12].try_into().ok()?);
    if lamports == 0 {
        return None;
    }
    Some(SystemTransfer {
        path,
        source,
        recipient,
        lamports: lamports.to_string(),
    })
}

/// Decode successful native SOL transfers, preserving their compiled instruction paths.
/// This records observed account movement only; it does not infer who controls either account.
pub fn decode_system_transfers(transaction: &Value) -> Vec<SystemTransfer> {
    if !transaction["meta"]["err"].is_null() {
        return vec![];
    }
    let keys = account_keys(transaction);
    let Some(outer) = transaction["transaction"]["message"]["instructions"].as_array() else {
        return vec![];
    };
    let inner_groups = transaction["meta"]["innerInstructions"].as_array();
    let mut transfers = Vec::new();
    for (outer_index, instruction) in outer.iter().enumerate() {
        if let Some(transfer) = decode_system_transfer(&keys, instruction, vec![outer_index]) {
            transfers.push(transfer);
        }
        let inner = inner_groups
            .and_then(|groups| {
                groups
                    .iter()
                    .find(|group| group["index"].as_u64() == Some(outer_index as u64))
            })
            .and_then(|group| group["instructions"].as_array());
        if let Some(instructions) = inner {
            for (inner_index, instruction) in instructions.iter().enumerate() {
                if let Some(transfer) =
                    decode_system_transfer(&keys, instruction, vec![outer_index, inner_index])
                {
                    transfers.push(transfer);
                }
            }
        }
    }
    transfers
}
