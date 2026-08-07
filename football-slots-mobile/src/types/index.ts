// ============================================================
// Core Types
// ============================================================

export type CurrencyType = "virtual" | "real" | "bonus";

export interface SpinResult {
  round_id: string;
  position: number;
  symbol: string;
  symbol_display: string;
  multiplier: number;
  total_stake: number;
  gross_payout: number;
  net_result: number;
  is_win: boolean;
  server_seed_hash: string;
  client_seed: string;
  nonce: number;
  bonus_claimed?: boolean;
  bonus_progress_current?: number;
  bonus_progress_target?: number;
}

export interface GambleResult {
  game_round_id: string;
  stake_minor: number;
  choice: "home" | "away";
  result_number: number;
  won: boolean;
  payout_minor: number;
  net_result_minor: number;
  server_seed_hash: string;
  nonce: number;
}

export interface WalletBalance {
  currency: CurrencyType;
  balance_minor: number;
  balance_formatted: string;
}

export interface LedgerEntry {
  id: string;
  wallet_id: string;
  entry_type: string;
  amount_minor: number;
  balance_after_minor: number;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
}

export interface GameRound {
  id: string;
  user_id: string;
  currency: CurrencyType;
  total_stake_minor: number;
  bets: Record<string, number>;
  result_position: number;
  result_symbol: string;
  result_multiplier: number;
  gross_payout_minor: number;
  net_result_minor: number;
  is_win: boolean;
  created_at: string;
}

// ============================================================
// Symbols — 7 UCL teams + the trophy (jackpot).
// Keys MUST match the backend Symbol::name() values exactly.
// ============================================================

import ArsenalIcon from "../../assets/clubs-icons/arsenal.svg";
import BarcelonaIcon from "../../assets/clubs-icons/barcelona.svg";
import BayernIcon from "../../assets/clubs-icons/bayern.svg";
import ChelseaIcon from "../../assets/clubs-icons/chelsea.svg";
import LiverpoolIcon from "../../assets/clubs-icons/liverpool.svg";
import ManCityIcon from "../../assets/clubs-icons/man_city.svg";
import RealMadridIcon from "../../assets/clubs-icons/real_madrid.svg";
import UclTrophyIcon from "../../assets/clubs-icons/ucl_trophy.svg";

export const SYMBOLS = [
  {
    key: "barcelona",
    name: "Barcelona",
    icon: BarcelonaIcon,
    color: "#003DA5",
    tier: "common",
  },
  {
    key: "real_madrid",
    name: "Real Madrid",
    icon: RealMadridIcon,
    color: "#7c6c3e",
    tier: "common",
  },
  {
    key: "man_city",
    name: "Man City",
    icon: ManCityIcon,
    color: "#6CABDD",
    tier: "common",
  },
  {
    key: "liverpool",
    name: "Liverpool",
    icon: LiverpoolIcon,
    color: "#C8102E",
    tier: "common",
  },
  {
    key: "chelsea",
    name: "Chelsea",
    icon: ChelseaIcon,
    color: "#034694",
    tier: "mid",
  },
  {
    key: "arsenal",
    name: "Arsenal",
    icon: ArsenalIcon,
    color: "#EF0107",
    tier: "mid",
  },
  {
    key: "bayern",
    name: "Bayern Munchen",
    icon: BayernIcon,
    color: "#DC052D",
    tier: "rare",
  },
  {
    key: "ucl_trophy",
    name: "UCL Trophy",
    icon: UclTrophyIcon,
    color: "#1B3A6E",
    tier: "jackpot",
  },
] as const;

export type SymbolKey = (typeof SYMBOLS)[number]["key"];

// ============================================================
// Wheel — 24 positions on a 7×7 square perimeter.
//
// Grid layout (cols 0-6, rows 0-6):
//   Top row    pos  1-7  → row 0, col 0→6
//   Right col  pos  8-12 → col 6, row 1→5
//   Bottom row pos 13-19 → row 6, col 6→0
//   Left col   pos 20-24 → col 0, row 5→1
//
// 8 symbols × 3 appearances = 24. MUST match backend Wheel::POSITIONS exactly.
// ============================================================

export interface WheelPosition {
  pos: number;
  symbol: string;
  multiplier: number;
}

export const WHEEL_POSITIONS: WheelPosition[] = [
  // Top row (1-7)
  { pos: 1, symbol: "barcelona", multiplier: 3 },
  { pos: 2, symbol: "real_madrid", multiplier: 3 },
  { pos: 3, symbol: "man_city", multiplier: 3 },
  { pos: 4, symbol: "ucl_trophy", multiplier: 50 },
  { pos: 5, symbol: "liverpool", multiplier: 3 },
  { pos: 6, symbol: "chelsea", multiplier: 5 },
  { pos: 7, symbol: "arsenal", multiplier: 5 },
  // Right column (8-12)
  { pos: 8, symbol: "bayern", multiplier: 8 },
  { pos: 9, symbol: "barcelona", multiplier: 3 },
  { pos: 10, symbol: "real_madrid", multiplier: 3 },
  { pos: 11, symbol: "man_city", multiplier: 3 },
  { pos: 12, symbol: "liverpool", multiplier: 3 },
  // Bottom row (13-19)
  { pos: 13, symbol: "ucl_trophy", multiplier: 50 },
  { pos: 14, symbol: "chelsea", multiplier: 5 },
  { pos: 15, symbol: "arsenal", multiplier: 5 },
  { pos: 16, symbol: "bayern", multiplier: 8 },
  { pos: 17, symbol: "barcelona", multiplier: 3 },
  { pos: 18, symbol: "real_madrid", multiplier: 3 },
  { pos: 19, symbol: "man_city", multiplier: 3 },
  // Left column (20-24)
  { pos: 20, symbol: "liverpool", multiplier: 3 },
  { pos: 21, symbol: "chelsea", multiplier: 5 },
  { pos: 22, symbol: "arsenal", multiplier: 5 },
  { pos: 23, symbol: "bayern", multiplier: 8 },
  { pos: 24, symbol: "ucl_trophy", multiplier: 50 },
];

/**
 * Maps a 1-indexed wheel position (1-24) to its {col, row} in the 7×7 perimeter grid.
 * Top-left is (0,0). Layout goes clockwise.
 */
export function getGridCoords(pos: number): { col: number; row: number } {
  if (pos >= 1 && pos <= 7) return { col: pos - 1, row: 0 }; // top
  if (pos >= 8 && pos <= 12) return { col: 6, row: pos - 7 }; // right
  if (pos >= 13 && pos <= 19) return { col: 6 - (pos - 13), row: 6 }; // bottom
  if (pos >= 20 && pos <= 24) return { col: 0, row: 5 - (pos - 20) }; // left
  return { col: 0, row: 0 };
}

// ============================================================
// Betting
// ============================================================

export interface BetMap {
  [symbol: string]: number;
}

export const CHIP_VALUES = [5, 10, 20, 50, 100, 200, 500];

// ============================================================
// API
// ============================================================

export interface ApiResponse<T> {
  data: T;
}

export interface AuthResponse {
  token: string;
  user_id: string;
  phone_number: string;
  kyc_status: string;
}
