// ============================================================
// Core Types
// ============================================================

export type CurrencyType = "virtual" | "real";

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
  paytable_version?: number;
}

export interface PaytableRow {
  symbol: string;
  display_name: string;
  tier: string;
  multiplier: number;
  probability: number; // 0.19048 = 19.048%
}

export interface PaytableResponse {
  paytable_version: number;
  rtp: number;
  symbols: PaytableRow[];
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

export interface WithdrawResponse {
  transaction_id: string;
  status: string;
  message: string;
}

export interface PaymentProviderInfo {
  code: string;
  display_name: string;
  enabled: boolean;
  supports_deposit: boolean;
  supports_withdrawal: boolean;
}

// Provider branding (presentation-only; availability comes from the backend).
export const PROVIDER_BRANDING: Record<string, { color: string }> = {
  mpesa: { color: "#4CAF50" },
  airtel_money: { color: "#FF0000" },
};

// ============================================================
// Symbols — 7 UCL teams + the trophy (jackpot).
// Keys MUST match the backend Symbol::name() values exactly.
// ============================================================

import ArsenalIcon from "../../assets/clubs-icons/arsenal.svg";
import BarcelonaIcon from "../../assets/clubs-icons/barcelona.svg";
import BayernIcon from "../../assets/clubs-icons/bayern.svg";
import LiverpoolIcon from "../../assets/clubs-icons/liverpool.svg";
import ManCityIcon from "../../assets/clubs-icons/man_city.svg";
import ParisIcon from "../../assets/clubs-icons/paris.svg";
import RealMadridIcon from "../../assets/clubs-icons/real_madrid.svg";
import UclTrophyIcon from "../../assets/clubs-icons/ucl_trophy.svg";

export const SYMBOLS = [
  {
    key: "barcelona",
    name: "Barcelona",
    icon: BarcelonaIcon,
    color: "#003DA5",
    tier: "common",
    multiplier: 5,
  },
  {
    key: "real_madrid",
    name: "Real Madrid",
    icon: RealMadridIcon,
    color: "#7c6c3e",
    tier: "common",
    multiplier: 5,
  },
  {
    key: "man_city",
    name: "Man City",
    icon: ManCityIcon,
    color: "#6CABDD",
    tier: "common",
    multiplier: 5,
  },
  {
    key: "liverpool",
    name: "Liverpool",
    icon: LiverpoolIcon,
    color: "#C8102E",
    tier: "common",
    multiplier: 5,
  },
  {
    key: "paris",
    name: "Paris SG",
    icon: ParisIcon,
    color: "#004170",
    tier: "mid",
    multiplier: 10,
  },
  {
    key: "arsenal",
    name: "Arsenal",
    icon: ArsenalIcon,
    color: "#EF0107",
    tier: "mid",
    multiplier: 10,
  },
  {
    key: "bayern",
    name: "Bayern Munchen",
    icon: BayernIcon,
    color: "#DC052D",
    tier: "rare",
    multiplier: 25,
  },
  {
    key: "ucl_trophy",
    name: "UCL Trophy",
    icon: UclTrophyIcon,
    color: "#1B3A6E",
    tier: "jackpot",
    multiplier: 100,
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
  { pos: 1, symbol: "barcelona", multiplier: 5 },
  { pos: 2, symbol: "real_madrid", multiplier: 5 },
  { pos: 3, symbol: "man_city", multiplier: 5 },
  { pos: 4, symbol: "ucl_trophy", multiplier: 100 },
  { pos: 5, symbol: "liverpool", multiplier: 5 },
  { pos: 6, symbol: "paris", multiplier: 10 },
  { pos: 7, symbol: "arsenal", multiplier: 10 },
  // Right column (8-12)
  { pos: 8, symbol: "bayern", multiplier: 25 },
  { pos: 9, symbol: "barcelona", multiplier: 5 },
  { pos: 10, symbol: "real_madrid", multiplier: 5 },
  { pos: 11, symbol: "man_city", multiplier: 5 },
  { pos: 12, symbol: "liverpool", multiplier: 5 },
  // Bottom row (13-19)
  { pos: 13, symbol: "ucl_trophy", multiplier: 100 },
  { pos: 14, symbol: "paris", multiplier: 10 },
  { pos: 15, symbol: "arsenal", multiplier: 10 },
  { pos: 16, symbol: "bayern", multiplier: 25 },
  { pos: 17, symbol: "barcelona", multiplier: 5 },
  { pos: 18, symbol: "real_madrid", multiplier: 5 },
  { pos: 19, symbol: "man_city", multiplier: 5 },
  // Left column (20-24)
  { pos: 20, symbol: "liverpool", multiplier: 5 },
  { pos: 21, symbol: "paris", multiplier: 10 },
  { pos: 22, symbol: "arsenal", multiplier: 10 },
  { pos: 23, symbol: "bayern", multiplier: 25 },
  { pos: 24, symbol: "ucl_trophy", multiplier: 100 },
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

// ============================================================
// Currency / Unit helpers
// ============================================================

/**
 * All wallet/stake/bet values flowing through the backend are stored in
 * MINOR units. The ratio between the integer minor unit and what the
 * user sees on screen (DISPLAY units) is the SAME for every currency —
   * switching between DEMO and KES behaves identically:
 *
   *   Virtual / DEMO  ->  1 minor  =  0.01 DISPLAY DEMO  (1 DEMO = 100 minor)
 *   Real    / KES  ->  1 minor  =  0.01 DISPLAY KES  (1 KES = 100 minor)
 *
 * This matches the backend's own convention (see config.rs comment
 * "Virtual currency defaults (in minor units = cents)") so the free
   * refill of 100 000 minor credits the user with 1 000.00 DEMO display.
 *
 * These helpers are the single place that ratio lives. Never hard-code a
 * `* 100` or `/ 100` in a component.
 */
const MINOR_PER_DISPLAY: Record<CurrencyType, number> = {
  virtual: 100,
  real: 100,
};

/** Convert a DISPLAY-unit amount (what the user reads on a chip button) to the raw MINOR integer the API/stores work with. */
export function toMinor(displayAmount: number, currency: CurrencyType): number {
  return Math.round(displayAmount * MINOR_PER_DISPLAY[currency]);
}

/** Convert a raw MINOR integer (from the API balance, or stored bet) to its DISPLAY-unit float. */
export function fromMinor(minorAmount: number, currency: CurrencyType): number {
  return minorAmount / MINOR_PER_DISPLAY[currency];
}

/**
 * Format a raw MINOR-unit balance into the user-facing string.
 * All three currencies share the same convention: 100 minor = 1.00 display,
 * so output is always fixed 2 decimals with thousands separators.
 * Switching currency mode yields identical formatting behaviour.
 */
export function formatMinor(
  minorAmount: number,
  _currency: CurrencyType
): string {
  const display = fromMinor(minorAmount, _currency);
  return display.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Short currency label shown next to amounts. */
export function currencyLabel(currency: CurrencyType): string {
  switch (currency) {
    case "real":
      return "KES";
    case "virtual":
      return "DEMO";

  }
}

/**
 * Chip values are always in DISPLAY units on the UI — so pressing the
   * chip labelled "100" in KES mode bets KES 100, and pressing it in DEMO
   * mode bets 100 DEMO. Components convert to minor (using `toMinor`)
 * *before* storing anything in the bet map / sending to the API.
 */
export const CHIP_VALUES = [2, 5, 10, 15, 20, 30, 40, 120];

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
