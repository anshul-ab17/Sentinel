mod decode;
mod transfers;

use serde_json::Value;

const SYSTEM_PROGRAM: &str = "11111111111111111111111111111111";

#[derive(Debug, PartialEq, Eq)]
pub struct SystemTransfer {
    pub path: Vec<usize>,
    pub source: String,
    pub recipient: String,
    pub lamports: String,
}

fn key<'a>(keys: &'a [Value], index: &Value) -> Option<&'a str> {
    keys.get(index.as_u64()? as usize)?.as_str()
}
pub fn account_keys(transaction: &Value) -> Vec<Value> {
    let mut keys = transaction["transaction"]["message"]["accountKeys"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    for name in ["writable", "readonly"] {
        if let Some(loaded) = transaction["meta"]["loadedAddresses"][name].as_array() {
            keys.extend_from_slice(loaded);
        }
    }
    keys
}

pub use decode::decode_transaction;
pub use transfers::decode_system_transfers;
