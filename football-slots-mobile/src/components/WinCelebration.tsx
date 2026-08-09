import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";
import { CurrencyType, fromMinor } from "../types";

// ============================================================
// Win tiers
// ============================================================

interface WinTier {
  label: string;
  emoji: string;
  color: string;
  bgColor: string;
}

function getWinTier(ratio: number): WinTier {
  if (ratio >= 25)
    return {
      label: "WORLDIE!",
      emoji: "🌍",
      color: "#FFD700",
      bgColor: "rgba(255,215,0,0.15)",
    };
  if (ratio >= 10)
    return {
      label: "GOAL!",
      emoji: "⚽",
      color: "#00FF88",
      bgColor: "rgba(0,255,136,0.12)",
    };
  if (ratio >= 5)
    return {
      label: "GREAT HIT!",
      emoji: "🔥",
      color: "#FF6B35",
      bgColor: "rgba(255,107,53,0.12)",
    };
  if (ratio >= 2)
    return {
      label: "NICE WIN!",
      emoji: "✨",
      color: "#88BBFF",
      bgColor: "rgba(136,187,255,0.12)",
    };
  return {
    label: "WIN!",
    emoji: "🎯",
    color: "#aaa",
    bgColor: "rgba(170,170,170,0.08)",
  };
}

// ============================================================
// Component
// ============================================================

interface Props {
  visible: boolean;
  winAmountMinor: number;
  stakeMinor: number;
  symbol: string;
  multiplier: number;
  currency: CurrencyType;
  onDone: () => void;
}

export function WinCelebration({
  visible,
  winAmountMinor,
  stakeMinor,
  symbol,
  multiplier,
  currency,
  onDone,
}: Props) {
  const winAmount = fromMinor(winAmountMinor, currency);
  const stake = fromMinor(stakeMinor, currency);
  const [show, setShow] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (visible && winAmount > 0) {
      setShow(true);
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.5);

      // Entrance animation
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-dismiss
      const timer = setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          setShow(false);
          onDone();
        });
      }, 2500);

      return () => clearTimeout(timer);
    }
  }, [visible, winAmountMinor]);

  if (!show || winAmountMinor <= 0) return null;

  const tier = getWinTier(winAmount / Math.max(stake, 1));

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      <Animated.View
        style={[styles.card, { transform: [{ scale: scaleAnim }] }]}
      >
        <Text style={styles.emoji}>{tier.emoji}</Text>
        <Text style={[styles.label, { color: tier.color }]}>{tier.label}</Text>
        <Text style={styles.symbolName}>{symbol}</Text>
        <Text style={styles.multiplier}>×{multiplier}</Text>
        <Text style={styles.amount}>{winAmount.toLocaleString()}</Text>
      </Animated.View>
    </Animated.View>
  );
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9000,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  card: {
    backgroundColor: "#1a0d3d",
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#FFD700",
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 15,
    minWidth: 240,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  label: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 4,
  },
  symbolName: {
    color: "#ccc",
    fontSize: 16,
    marginBottom: 4,
  },
  multiplier: {
    color: "#FFD700",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
  },
  amount: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "900",
  },
});
