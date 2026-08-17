import { useEffect, useCallback } from "react";
import { walletApi, paymentsApi } from "../api/client";
import { useGameStore } from "../store/GameProvider";
import { CurrencyType, toMinor } from "../types";
import { useToast } from "../components/Toast";

export function useWallet(currency?: CurrencyType) {
  const activeCurrency = useGameStore((state) => state.currency);
  const setBalance = useGameStore((state) => state.setBalance);
  const isAuthenticated = useGameStore((state) => state.isAuthenticated);
  const targetCurrency = currency || activeCurrency;
  const { showSuccess, showError, showInfo } = useToast();

  const fetchBalance = useCallback(async () => {
    if (!isAuthenticated || useGameStore.getState().isSpinning) return;
    try {
      const res = await walletApi.balance(targetCurrency);
      if (useGameStore.getState().isSpinning) return;
      setBalance(targetCurrency, res.data.balance_minor);
    } catch (error: any) {
      if (error.response?.status !== 401) {
        console.error("Failed to fetch balance:", error);
      }
    }
  }, [targetCurrency, setBalance, isAuthenticated]);

  // Generate an idempotency key per user action.
  const generateIdempotencyKey = useCallback((action: string) => {
    const phone = useGameStore.getState().phoneNumber || "anon";
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    return `${action}:${phone}:${timestamp}:${random}`;
  }, []);

  const deposit = useCallback(
    async (provider: string, phoneNumber: string, amountKES: number) => {
      const amountMinor = toMinor(amountKES, "real");
      const idempotencyKey = generateIdempotencyKey("deposit");
      const res = await paymentsApi.deposit(
        provider,
        phoneNumber,
        amountMinor,
        idempotencyKey,
      );
      // Initiate background balance refresh
      fetchBalance();
      setTimeout(fetchBalance, 8000);
      return res.data;
    },
    [generateIdempotencyKey, fetchBalance],
  );

  const withdraw = useCallback(
    async (provider: string, phoneNumber: string, amountKES: number) => {
      const amountMinor = toMinor(amountKES, "real");
      const idempotencyKey = generateIdempotencyKey("withdraw");
      const res = await paymentsApi.withdraw(
        provider,
        phoneNumber,
        amountMinor,
        idempotencyKey,
      );
      // The balance drops the moment the backend holds the funds, so
      // refresh right away, then again once the result usually lands.
      fetchBalance();
      setTimeout(fetchBalance, 8000);
      return res.data;
    },
    [fetchBalance, generateIdempotencyKey],
  );

  const topupVirtual = useCallback(async () => {
    try {
      const res = await walletApi.topupVirtual();
      setBalance("virtual", res.data.balance_minor);
      showSuccess(
        "Your DEMO wallet has been credited with 1,000 DEMO credits.",
        "🎉 Refilled!",
      );
    } catch (error) {
      console.error("Failed to refill DEMO wallet:", error);
      showError("Failed to refill DEMO credits. Try again.");
    }
  }, [setBalance, showSuccess, showError]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchBalance();
    // Poll for balance updates every 30 seconds
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [fetchBalance, isAuthenticated]);

  return { fetchBalance, deposit, withdraw, topupVirtual };
}

export function useAuthWallet() {
  const { currency, setBalance, setCurrency } = useGameStore();

  const fetchAllBalances = useCallback(async () => {
    if (useGameStore.getState().isSpinning) return;
    for (const c of ["virtual", "real"] as CurrencyType[]) {
      try {
        const res = await walletApi.balance(c);
        if (useGameStore.getState().isSpinning) return;
        setBalance(c, res.data.balance_minor);
      } catch {
        // Skip if not authenticated
      }
    }
  }, [setBalance]);

  return { fetchAllBalances };
}
