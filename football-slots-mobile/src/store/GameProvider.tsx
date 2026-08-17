import { create } from "zustand";
import { CurrencyType, BetMap, SpinResult } from "../types";

interface GameState {
  // Auth
  isAuthenticated: boolean;
  phoneNumber: string;
  kycStatus: string;
  setAuth: (phone: string, kyc: string) => void;
  clearAuth: () => void;

  // Currency
  currency: CurrencyType;
  setCurrency: (c: CurrencyType) => void;

  // Balances
  balances: Record<CurrencyType, number>;
  updateBalance: (currency: CurrencyType, amount: number) => void;
  setBalance: (currency: CurrencyType, balance: number) => void;

  // Betting
  currentBets: BetMap;
  selectedChip: number;
  setSelectedChip: (chip: number) => void;
  placeBet: (symbol: string, amount: number) => void;
  removeBet: (symbol: string, amount: number) => void;
  clearBets: () => void;
  getTotalStake: () => number;

  // Game state
  isSpinning: boolean;
  lastSpin: SpinResult | null;
  setSpinning: (v: boolean) => void;
  setLastSpin: (result: SpinResult | null) => void;

  // Preferences
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  // Auth
  isAuthenticated: false,
  phoneNumber: "",
  kycStatus: "none",
  setAuth: (phone, kyc) =>
    set({ isAuthenticated: true, phoneNumber: phone, kycStatus: kyc }),
  clearAuth: () =>
    set({ isAuthenticated: false, phoneNumber: "", kycStatus: "none" }),

  // Currency
  currency: "virtual",
  setCurrency: (c) => set({ currency: c }),

  // Balances
  balances: { virtual: 0, real: 0 },
  updateBalance: (currency, amount) =>
    set((state) => {
      if (amount === 0) return state;
      return {
        balances: {
          ...state.balances,
          [currency]: state.balances[currency] + amount,
        },
      };
    }),
  setBalance: (currency, balance) =>
    set((state) => {
      if (state.balances[currency] === balance) return state;
      return {
        balances: { ...state.balances, [currency]: balance },
      };
    }),

  // Betting
  currentBets: {},
  selectedChip: 10,
  setSelectedChip: (chip) => set({ selectedChip: chip }),
  placeBet: (symbol, amount) =>
    set((state) => ({
      currentBets: {
        ...state.currentBets,
        [symbol]: (state.currentBets[symbol] || 0) + amount,
      },
    })),
  removeBet: (symbol, amount) =>
    set((state) => {
      const newBets = { ...state.currentBets };
      newBets[symbol] = Math.max(0, (newBets[symbol] || 0) - amount);
      if (newBets[symbol] === 0) delete newBets[symbol];
      return { currentBets: newBets };
    }),
  clearBets: () => set({ currentBets: {} }),
  getTotalStake: () => {
    const bets = get().currentBets;
    return Object.values(bets).reduce((sum, val) => sum + val, 0);
  },

  // Game state
  isSpinning: false,
  lastSpin: null,
  setSpinning: (v) => set({ isSpinning: v }),
  setLastSpin: (result) => set({ lastSpin: result }),

  // Preferences
  soundEnabled: true,
  setSoundEnabled: (v) => set({ soundEnabled: v }),
}));

// ============================================================
// Provider component for easy access
// ============================================================

interface GameProviderProps {
  children: import("react").ReactNode;
}

export function GameProvider({ children }: GameProviderProps) {
  return <>{children}</>;
}