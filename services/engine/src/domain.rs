// Generated from packages/contracts/event.schema.json.
#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct CanonicalEvent {
    pub schema_version: String,
    pub event_id: String,
    pub cluster: String,
    pub slot: String,
    pub signature: String,
    pub instruction_path: Vec<u32>,
    pub kind: String,
    pub commitment: String,
    pub protocol: String,
    pub decoder_version: String,
    pub amount_raw: String,
    pub decimals: Option<u8>,
    pub source_observation_ids: Vec<String>,
    pub coverage: String,
    #[serde(flatten)]
    pub extra: std::collections::BTreeMap<String, serde_json::Value>,
}
