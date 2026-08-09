/// Trait for provably fair random number generation.
pub trait ProvablyFair: Send + Sync {
    /// Generate a position (1-24) from server_seed, client_seed, and nonce.
    fn generate_position(&self, server_seed: &str, client_seed: &str, nonce: i64) -> u8;

    /// Verify a previous spin result (for client-side verification).
    fn verify_spin(&self, server_seed: &str, client_seed: &str, nonce: i64, expected_position: u8) -> bool;

    /// Hash a server seed for pre-reveal.
    fn hash_seed(&self, seed: &str) -> String;
}

/// Generate a random server seed string.
pub fn generate_server_seed() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: [u8; 32] = rng.gen();
    hex::encode(bytes)
}

/// Generate a random client seed string.
pub fn generate_client_seed() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: [u8; 16] = rng.gen();
    hex::encode(bytes)
}
