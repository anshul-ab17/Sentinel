use sha2::{Digest, Sha256};

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
