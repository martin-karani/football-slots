use hmac::{Hmac, Mac};
use sha2::Sha256;

use crate::domain::models::game::{paytable_for_version, Paytable, Symbol};

type HmacSha256 = Hmac<Sha256>;

/// A symbol's resolved multiplier and win probability under some paytable.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WeightedEntry {
    pub symbol: Symbol,
    pub multiplier: u32,
    pub weight: f64,
}

/// The outcome of one deterministic weighted draw.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WeightedDraw {
    pub symbol: Symbol,
    pub multiplier: u32,
    /// Raw draw value in [0, 1). Exposed so `/verify` and any third-party
    /// reference implementation can reproduce this exact spin.
    pub unit_interval: f64,
    /// Which of the 3 wheel occurrences of `symbol` the animation should
    /// land on. Indexes into the ordered list returned by
    /// `Wheel::positions_for_symbol()`. Derived deterministically from a
    /// second independent slice of the same HMAC digest so the visual
    /// landing cell cycles naturally across nonces — instead of always
    /// pinning to the first occurrence — while remaining reproducible for
    /// `/verify`. Range is guaranteed to be in `0..3`.
    pub position_variant: u8,
}

pub struct WeightedRng;

impl WeightedRng {
    /// RTP implied by a paytable: `1 / sum(1/multiplier)`. This is *derived*
    /// from the multipliers, never hardcoded — the previous draft asserted
    /// "~95%" in a doc comment while its actual multipliers implied
    /// something else entirely, and nothing checked the two matched.
    pub fn implied_rtp(paytable: &Paytable) -> f64 {
        let sum_inverse: f64 = paytable.iter().map(|(_, m)| 1.0 / *m as f64).sum();
        1.0 / sum_inverse
    }

    /// Resolve every symbol's win probability for a paytable. Weight is set
    /// so `P(symbol) * multiplier(symbol) == implied_rtp(paytable)` for
    /// every symbol — the equal-expected-value property that prevents
    /// advantage play in a "bet on any subset of symbols" game.
    pub fn weight_table(paytable: &Paytable) -> [WeightedEntry; 8] {
        let rtp = Self::implied_rtp(paytable);
        let mut out = [WeightedEntry {
            symbol: Symbol::Barcelona,
            multiplier: 0,
            weight: 0.0,
        }; 8];
        for (i, (symbol, multiplier)) in paytable.iter().enumerate() {
            out[i] = WeightedEntry {
                symbol: *symbol,
                multiplier: *multiplier,
                weight: rtp / *multiplier as f64,
            };
        }
        out
    }

    /// Deterministically draw the winning symbol for one spin, against a
    /// specific historical paytable version. Same inputs -> same output,
    /// forever. This is what `game_engine::spin` calls.
    pub fn generate_symbol(
        server_seed: &str,
        client_seed: &str,
        nonce: i64,
        paytable_version: i16,
    ) -> WeightedDraw {
        let paytable = paytable_for_version(paytable_version);
        Self::draw_from_paytable(server_seed, client_seed, nonce, &paytable)
    }

    /// Same draw, but against an explicit paytable rather than a stored
    /// version number. Used by the simulator and by tests exploring
    /// hypothetical paytables.
    pub fn draw_from_paytable(
        server_seed: &str,
        client_seed: &str,
        nonce: i64,
        paytable: &Paytable,
    ) -> WeightedDraw {
        let (unit_interval, position_variant) =
            Self::derive_draw_primitives(server_seed, client_seed, nonce);
        let table = Self::weight_table(paytable);

        let mut cumulative = 0.0_f64;
        for entry in table {
            cumulative += entry.weight;
            if unit_interval < cumulative {
                return WeightedDraw {
                    symbol: entry.symbol,
                    multiplier: entry.multiplier,
                    unit_interval,
                    position_variant,
                };
            }
        }

        // Floating-point safety net only: accumulated rounding can in
        // principle leave a sub-1e-12 gap below 1.0 uncovered. Fall back to
        // the last entry rather than ever panicking mid-spin.
        let last = table[table.len() - 1];
        WeightedDraw {
            symbol: last.symbol,
            multiplier: last.multiplier,
            unit_interval,
            position_variant,
        }
    }

    /// HMAC-SHA256(server_seed, client_seed || nonce) split into two
    /// independent deterministic outputs, using disjoint byte ranges of the
    /// same 32-byte digest:
    ///
    ///   1. bytes[0..8]  → uniform f64 in [0, 1) — used for weighted symbol
    ///      selection. The smallest weight we assign (≈0.95% for the
    ///      jackpot) needs only ~7 bits of precision, so 64 bits leaves
    ///      massive headroom.
    ///   2. bytes[8..16] → variant index `0..3` — selects which of the 3
    ///      wheel occurrences of the winning symbol the animation lands on.
    ///      There are exactly 3 occurrences per symbol, so `% 3` is fine.
    ///
    /// A single HMAC is ever computed — both primitives share it, so the
    /// entire spin remains a pure function of the commit-reveal seeds and
    /// is fully reproducible for `/verify`.
    fn derive_draw_primitives(server_seed: &str, client_seed: &str, nonce: i64) -> (f64, u8) {
        let mut mac = HmacSha256::new_from_slice(server_seed.as_bytes())
            .expect("HMAC accepts a key of any size");
        mac.update(client_seed.as_bytes());
        mac.update(&nonce.to_le_bytes());
        let bytes = mac.finalize().into_bytes();

        let mut unit_buf = [0u8; 8];
        unit_buf.copy_from_slice(&bytes[0..8]);
        let raw_unit = u64::from_be_bytes(unit_buf);
        let unit_interval = (raw_unit as f64) / (u64::MAX as f64);

        let mut variant_buf = [0u8; 8];
        variant_buf.copy_from_slice(&bytes[8..16]);
        let raw_variant = u64::from_be_bytes(variant_buf);
        let position_variant = (raw_variant % 3) as u8;

        (unit_interval, position_variant)
    }

    /// HMAC-SHA256(server_seed, client_seed || nonce) mapped to a uniform
    /// float in [0, 1). Public helper used by the verifier and by tests
    /// that don't need the wheel-variant index.
    pub fn unit_interval(server_seed: &str, client_seed: &str, nonce: i64) -> f64 {
        Self::derive_draw_primitives(server_seed, client_seed, nonce).0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::models::game::{paytable_for_version, CURRENT_PAYTABLE_VERSION};
    use rand::Rng;
    use std::collections::HashMap;

    fn current_paytable() -> Paytable {
        paytable_for_version(CURRENT_PAYTABLE_VERSION)
    }

    #[test]
    fn weights_sum_to_one() {
        let table = WeightedRng::weight_table(&current_paytable());
        let sum: f64 = table.iter().map(|e| e.weight).sum();
        assert!(
            (sum - 1.0).abs() < 1e-9,
            "weights must sum to 1.0, got {sum}"
        );
    }

    #[test]
    fn v1_rtp_is_20_over_21() {
        let rtp = WeightedRng::implied_rtp(&current_paytable());
        assert!(
            (rtp - 20.0 / 21.0).abs() < 1e-9,
            "expected RTP = 20/21 ≈ 95.238%, got {:.6}%",
            rtp * 100.0
        );
    }

    #[test]
    fn deterministic_same_inputs_same_output() {
        let draw1 = WeightedRng::generate_symbol("seed_a", "client_b", 7, 1);
        let draw2 = WeightedRng::generate_symbol("seed_a", "client_b", 7, 1);
        assert_eq!(
            draw1, draw2,
            "identical inputs must always draw identically"
        );
    }

    #[test]
    fn different_nonce_can_change_outcome() {
        // Not guaranteed for every pair (weighted draws can legitimately
        // repeat), but across many nonces we should see more than one
        // distinct symbol -- if this ever fails, unit_interval() is broken.
        let symbols: std::collections::HashSet<_> = (0..50)
            .map(|n| WeightedRng::generate_symbol("seed_x", "client_y", n, 1).symbol)
            .collect();
        assert!(
            symbols.len() > 1,
            "50 different nonces produced only one distinct symbol -- unit_interval() looks broken"
        );
    }

    #[test]
    fn position_variant_in_valid_range() {
        for nonce in 0..500 {
            let draw = WeightedRng::generate_symbol("seed_a", "client_b", nonce, 1);
            assert!(
                draw.position_variant < 3,
                "position_variant must be in 0..=2, got {} (nonce={nonce})",
                draw.position_variant
            );
        }
    }

    #[test]
    fn position_variant_cycles_across_nonces() {
        // Same-server-seed / same-client-seed, varying nonce: the visual
        // landing index must not be stuck on a single value across the
        // board. We expect at least 2 of the 3 possible variants to appear
        // within 50 spins (probability of missing any variant ≈ (2/3)^50
        // ~1e-8 for each; hitting 0-or-1-only variants is astronomically
        // unlikely unless derive_draw_primitives is broken).
        let variants: std::collections::HashSet<_> = (0..50)
            .map(|n| WeightedRng::generate_symbol("seed_x", "client_y", n, 1).position_variant)
            .collect();
        assert!(
            variants.len() >= 2,
            "position_variant stuck on a single index across 50 nonces: {:?}",
            variants
        );
    }

    /// The core anti-exploit property: no matter which single symbol a
    /// player concentrates their stake on, their long-run RTP must be the
    /// same. This directly regression-tests the 625%-on-the-jackpot bug the
    /// old uniform draw had.
    ///
    /// Ignored by default: 8 symbols × 400,000 HMAC computations takes ~1s
    /// in `--release` but well over a minute under an unoptimized `cargo
    /// test`. Run explicitly with `cargo test --release -- --ignored`, and
    /// wire that into CI as its own step so day-to-day `cargo test` stays
    /// fast.
    #[test]
    #[ignore]
    fn no_single_symbol_beats_the_others() {
        let paytable = current_paytable();
        let target_rtp = WeightedRng::implied_rtp(&paytable);
        let mut rng = rand::thread_rng();

        const SPINS_PER_SYMBOL: u64 = 400_000;

        for (symbol, multiplier) in paytable {
            let mut wins = 0u64;
            for nonce in 0..SPINS_PER_SYMBOL {
                let server_seed: String = (0..16)
                    .map(|_| rng.gen_range(b'a'..=b'z') as char)
                    .collect();
                let client_seed: String = (0..16)
                    .map(|_| rng.gen_range(b'a'..=b'z') as char)
                    .collect();
                let draw = WeightedRng::draw_from_paytable(
                    &server_seed,
                    &client_seed,
                    nonce as i64,
                    &paytable,
                );
                if draw.symbol == symbol {
                    wins += 1;
                }
            }

            // Realized RTP if a player bet 1 unit on ONLY this symbol every
            // spin: (wins * multiplier) / total_staked.
            let realized_rtp = (wins as f64 * multiplier as f64) / SPINS_PER_SYMBOL as f64;

            let relative_error = (realized_rtp - target_rtp).abs() / target_rtp;
            assert!(
                relative_error < 0.05,
                "{symbol:?} (×{multiplier}): realized RTP {:.2}% vs target {:.2}% \
                 (>5% off — this symbol would be exploitable)",
                realized_rtp * 100.0,
                target_rtp * 100.0
            );
        }
    }

    /// Sanity-check observed hit frequency against the analytic weight for
    /// every symbol over a large sample, with tolerance scaled for rarer
    /// symbols (a 0.95%-probability jackpot naturally has more relative
    /// sampling noise than a 19%-probability common symbol at fixed N).
    ///
    /// Ignored by default for the same reason as the test above — run with
    /// `cargo test --release -- --ignored`.
    #[test]
    #[ignore]
    fn observed_frequency_matches_analytic_weight() {
        let paytable = current_paytable();
        let table = WeightedRng::weight_table(&paytable);
        let mut rng = rand::thread_rng();

        const N: u64 = 600_000;
        let mut counts: HashMap<Symbol, u64> = HashMap::new();

        for nonce in 0..N {
            let server_seed: String = (0..16)
                .map(|_| rng.gen_range(b'a'..=b'z') as char)
                .collect();
            let client_seed: String = (0..16)
                .map(|_| rng.gen_range(b'a'..=b'z') as char)
                .collect();
            let draw = WeightedRng::draw_from_paytable(
                &server_seed,
                &client_seed,
                nonce as i64,
                &paytable,
            );
            *counts.entry(draw.symbol).or_insert(0) += 1;
        }

        for entry in table {
            let observed = *counts.get(&entry.symbol).unwrap_or(&0) as f64 / N as f64;
            let relative_error = (observed - entry.weight).abs() / entry.weight;
            assert!(
                relative_error < 0.08,
                "{:?}: observed {:.3}% vs expected {:.3}% (>8% off)",
                entry.symbol,
                observed * 100.0,
                entry.weight * 100.0
            );
        }
    }
}
