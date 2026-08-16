import { View, Text, StyleSheet } from "react-native";
import { theme } from "./theme";

type Tier = "COMMON" | "MID" | "RARE" | "JACKPOT";

const TIER_STYLES: Record<Tier, { bg: string; fg: string }> = {
  COMMON: { bg: "rgba(148,163,208,0.14)", fg: theme.colors.textMuted },
  MID: { bg: "rgba(76,141,255,0.14)", fg: theme.colors.blue },
  RARE: { bg: "rgba(196,162,255,0.14)", fg: theme.colors.bonusAccent },
  JACKPOT: { bg: "rgba(231,200,119,0.18)", fg: theme.colors.gold },
};

interface PaytableRowProps {
  name: string;
  tier: string;
  probability: string;
  multiplier: number;
  color: string;
  icon?: any;
}

export function PaytableRow({
  name,
  tier,
  probability,
  multiplier,
  color,
  icon: Icon,
}: PaytableRowProps) {
  const normalizedTier = (tier.toUpperCase() as Tier) in TIER_STYLES
    ? (tier.toUpperCase() as Tier)
    : "COMMON";
  const tierStyle = TIER_STYLES[normalizedTier];

  // Build monogram from name
  const monogram = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

  return (
    <View style={styles.row}>
      {/* Club monogram card */}
      <View style={[styles.monogramBox, { backgroundColor: color + "22", borderColor: color + "44" }]}>
        {Icon ? (
          <Icon width={22} height={22} />
        ) : (
          <Text style={[styles.monogramText, { color }]}>{monogram}</Text>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.name}>{name}</Text>
        <View style={styles.meta}>
          {/* Tier badge */}
          <View style={[styles.tierBadge, { backgroundColor: tierStyle.bg }]}>
            <Text style={[styles.tierText, { color: tierStyle.fg }]}>{normalizedTier}</Text>
          </View>
          <Text style={styles.probability}>{probability} hit</Text>
        </View>
      </View>

      {/* Multiplier */}
      <Text style={styles.multiplier}>×{multiplier}</Text>
    </View>
  );
}

const { colors, radius, fonts } = theme;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 13,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    gap: 12,
  },
  monogramBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  monogramText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    fontWeight: "700",
  },
  info: {
    flex: 1,
  },
  name: {
    fontFamily: fonts.bodyMedium,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 5,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  tierBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  tierText: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  probability: {
    fontFamily: fonts.body,
    color: colors.textDim,
    fontSize: 11,
  },
  multiplier: {
    fontFamily: fonts.numbers,
    color: colors.gold,
    fontSize: 20,
    fontWeight: "900",
  },
});
