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
    Chelsea,
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
            Symbol::Chelsea => "chelsea",
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
            Symbol::Chelsea => "Chelsea",
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
            "chelsea" => Some(Symbol::Chelsea),
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
            Symbol::Chelsea | Symbol::Arsenal => "mid",
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
            Symbol::Chelsea,
            Symbol::Arsenal,
            Symbol::BayernMunchen,
            Symbol::UclTrophy,
        ]
    }
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
/// 8 symbols × 3 appearances = 24 positions.
/// Multipliers reflect probability: UCL Trophy is rarest (×50), Barcelona/Real Madrid most common (×3).
pub struct Wheel;

impl Wheel {
    pub const POSITIONS: [WheelPosition; 24] = [
        // ── Top row (1-7)
        WheelPosition {
            position: 1,
            symbol: Symbol::Barcelona,
            multiplier: 3,
        },
        WheelPosition {
            position: 2,
            symbol: Symbol::RealMadrid,
            multiplier: 3,
        },
        WheelPosition {
            position: 3,
            symbol: Symbol::ManCity,
            multiplier: 3,
        },
        WheelPosition {
            position: 4,
            symbol: Symbol::UclTrophy,
            multiplier: 50,
        },
        WheelPosition {
            position: 5,
            symbol: Symbol::Liverpool,
            multiplier: 3,
        },
        WheelPosition {
            position: 6,
            symbol: Symbol::Chelsea,
            multiplier: 5,
        },
        WheelPosition {
            position: 7,
            symbol: Symbol::Arsenal,
            multiplier: 5,
        },
        // ── Right column (8-12)
        WheelPosition {
            position: 8,
            symbol: Symbol::BayernMunchen,
            multiplier: 8,
        },
        WheelPosition {
            position: 9,
            symbol: Symbol::Barcelona,
            multiplier: 3,
        },
        WheelPosition {
            position: 10,
            symbol: Symbol::RealMadrid,
            multiplier: 3,
        },
        WheelPosition {
            position: 11,
            symbol: Symbol::ManCity,
            multiplier: 3,
        },
        WheelPosition {
            position: 12,
            symbol: Symbol::Liverpool,
            multiplier: 3,
        },
        // ── Bottom row (13-19)
        WheelPosition {
            position: 13,
            symbol: Symbol::UclTrophy,
            multiplier: 50,
        },
        WheelPosition {
            position: 14,
            symbol: Symbol::Chelsea,
            multiplier: 5,
        },
        WheelPosition {
            position: 15,
            symbol: Symbol::Arsenal,
            multiplier: 5,
        },
        WheelPosition {
            position: 16,
            symbol: Symbol::BayernMunchen,
            multiplier: 8,
        },
        WheelPosition {
            position: 17,
            symbol: Symbol::Barcelona,
            multiplier: 3,
        },
        WheelPosition {
            position: 18,
            symbol: Symbol::RealMadrid,
            multiplier: 3,
        },
        WheelPosition {
            position: 19,
            symbol: Symbol::ManCity,
            multiplier: 3,
        },
        // ── Left column (20-24)
        WheelPosition {
            position: 20,
            symbol: Symbol::Liverpool,
            multiplier: 3,
        },
        WheelPosition {
            position: 21,
            symbol: Symbol::Chelsea,
            multiplier: 5,
        },
        WheelPosition {
            position: 22,
            symbol: Symbol::Arsenal,
            multiplier: 5,
        },
        WheelPosition {
            position: 23,
            symbol: Symbol::BayernMunchen,
            multiplier: 8,
        },
        WheelPosition {
            position: 24,
            symbol: Symbol::UclTrophy,
            multiplier: 50,
        },
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

    /// Return the first (lowest) wheel position that displays the given symbol.
    /// Used by the weighted RNG to map a mathematical outcome to a visual cell.
    pub fn get_first_position_for_symbol(symbol: Symbol) -> u8 {
        Self::POSITIONS
            .iter()
            .find(|p| p.symbol == symbol)
            .map(|p| p.position)
            .unwrap_or(1)
    }
}

pub const MAX_PAYOUT_MINOR: i64 = 10_000_000;

/// Calculate the payout for a spin.
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
    let is_win = net_result > 0;

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
