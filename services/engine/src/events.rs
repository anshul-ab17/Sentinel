use anchor_lang::{AnchorDeserialize, Discriminator};
use anyhow::{Context, Result, bail};
use dynamic_bonding_curve::event::*;
use serde_json::{Value, json};

fn deserialize<T: AnchorDeserialize + Discriminator>(bytes: &[u8]) -> Result<T> {
    if !bytes.starts_with(T::DISCRIMINATOR) {
        bail!("discriminator mismatch");
    }
    let mut payload = &bytes[T::DISCRIMINATOR.len()..];
    let event = T::deserialize(&mut payload).context("Anchor event deserialization")?;
    if !payload.is_empty() {
        bail!("unsupported trailing event bytes");
    }
    Ok(event)
}

/// The official Anchor-generated event structs own binary layouts and validation.
/// JSON presentation converts every financial integer to a decimal string.
pub fn decode_anchor_event(bytes: &[u8]) -> Result<Option<Value>> {
    if bytes.starts_with(EvtInitializePool::DISCRIMINATOR) {
        let e: EvtInitializePool = deserialize(bytes)?;
        return Ok(Some(json!({

                "kind":"pool_created",

                "pool":e.pool.to_string(),

                "config":e.config.to_string(),

                "creator":e.creator.to_string(),

                "base_mint":e.base_mint.to_string(),

                "pool_type":e.pool_type,

                "activation_point":e.activation_point.to_string(),

                "amount_raw":"0"

        })));
    }
    if bytes.starts_with(EvtSwap2::DISCRIMINATOR) {
        let e: EvtSwap2 = deserialize(bytes)?;
        if e.trade_direction > 1 || e.swap_parameters.swap_mode > 2 {
            bail!("unsupported swap mode/direction");
        }
        return Ok(Some(json!({

                "kind":"swap",

                "pool":e.pool.to_string(),

                "config":e.config.to_string(),

                "trade_direction":e.trade_direction,

                "has_referral":e.has_referral,

                "swap_mode":e.swap_parameters.swap_mode,


                            "amount_raw":e.swap_result.included_fee_input_amount.to_string(),

                "excluded_fee_input_amount":e.swap_result.excluded_fee_input_amount.to_string(),

                "output_amount":e.swap_result.output_amount.to_string(),

                "amount_left":e.swap_result.amount_left.to_string(),


                            "next_sqrt_price":e.swap_result.next_sqrt_price.to_string(),

                "trading_fee":e.swap_result.trading_fee.to_string(),

                "protocol_fee":e.swap_result.protocol_fee.to_string(),

                "referral_fee":e.swap_result.referral_fee.to_string(),


                            "quote_reserve_amount":e.quote_reserve_amount.to_string(),

                "migration_threshold":e.migration_threshold.to_string(),

                "timestamp":e.current_timestamp.to_string()

        })));
    }
    if bytes.starts_with(EvtCurveComplete::DISCRIMINATOR) {
        let e: EvtCurveComplete = deserialize(bytes)?;
        return Ok(Some(json!({

                "kind":"curve_complete",

                "pool":e.pool.to_string(),

                "config":e.config.to_string(),

                "base_reserve":e.base_reserve.to_string(),

                "quote_reserve_amount":e.quote_reserve.to_string(),

                "amount_raw":"0"

        })));
    }
    if bytes.starts_with(EvtClaimTradingFee::DISCRIMINATOR) {
        let e: EvtClaimTradingFee = deserialize(bytes)?;
        return Ok(Some(json!({

                "kind":"fee_claim",

                "pool":e.pool.to_string(),

                "base_fee_raw":e.token_base_amount.to_string(),

                "amount_raw":e.token_quote_amount.to_string(),

                "principal_withdrawal":false

        })));
    }
    if bytes.starts_with(EvtClaimCreatorTradingFee::DISCRIMINATOR) {
        let e: EvtClaimCreatorTradingFee = deserialize(bytes)?;
        return Ok(Some(json!({

                "kind":"fee_claim",

                "pool":e.pool.to_string(),

                "base_fee_raw":e.token_base_amount.to_string(),

                "amount_raw":e.token_quote_amount.to_string(),

                "principal_withdrawal":false

        })));
    }
    if bytes.starts_with(EvtUpdatePoolCreator::DISCRIMINATOR) {
        let e: EvtUpdatePoolCreator = deserialize(bytes)?;
        return Ok(Some(json!({

                "kind":"creator_changed",

                "pool":e.pool.to_string(),

                "creator":e.creator.to_string(),

                "new_creator":e.new_creator.to_string(),

                "amount_raw":"0"

        })));
    }
    // Legacy EvtSwap is deliberately not used: current programs emit it together
    // with EvtSwap2. Other variants stay in raw evidence and coverage records.
    if bytes.starts_with(EvtSwap::DISCRIMINATOR) {
        return Ok(None);
    }
    bail!("unsupported Anchor event discriminator")
}
