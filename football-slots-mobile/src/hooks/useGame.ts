import { useCallback, useState, useEffect } from "react";
import { Alert } from "react-native";
import { gameApi, walletApi } from "../api/client";
import { useGameStore } from "../store/GameProvider";
import { useWheelAnimator } from "./useWheelAnimator";
import { useToast } from "../components/Toast";
import { useSound } from "./useSound";

export function useGame(callbacks?: { onStakeDeducted?: () => void; onWin?: () => void }) {
  const currency = useGameStore((state) => state.currency);
  const currentBets = useGameStore((state) => state.currentBets);
  const balances = useGameStore((state) => state.balances);
  const setBalance = useGameStore((state) => state.setBalance);
  const setSpinning = useGameStore((state) => state.setSpinning);
  const setLastSpin = useGameStore((state) => state.setLastSpin);
  const updateBalance = useGameStore((state) => state.updateBalance);
  const clearBets = useGameStore((state) => state.clearBets);
  const getTotalStake = useGameStore((state) => state.getTotalStake);
  const isSpinning = useGameStore((state) => state.isSpinning);

  const [isAutoSpinning, setIsAutoSpinning] = useState(false);

  const { step, startSpin, stopOnIndex, stopAnimation } = useWheelAnimator();
  const { showSuccess, showError, showWarning } = useToast();
  const { play: playSound, stop: stopSound } = useSound();

  const generateClientSeed = useCallback(() => {
    return Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join("");
  }, []);

  const spin = useCallback(async () => {
    if (useGameStore.getState().isSpinning) {
      return;
    }
    const totalStake = getTotalStake();
    if (totalStake === 0) {
      showWarning("Place at least one bet", "Place Bet");
      return;
    }

    if (balances[currency] < totalStake) {
      if (currency === "virtual") {
        Alert.alert(
          "Low FUN Balance 🎮",
          "You ran out of FUN play credits! Would you like a free refill of 1,000 FUN?",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "🎁 Refill 1,000 FUN",
              onPress: async () => {
                try {
                  const res = await walletApi.topupVirtual();
                  setBalance("virtual", res.data.balance_minor);
                  showSuccess("1,000 FUN credits added! You can spin now.", "🎉 Refilled!");
                } catch {
                  showError("Failed to refill credits. Try again.");
                }
              },
            },
          ],
        );
      } else {
        showWarning("Insufficient balance", "Balance");
      }
      return;
    }

    // ── Deduct stake immediately on GO press ──────────────────────────
    updateBalance(currency, -totalStake);
    callbacks?.onStakeDeducted?.();

    setSpinning(true);
    startSpin();
    const spinStartTime = Date.now();
    playSound('spin_start');

    try {
      const clientSeed = generateClientSeed();
      const res = await gameApi.spin(currency, currentBets, clientSeed);
      const result = res.data;

      const elapsed = Date.now() - spinStartTime;
      await stopOnIndex(result.position - 1, elapsed);

      // Stop wheel spin audio so tail doesn't overlap celebration sound
      stopSound('spin_start');

      // Reel stop click when the wheel lands exactly on sound landing hit
      playSound('reel_stop');

      setLastSpin(result);
      // Only credit the gross_payout — stake was already deducted above
      if (result.gross_payout > 0) {
        updateBalance(currency, result.gross_payout);
      }
      clearBets();

      if (result.is_win) {
        callbacks?.onWin?.();
        // Determine win tier for sound
        const winRatio = result.gross_payout / totalStake;
        if (winRatio >= 25) {
          playSound('win_jackpot');
        } else if (winRatio >= 5) {
          playSound('win_big');
        } else {
          playSound('win_small');
        }
      } else {
        playSound('loss');
      }
    } catch (error: any) {
      console.error("Spin failed:", error);
      stopAnimation();
      stopSound('spin_start');
      // Refund the stake since the spin never executed
      updateBalance(currency, totalStake);
      const message =
        error.response?.data?.message || "Spin failed. Try again.";
      showError(message);
    } finally {
      setSpinning(false);
    }
  }, [
    getTotalStake,
    balances,
    currency,
    setBalance,
    setSpinning,
    generateClientSeed,
    currentBets,
    setLastSpin,
    updateBalance,
    clearBets,
    startSpin,
    stopOnIndex,
    stopAnimation,
    showSuccess,
    showError,
    showWarning,
    callbacks,
  ]);

  const toggleAutoSpin = useCallback(() => {
    setIsAutoSpinning((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!isAutoSpinning || isSpinning) return;

    const intervalId = setInterval(() => {
      const stake = getTotalStake();
      if (stake === 0 || balances[currency] < stake) {
        setIsAutoSpinning(false);
        return;
      }
      spin();
    }, 2500);

    return () => clearInterval(intervalId);
  }, [isAutoSpinning, isSpinning, balances, currency, getTotalStake, spin]);

  return { spin, step, isAutoSpinning, toggleAutoSpin };
}
