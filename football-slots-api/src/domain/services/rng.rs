use hmac::{Hmac, Mac};
use sha2::{Sha256, Digest};

use crate::domain::models::rng::ProvablyFair;

/// HMAC-SHA256 based provably fair RNG.
///
/// Algorithm:
/// 1. HMAC-SHA256(server_seed, client_seed || nonce_bytes)
/// 2. Take first 4 bytes of the result as a big-endian u32
/// 3. Map to position: (value % 24) + 1  →  returns 1-24
///
/// This is auditable: any spin can be independently verified by the client
/// once the server seed is revealed.
pub struct ProvablyFairRng;

impl ProvablyFairRng {
    pub fn new() -> Self {
        Self
    }
}

impl ProvablyFair for ProvablyFairRng {
    fn generate_position(&self, server_seed: &str, client_seed: &str, nonce: i64) -> u8 {
        let mut mac = Hmac::<Sha256>::new_from_slice(server_seed.as_bytes())
            .expect("HMAC can take key of any size");

        mac.update(client_seed.as_bytes());
        mac.update(&nonce.to_le_bytes());

        let result = mac.finalize();
        let bytes = result.into_bytes();

        // Use first 4 bytes as big-endian u32 for uniform distribution
        let val = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);

        // Map to 1-24
        ((val % 24) + 1) as u8
    }

    fn verify_spin(&self, server_seed: &str, client_seed: &str, nonce: i64, expected_position: u8) -> bool {
        self.generate_position(server_seed, client_seed, nonce) == expected_position
    }

    fn hash_seed(&self, seed: &str) -> String {
        let mut hasher = sha2::Sha256::new();
        hasher.update(seed.as_bytes());
        let result = hasher.finalize();
        hex::encode(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deterministic_output() {
        let rng = ProvablyFairRng::new();
        let server_seed = "test_server_seed_12345";
        let client_seed = "test_client_seed_67890";
        let nonce = 1;

        let pos1 = rng.generate_position(server_seed, client_seed, nonce);
        let pos2 = rng.generate_position(server_seed, client_seed, nonce);

        assert_eq!(pos1, pos2, "Same inputs must produce same output");
        assert!(pos1 >= 1 && pos1 <= 24, "Position must be 1-24");
    }

    #[test]
    fn test_different_nonces_produce_different_results() {
        let rng = ProvablyFairRng::new();
        let server_seed = "test_server_seed";
        let client_seed = "test_client_seed";

        let pos1 = rng.generate_position(server_seed, client_seed, 1);
        let pos2 = rng.generate_position(server_seed, client_seed, 2);

        assert_ne!(pos1, pos2, "Different nonces should produce different positions");
    }

    #[test]
    fn test_verify_spin() {
        let rng = ProvablyFairRng::new();
        let server_seed = "test_server_seed";
        let client_seed = "test_client_seed";
        let nonce = 42;

        let position = rng.generate_position(server_seed, client_seed, nonce);
        assert!(rng.verify_spin(server_seed, client_seed, nonce, position));
        assert!(!rng.verify_spin(server_seed, client_seed, nonce, (position % 24) + 1));
    }

    #[test]
    fn test_seed_hash() {
        let rng = ProvablyFairRng::new();
        let seed = "my_secret_seed";
        let hash = rng.hash_seed(seed);

        assert_eq!(hash.len(), 64); // SHA256 = 32 bytes = 64 hex chars
        assert_ne!(hash, seed);
    }
}
