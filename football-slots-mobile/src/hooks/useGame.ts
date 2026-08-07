import { useCallback, useState, useRef, useEffect } from "react";
import { Alert } from "react-native";
import { gameApi, walletApi } from "../api/client";
import { useGameStore } from "../store/GameProvider";
import { useWheelAnimator } from "./useWheelAnimator";

export function useGame() {
  const currency = useGameStore((state) => state.currency);
  const currentBets = useGameStore((state) => state.currentBets);
  const balances = useGameStore((state) => state.balances);
  const setBalance = useGameStore((state) => state.setBalance);
  const setSpinning = useGameStore((state) => state.setSpinning);
  const setLastSpin = useGameStore((state) => state.setLastSpin);
  const setLastGamble = useGameStore((state) => state.setLastGamble);
  const updateBalance = useGameStore((state) => state.updateBalance);
  const clearBets = useGameStore((state) => state.clearBets);
  const setShowGambleModal = useGameStore((state) => state.setShowGambleModal);
  const lastSpin = useGameStore((state) => state.lastSpin);
  const getTotalStake = useGameStore((state) => state.getTotalStake);
  const isSpinning = useGameStore((state) => state.isSpinning);

  const [isAutoSpinning, setIsAutoSpinning] = useState(false);

  const { step, startSpin, stopOnIndex, stopAnimation } = useWheelAnimator();

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
      Alert.alert("Place Bet", "Place at least one bet");
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
                  Alert.alert(
                    "🎉 Refilled!",
                    "1,000 FUN credits added! You can spin now.",
                  );
                } catch {
                  Alert.alert("Error", "Failed to refill credits. Try again.");
                }
              },
            },
          ],
        );
      } else {
        Alert.alert("Balance", "Insufficient balance");
      }
      return;
    }

    setSpinning(true);
    startSpin();

    try {
      const clientSeed = generateClientSeed();
      const res = await gameApi.spin(currency, currentBets, clientSeed);
      const result = res.data;

      await stopOnIndex(result.position - 1);

      setLastSpin(result);
      updateBalance(currency, result.net_result);
      clearBets();

      if (result.is_win) {
        setTimeout(() => setShowGambleModal(true), 1500);
      }
    } catch (error: any) {
      console.error("Spin failed:", error);
      stopAnimation();
      const message =
        error.response?.data?.message || "Spin failed. Try again.";
      Alert.alert("Error", message);
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
    setShowGambleModal,
    startSpin,
    stopOnIndex,
    stopAnimation,
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

  const gamble = useCallback(
    async (choice: "home" | "away") => {
      if (!lastSpin?.round_id) return;

      setShowGambleModal(false);

      try {
        const clientSeed = generateClientSeed();
        const res = await gameApi.gamble(lastSpin.round_id, choice, clientSeed);
        const result = res.data;

        setLastGamble(result);
        updateBalance(currency, result.net_result_minor);

        if (result.won) {
          Alert.alert(
            "Gamble",
            `🎉 You won the gamble! +${result.payout_minor}`,
          );
        } else {
          Alert.alert("Gamble", "😔 Gamble lost. Better luck next time!");
        }
      } catch (error: any) {
        console.error("Gamble failed:", error);
        Alert.alert("Error", "Gamble failed. Try again.");
      }
    },
    [
      lastSpin,
      setShowGambleModal,
      generateClientSeed,
      setLastGamble,
      updateBalance,
      currency,
    ],
  );



  return { spin, gamble, step, isAutoSpinning, toggleAutoSpin };
}
