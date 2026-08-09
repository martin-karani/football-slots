//! RTP & variance simulator.
//!
//! Run with:
//!     cargo run --release --example rtp_simulator
//!     cargo run --release --example rtp_simulator -- 10000000   # custom spin count
//!
//! This is a *reporting* tool for humans deciding whether a paytable is
//! ready to ship (the automated pass/fail checks live in
//! `domain/services/weighted_rng.rs`'s `#[cfg(test)]` module, which CI runs
//! on every build). Use this whenever you're about to change PAYTABLE_V{n}
//! and want to see the resulting numbers before committing to them.

use football_slots_api::domain::models::game::{paytable_for_version, CURRENT_PAYTABLE_VERSION};
use football_slots_api::domain::services::weighted_rng::WeightedRng;
use rand::Rng;
use std::collections::HashMap;

fn random_seed(rng: &mut impl Rng, len: usize) -> String {
    (0..len).map(|_| rng.gen_range(b'a'..=b'z') as char).collect()
}

fn main() {
    let spins: u64 = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(2_000_000);

    let paytable = paytable_for_version(CURRENT_PAYTABLE_VERSION);
    let table = WeightedRng::weight_table(&paytable);
    let target_rtp = WeightedRng::implied_rtp(&paytable);

    println!("=== Football Slots — RTP & Variance Simulator ===");
    println!("Paytable version: {CURRENT_PAYTABLE_VERSION}");
    println!("Analytic RTP:     {:.4}%  (target: every symbol contributes equally)\n", target_rtp * 100.0);

    println!("{:<14} {:>6} {:>10} {:>12}", "symbol", "mult", "P(hit)", "1/P (avg spins between hits)");
    for e in table {
        println!(
            "{:<14} {:>5}x {:>9.4}% {:>12.1}",
            e.symbol.name(),
            e.multiplier,
            e.weight * 100.0,
            1.0 / e.weight
        );
    }
    println!();

    let mut rng = rand::thread_rng();
    let mut counts: HashMap<&'static str, u64> = HashMap::new();
    let mut per_symbol_wins: HashMap<&'static str, u64> = HashMap::new();

    // "Flat bettor" baseline: stakes 1 unit on all 8 symbols every spin
    // (total stake 8/spin). This is the most exploit-sensitive strategy to
    // watch for variance/volatility purposes, and mathematically must
    // converge to the same RTP as any single-symbol strategy.
    let mut flat_bettor_stake: i64 = 0;
    let mut flat_bettor_payout: i64 = 0;
    let mut spin_net_results: Vec<i64> = Vec::with_capacity(spins as usize);
    let mut max_single_payout: i64 = 0;

    println!("Running {spins} simulated spins...");
    for nonce in 0..spins {
        let server_seed = random_seed(&mut rng, 16);
        let client_seed = random_seed(&mut rng, 16);
        let draw = WeightedRng::draw_from_paytable(&server_seed, &client_seed, nonce as i64, &paytable);

        *counts.entry(draw.symbol.name()).or_insert(0) += 1;
        *per_symbol_wins.entry(draw.symbol.name()).or_insert(0) += 1;

        flat_bettor_stake += 8; // 1 unit staked on each of the 8 symbols
        let payout = draw.multiplier as i64; // only the winning symbol's stake (1 unit) pays
        flat_bettor_payout += payout;
        spin_net_results.push(payout - 8);
        max_single_payout = max_single_payout.max(payout);
    }

    let realized_rtp = flat_bettor_payout as f64 / flat_bettor_stake as f64;
    println!("\n--- Flat-bettor strategy (1 unit on every symbol, every spin) ---");
    println!("Realized RTP:      {:.4}%  (target {:.4}%)", realized_rtp * 100.0, target_rtp * 100.0);

    let mean: f64 = spin_net_results.iter().map(|&x| x as f64).sum::<f64>() / spins as f64;
    let variance: f64 = spin_net_results
        .iter()
        .map(|&x| (x as f64 - mean).powi(2))
        .sum::<f64>()
        / spins as f64;
    println!("Mean net/spin:     {:.4} units (stake 8/spin)", mean);
    println!("Std dev net/spin:  {:.4} units", variance.sqrt());
    println!("Largest single payout observed: {max_single_payout} units (on a 1-unit stake)");

    println!("\n--- Per-symbol exploit check (bet ONLY this symbol, every spin) ---");
    println!("{:<14} {:>10} {:>12} {:>12}", "symbol", "hits", "realized RTP", "vs target");
    for e in table {
        let wins = *per_symbol_wins.get(e.symbol.name()).unwrap_or(&0);
        let realized = (wins as f64 * e.multiplier as f64) / spins as f64;
        let delta_pct = (realized - target_rtp) / target_rtp * 100.0;
        println!(
            "{:<14} {:>10} {:>11.3}% {:>+11.2}%",
            e.symbol.name(),
            wins,
            realized * 100.0,
            delta_pct
        );
    }

    println!("\n--- Observed vs analytic hit frequency ---");
    println!("{:<14} {:>12} {:>12} {:>10}", "symbol", "observed", "expected", "delta");
    for e in table {
        let observed = *counts.get(e.symbol.name()).unwrap_or(&0) as f64 / spins as f64;
        println!(
            "{:<14} {:>11.4}% {:>11.4}% {:>+9.4}%",
            e.symbol.name(),
            observed * 100.0,
            e.weight * 100.0,
            (observed - e.weight) * 100.0
        );
    }

    println!(
        "\nDone. If every 'vs target' delta above stays within a few tenths of a\n\
         percent and shrinks as you increase the spin count, the paytable is\n\
         behaving as designed. Large, non-shrinking deltas on a specific\n\
         symbol point at a bug in that symbol's weight, not sampling noise."
    );
}
