pub mod models;
pub mod services;

// Re-export commonly used types explicitly to avoid ambiguous glob re-exports.
// Both models::rng and services::rng exist, so glob would conflict on the name `rng`.
pub use models::{DomainError, DomainResult};
