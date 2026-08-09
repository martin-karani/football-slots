use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

use super::wallet::CurrencyType;

/// The 8 symbol types: 7 UEFA Champions League teams + the UCL Trophy (jackpot).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Symbol {
    Barcelona,
    RealMadrid,
    ManCity,
    Liverpool,
    ParisSaintGermain,
    Arsenal,
    BayernMunchen,
    UclTrophy, // Jackpot
}

impl Symbol {
    /// Snake-case key used in API payloads and bet maps.
    pub fn name(&self) -> &'static str {
        match self {
            Symbol::Barcelona => "barcelona",
            Symbol::RealMadrid => "real_madrid",
            Symbol::ManCity => "man_city",
            Symbol::Liverpool => "liverpool",
            Symbol::ParisSaintGermain => "paris",
            Symbol::Arsenal => "arsenal",
            Symbol::BayernMunchen => "bayern",
            Symbol::UclTrophy => "ucl_trophy",
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            Symbol::Barcelona => "Barcelona",
            Symbol::RealMadrid => "Real Madrid",
            Symbol::ManCity => "Man City",
            Symbol::Liverpool => "Liverpool",
            Symbol::ParisSaintGermain => "Paris SG",
            Symbol::Arsenal => "Arsenal",
            Symbol::BayernMunchen => "BayernMunchen",
            Symbol::UclTrophy => "UCL Trophy",
        }
    }

    pub fn from_name(name: &str) -> Option<Self> {
        match name {
            "barcelona" => Some(Symbol::Barcelona),
            "real_madrid" => Some(Symbol::RealMadrid),
            "man_city" => Some(Symbol::ManCity),
            "liverpool" => Some(Symbol::Liverpool),
            "paris" => Some(Symbol::ParisSaintGermain),
            "arsenal" => Some(Symbol::Arsenal),
            "bayern" => Some(Symbol::BayernMunchen),
            "ucl_trophy" => Some(Symbol::UclTrophy),
            _ => None,
        }
    }

    pub fn tier(&self) -> &'static str {
        match self {
            Symbol::Barcelona | Symbol::RealMadrid => "common",
            Symbol::ManCity | Symbol::Liverpool => "common",
            Symbol::ParisSaintGermain | Symbol::Arsenal => "mid",
            Symbol::BayernMunchen => "rare",
            Symbol::UclTrophy => "jackpot",
        }
    }

    /// All symbols valid for betting.
    pub fn all() -> &'static [Symbol] {
        &[
            Symbol::Barcelona,
            Symbol::RealMadrid,
            Symbol::ManCity,
            Symbol::Liverpool,
            Symbol::ParisSaintGermain,
            Symbol::Arsenal,
            Symbol::BayernMunchen,
            Symbol::UclTrophy,
        ]
    }
}

// ============================================================================
// PAYTABLE — the single source of truth for payout multipliers.
//
// Both the RNG's win-probability weighting (domain::services::weighted_rng)
// and the public paytable endpoint read from here. Never hardcode a
// multiplier anywhere else in the codebase.
//
// Why these specific numbers: this game lets a player stake on ANY subset of
// the 8 symbols in a single spin, so it is only exploit-proof if every
// symbol carries identical expected value per unit staked:
//
//     P(symbol) * multiplier(symbol) = RTP        for every symbol
//
// which (since probabilities must sum to 1) forces
//
//     RTP = 1 / sum_over_symbols( 1 / multiplier(symbol) )
//
// For 4 common + 2 mid + 1 rare + 1 jackpot symbols, the ladder 5/10/25/100
// gives sum(1/m) = 4/5 + 2/10 + 1/25 + 1/100 = 1.05 exactly, i.e.
// RTP = 1/1.05 = 20/21 ≈ 95.238%. Full derivation + Monte Carlo
// cross-check: docs/rtp-weighting.md.
//
// If you change ANY multiplier below, RTP and every symbol's win
// probability move automatically (see weighted_rng::weight_table) — there
// is nothing else to update by hand. Re-run `cargo test paytable` and the
// simulator (`cargo run --example rtp_simulator`) afterwards to see the new
// resulting RTP before shipping it.
// ============================================================================

pub type Paytable = [(Symbol, u32); 8];

/// v1 — introduced alongside the weighted RNG. Do not edit these numbers in
/// place once any real spin has used them; add PAYTABLE_V2 etc. instead and
/// bump CURRENT_PAYTABLE_VERSION, so historical rounds keep verifying
/// against the table that was actually live when they were spun.
pub const PAYTABLE_V1: Paytable = [
    (Symbol::Barcelona, 5),
    (Symbol::RealMadrid, 5),
    (Symbol::ManCity, 5),
    (Symbol::Liverpool, 5),
    (Symbol::ParisSaintGermain, 10),
    (Symbol::Arsenal, 10),
    (Symbol::BayernMunchen, 25),
    (Symbol::UclTrophy, 100),
];

/// The paytable version applied to spins created right now.
pub const CURRENT_PAYTABLE_VERSION: i16 = 1;

/// Look up a specific historical paytable by version, so old rounds always
/// verify against what was live at the time. Unknown/future versions fall
/// back to v1 rather than panicking — a bad version number in a DB row
/// should never crash the verifier.
pub fn paytable_for_version(version: i16) -> Paytable {
    match version {
        1 => PAYTABLE_V1,
        _ => PAYTABLE_V1,
    }
}

pub fn multiplier_in(paytable: &Paytable, symbol: Symbol) -> u32 {
    paytable
        .iter()
        .find(|(s, _)| *s == symbol)
        .map(|(_, m)| *m)
        .unwrap_or(0)
}

/// A single position on the 24-position wheel.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct WheelPosition {
    pub position: u8, // 1-24
    pub symbol: Symbol,
    pub multiplier: u16,
}

/// The complete 24-position wheel.
///
/// Layout maps to a 7×7 rectangular perimeter grid:
///   Top row    (pos  1-7):  left  → right
///   Right col  (pos  8-12): top+1 → bottom-1
///   Bottom row (pos 13-19): right → left
///   Left col   (pos 20-24): bot-1 → top+1
///
/// 8 symbols × 3 appearances = 24 positions — but as of the weighted RNG,
/// this layout is PURELY VISUAL. It decides which of a symbol's 3 cells the
/// wheel graphic spins to; it no longer decides win probability. The
/// `multiplier` field on every entry below is display-only and MUST match
/// `PAYTABLE_V1` (enforced by the `wheel_multipliers_match_paytable` test) —
/// the real, economically-relevant multiplier used for payout comes from
/// `weighted_rng::WeightedRng::generate_symbol`.
pub struct Wheel;

impl Wheel {
    pub const POSITIONS: [WheelPosition; 24] = [
        // ── Top row (1-7)
        WheelPosition { position: 1, symbol: Symbol::Barcelona, multiplier: 5 },
        WheelPosition { position: 2, symbol: Symbol::RealMadrid, multiplier: 5 },
        WheelPosition { position: 3, symbol: Symbol::ManCity, multiplier: 5 },
        WheelPosition { position: 4, symbol: Symbol::UclTrophy, multiplier: 100 },
        WheelPosition { position: 5, symbol: Symbol::Liverpool, multiplier: 5 },
        WheelPosition { position: 6, symbol: Symbol::ParisSaintGermain, multiplier: 10 },
        WheelPosition { position: 7, symbol: Symbol::Arsenal, multiplier: 10 },
        // ── Right column (8-12)
        WheelPosition { position: 8, symbol: Symbol::BayernMunchen, multiplier: 25 },
        WheelPosition { position: 9, symbol: Symbol::Barcelona, multiplier: 5 },
        WheelPosition { position: 10, symbol: Symbol::RealMadrid, multiplier: 5 },
        WheelPosition { position: 11, symbol: Symbol::ManCity, multiplier: 5 },
        WheelPosition { position: 12, symbol: Symbol::Liverpool, multiplier: 5 },
        // ── Bottom row (13-19)
        WheelPosition { position: 13, symbol: Symbol::UclTrophy, multiplier: 100 },
        WheelPosition { position: 14, symbol: Symbol::ParisSaintGermain, multiplier: 10 },
        WheelPosition { position: 15, symbol: Symbol::Arsenal, multiplier: 10 },
        WheelPosition { position: 16, symbol: Symbol::BayernMunchen, multiplier: 25 },
        WheelPosition { position: 17, symbol: Symbol::Barcelona, multiplier: 5 },
        WheelPosition { position: 18, symbol: Symbol::RealMadrid, multiplier: 5 },
        WheelPosition { position: 19, symbol: Symbol::ManCity, multiplier: 5 },
        // ── Left column (20-24)
        WheelPosition { position: 20, symbol: Symbol::Liverpool, multiplier: 5 },
        WheelPosition { position: 21, symbol: Symbol::ParisSaintGermain, multiplier: 10 },
        WheelPosition { position: 22, symbol: Symbol::Arsenal, multiplier: 10 },
        WheelPosition { position: 23, symbol: Symbol::BayernMunchen, multiplier: 25 },
        WheelPosition { position: 24, symbol: Symbol::UclTrophy, multiplier: 100 },
    ];

    /// Get the wheel position for a given 1-indexed position (1-24).
    pub fn get_position(position: u8) -> Option<&'static WheelPosition> {
        if position < 1 || position > 24 {
            return None;
        }
        Some(&Self::POSITIONS[(position - 1) as usize])
    }

    /// Collect all positions that carry a given symbol.
    pub fn positions_for_symbol(symbol: Symbol) -> Vec<u8> {
        Self::POSITIONS
            .iter()
            .filter(|p| p.symbol == symbol)
            .map(|p| p.position)
            .collect()
    }

    /// Return the first (lowest) wheel position that displays the given
    /// symbol. Used by the weighted RNG to map the mathematically-decided
    /// outcome onto a visual cell for the spin animation.
    pub fn get_first_position_for_symbol(symbol: Symbol) -> u8 {
        Self::POSITIONS
            .iter()
            .find(|p| p.symbol == symbol)
            .map(|p| p.position)
            .unwrap_or(1)
    }
}

pub const MAX_PAYOUT_MINOR: i64 = 10_000_000;

/// Legacy helper kept for backward compatibility with any caller still
/// passing a raw wheel position. Prefer computing the round directly from
/// `WeightedRng::generate_symbol` (see `game_engine::spin`) — that is the
/// function that now actually decides economic outcomes; this one just
/// re-derives a payout from an already-chosen position.
pub fn calculate_payout(bets: &HashMap<String, i64>, position: u8) -> SpinResult {
    let wheel_pos = Wheel::get_position(position).expect("Invalid position");
    let symbol = wheel_pos.symbol;
    let multiplier = wheel_pos.multiplier;

    let total_stake: i64 = bets.values().sum();
    let bet_on_symbol = bets.get(symbol.name()).copied().unwrap_or(0);
    let mut gross_payout = bet_on_symbol * multiplier as i64;
    if gross_payout > MAX_PAYOUT_MINOR {
        gross_payout = MAX_PAYOUT_MINOR;
    }
    let net_result = gross_payout - total_stake;
    let is_win = gross_payout > 0;

    SpinResult {
        position,
        symbol,
        multiplier,
        total_stake,
        gross_payout,
        net_result,
        is_win,
        server_seed_hash: String::new(),
        client_seed: String::new(),
        nonce: 0,
    }
}

/// The result of a single spin.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpinResult {
    pub position: u8,
    pub symbol: Symbol,
    pub multiplier: u16,
    pub total_stake: i64,
    pub gross_payout: i64,
    pub net_result: i64,
    pub is_win: bool,
    pub server_seed_hash: String,
    pub client_seed: String,
    pub nonce: i64,
}

/// A persisted game round.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct GameRound {
    pub id: Uuid,
    pub user_id: Uuid,
    pub currency: CurrencyType,
    pub total_stake_minor: i64,
    pub bets: serde_json::Value,
    pub result_position: i16,
    pub result_symbol: String,
    pub result_multiplier: i16,
    pub gross_payout_minor: i64,
    pub net_result_minor: i64,
    pub is_win: bool,
    pub server_seed_hash: String,
    pub server_seed: Option<String>,
    pub client_seed: String,
    pub nonce: i64,
    pub created_at: chrono::DateTime<chrono::Utc>,
    /// Which PAYTABLE_V{n} was live when this round was spun. See migration
    /// 006 and `paytable_for_version`.
    pub paytable_version: i16,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct BonusProgress {
    pub user_id: Uuid,
    pub meter_key: String,
    pub current_value: i32,
    pub target_value: i32,
    pub last_claimed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Guards against the exact failure mode that motivated this file: the
    /// old draft `weighted_rng.rs` used percentages that didn't match
    /// `Wheel::POSITIONS` at all. If someone edits PAYTABLE_V1 later and
    /// forgets the display literals in `Wheel::POSITIONS`, this fails loudly
    /// in CI instead of quietly showing players the wrong multiplier.
    #[test]
    fn wheel_multipliers_match_paytable() {
        let paytable = paytable_for_version(CURRENT_PAYTABLE_VERSION);
        for pos in Wheel::POSITIONS {
            let expected = multiplier_in(&paytable, pos.symbol);
            assert_eq!(
                pos.multiplier as u32, expected,
                "Wheel position {} ({:?}) shows ×{} but PAYTABLE says ×{}",
                pos.position, pos.symbol, pos.multiplier, expected
            );
        }
    }

    #[test]
    fn every_symbol_has_a_paytable_entry() {
        let paytable = paytable_for_version(CURRENT_PAYTABLE_VERSION);
        for symbol in Symbol::all() {
            assert!(
                paytable.iter().any(|(s, _)| s == symbol),
                "{:?} has no PAYTABLE entry",
                symbol
            );
        }
    }
}
