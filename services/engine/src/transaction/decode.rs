use crate::{EVENT_CPI, PROGRAM, decode_anchor_event};
use anyhow::{Context, Result};
use serde_json::{Value, json};

use super::{account_keys, key};

/// Inner instruction stackHeight selects the actual executing DBC invocation.
/// The transaction fee payer is never used as a substitute economic trader.
pub fn decode_transaction(transaction: &Value) -> Result<(Vec<Value>, Vec<String>)> {
    if !transaction["meta"]["err"].is_null() {
        return Ok((vec![], vec![]));
    }
    if transaction["version"]
        .as_u64()
        .is_some_and(|version| version > 0)
    {
        return Ok((
            vec![],
            vec!["Unsupported transaction version; raw preserved".into()],
        ));
    }
    let keys = account_keys(transaction);
    let idl: Value =
        serde_json::from_str(include_str!("../../../../backend/protocol/dbc-idl.json"))?;
    let mut events = vec![];
    let mut unsupported = vec![];
    let outer = transaction["transaction"]["message"]["instructions"]
        .as_array()
        .context("missing instructions")?;
    for (outer_index, instruction) in outer.iter().enumerate() {
        let mut frames: Vec<(u64, Value, Vec<usize>)> =
            vec![(1, instruction.clone(), vec![outer_index])];
        let inner = transaction["meta"]["innerInstructions"]
            .as_array()
            .and_then(|groups| {
                groups
                    .iter()
                    .find(|g| g["index"].as_u64() == Some(outer_index as u64))
            })
            .and_then(|g| g["instructions"].as_array());
        if let Some(inner) = inner {
            for (inner_index, ix) in inner.iter().enumerate() {
                let depth = ix["stackHeight"].as_u64();
                if let Some(depth) = depth {
                    while frames.last().is_some_and(|f| f.0 >= depth) {
                        frames.pop();
                    }
                }
                let is_dbc = key(&keys, &ix["programIdIndex"]) == Some(PROGRAM);
                let bytes = ix["data"]
                    .as_str()
                    .and_then(|data| bs58::decode(data).into_vec().ok());
                if is_dbc && bytes.as_ref().is_some_and(|b| b.starts_with(EVENT_CPI)) {
                    let bytes = bytes.unwrap();
                    match decode_anchor_event(&bytes[8..]) {
                        Ok(Some(mut event)) => {
                            event["instruction_path"] = json!([outer_index, inner_index]);
                            event["executing_instruction_path"] = Value::Null;
                            event["trader"] = Value::Null;
                            if depth.is_some()
                                && let Some((_, execution, path)) = frames
                                    .last()
                                    .filter(|f| key(&keys, &f.1["programIdIndex"]) == Some(PROGRAM))
                            {
                                event["executing_instruction_path"] = json!(path);
                                if let Some(data) = execution["data"]
                                    .as_str()
                                    .and_then(|s| bs58::decode(s).into_vec().ok())
                                {
                                    let definition =
                                        idl["instructions"].as_array().unwrap().iter().find(|d| {
                                            d["discriminator"].as_array().is_some_and(|ds| {
                                                ds.iter()
                                                    .map(|x| x.as_u64().unwrap() as u8)
                                                    .collect::<Vec<_>>()
                                                    == data.get(..8).unwrap_or_default()
                                            })
                                        });
                                    if let Some(def) = definition {
                                        for (i, account) in
                                            def["accounts"].as_array().unwrap().iter().enumerate()
                                        {
                                            if let Some(address) =
                                                key(&keys, &execution["accounts"][i])
                                            {
                                                match account["name"].as_str() {
                                                    Some("quote_mint") => {
                                                        event["quote_mint"] = json!(address)
                                                    }
                                                    Some("base_mint") => {
                                                        event["base_mint"] = json!(address)
                                                    }
                                                    Some("payer")
                                                        if path.len() == 1
                                                            && ["swap", "swap2"].contains(
                                                                &def["name"].as_str().unwrap_or(""),
                                                            ) =>
                                                    {
                                                        event["trader"] = json!(address)
                                                    }
                                                    _ => {}
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            events.push(event);
                        }
                        Ok(None) => {}
                        Err(error) => {
                            unsupported.push(format!("{outer_index}/{inner_index}: {error}"))
                        }
                    }
                } else if let Some(depth) = depth {
                    frames.push((depth, ix.clone(), vec![outer_index, inner_index]));
                }
            }
        }
    }
    Ok((events, unsupported))
}
