import { View, Text, StyleSheet } from "react-native";
import { theme } from "./theme";

interface BalanceCardProps {
  label: string;
  amount: string;
  subtext?: string;
  variant?: "real" | "demo" | "bonus";
}

/**
 * Premium balance card with mode-specific color treatment matching the redesign bundle.
 */
export function BalanceCard({
  label,
  amount,
  subtext,
  variant = "real",
}: BalanceCardProps) {
  const variantConfig = {
    real: {
      bg: "rgba(29, 42, 80, 0.45)",
      border: "rgba(231, 200, 119, 0.28)",
      accent: theme.colors.gold,
      dot: theme.colors.gold,
    },
    demo: {
      bg: "rgba(16, 26, 50, 0.6)",
      border: "rgba(47, 212, 138, 0.28)",
      accent: theme.colors.success,
      dot: theme.colors.success,
    },
    bonus: {
      bg: "rgba(20, 17, 39, 0.6)",
      border: "rgba(196, 162, 255, 0.35)",
      accent: theme.colors.bonusAccent,
      dot: theme.colors.bonusAccent,
    },
  };

  const v = variantConfig[variant];

  // Split amount into integer and decimals for display styling if formatted with dot
  const parts = amount.split(".");

  return (
    <View style={[styles.card, { backgroundColor: v.bg, borderColor: v.border }]}>
      <View style={styles.labelRow}>
        <View style={[styles.indicatorDot, { backgroundColor: v.dot }]} />
        <Text style={[styles.label, { color: v.accent }]}>{label}</Text>
      </View>
      <Text style={styles.amount}>
        {parts[0]}
        {parts.length > 1 && <Text style={styles.amountDecimals}>.{parts[1]}</Text>}
      </Text>
      {subtext && <Text style={styles.subtext}>{subtext}</Text>}
    </View>
  );
}

const { colors, radius, fonts } = theme;

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    paddingVertical: 24,
    paddingHorizontal: 22,
    alignItems: "flex-start",
    position: "relative",
    overflow: "hidden",
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  indicatorDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  label: {
    fontFamily: fonts.heading,
    fontSize: 11.5,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  amount: {
    fontFamily: fonts.numbers,
    fontSize: 38,
    color: colors.textPrimary,
    letterSpacing: 0.5,
    lineHeight: 44,
  },
  amountDecimals: {
    fontSize: 22,
    color: colors.textMuted,
  },
  subtext: {
    fontFamily: fonts.body,
    color: colors.textDim,
    fontSize: 12.5,
    marginTop: 6,
  },
});
