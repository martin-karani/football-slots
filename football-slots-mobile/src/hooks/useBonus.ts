import { useCallback } from "react";
import { bonusApi, walletApi } from "../api/client";
import { useGameStore } from "../store/GameProvider";

/**
 * Fetches authoritative bonus state (status + balances) from the server
 * and syncs the store. Call on mount and after any spin that touches
 * the bonus meter/grant, since the optimistic per-spin updates don't
 * cover claim/conversion/wagering side-effects.
 */
export function useBonus() {
  const setBonusStatus = useGameStore((state) => state.setBonusStatus);
  const setBalance = useGameStore((state) => state.setBalance);

  const refreshBonus = useCallback(async () => {
    try {
      const [statusRes, realBalRes] = await Promise.all([
        bonusApi.status(),
        walletApi.balance("real"),
      ]);
      setBonusStatus(statusRes.data);
      // status already carries the current bonus balance — no extra call needed
      setBalance("bonus", statusRes.data.bonus_balance_minor);
      setBalance("real", realBalRes.data.balance_minor);
    } catch (e: any) {
      if (e?.response?.status !== 401) {
        console.error("Failed to refresh bonus state:", e);
      }
    }
  }, [setBonusStatus, setBalance]);

  return { refreshBonus };
}
