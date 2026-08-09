import { useEffect, useCallback } from "react";
import { walletApi, mpesaApi } from "../api/client";
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
    if (!isAuthenticated) return;
    try {
      const res = await walletApi.balance(targetCurrency);
      setBalance(targetCurrency, res.data.balance_minor);
    } catch (error: any) {
      if (error.response?.status !== 401) {
        console.error("Failed to fetch balance:", error);
      }
    }
  }, [targetCurrency, setBalance, isAuthenticated]);

  const deposit = useCallback(
    async (phoneNumber: string, amountKES: number) => {
      try {
        const amountMinor = toMinor(amountKES, "real");
        await mpesaApi.deposit(phoneNumber, amountMinor);
        showInfo(
          "STK Push sent to your phone. Complete the payment.",
          "Deposit",
        );
      } catch (error: any) {
        console.error("Deposit failed:", error);
        showError(
          error.response?.data?.message || "Deposit failed. Try again.",
        );
      }
    },
    [showInfo, showError],
  );

  const topupVirtual = useCallback(async () => {
    try {
      const res = await walletApi.topupVirtual();
      setBalance("virtual", res.data.balance_minor);
      showSuccess(
        "Your FUN wallet has been credited with 1,000 FUN credits.",
        "🎉 Refilled!",
      );
    } catch (error) {
      console.error("Failed to refill FUN wallet:", error);
      showError("Failed to refill FUN credits. Try again.");
    }
  }, [setBalance, showSuccess, showError]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchBalance();
    // Poll for balance updates every 30 seconds
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [fetchBalance, isAuthenticated]);

  return { fetchBalance, deposit, topupVirtual };
}

export function useAuthWallet() {
  const { currency, setBalance, setCurrency } = useGameStore();

  const fetchAllBalances = useCallback(async () => {
    for (const c of ["virtual", "real", "bonus"] as CurrencyType[]) {
      try {
        const res = await walletApi.balance(c);
        setBalance(c, res.data.balance_minor);
      } catch {
        // Skip if not authenticated
      }
    }
  }, [setBalance]);

  return { fetchAllBalances };
}
