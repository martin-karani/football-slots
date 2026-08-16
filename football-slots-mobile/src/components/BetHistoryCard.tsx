import { View, Text, StyleSheet } from "react-native";
import { theme } from "./theme";

interface BetHistoryCardProps {
  clubName: string;
  clubColor?: string;
  multiplier: number;
  isWin: boolean;
  stake: string;
  payout: string;
  net: string;
  time: string;
}

/**
 * Bet history card — design reference Section 03.
 * Club monogram badge · WIN/LOSS pill · stake/payout/net stat row.
 */
export function BetHistoryCard({
  clubName,
  clubColor,
  multiplier,
  isWin,
  stake,
  payout,
  net,
  time,
}: BetHistoryCardProps) {
  const netPositive = net.startsWith("+") || parseFloat(net.replace(/[^0-9.-]/g, "")) >= 0;

  // Build 2–3 letter monogram from club name
  const monogram = clubName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

  return (
    <View style={[styles.card, isWin ? styles.cardWin : styles.cardLoss]}>
      {/* Header row */}
      <View style={styles.header}>
        {/* Left: monogram + name + multiplier */}
        <View style={styles.headerLeft}>
          <View style={[styles.monogram, { backgroundColor: clubColor || theme.colors.card }]}>
            <Text style={styles.monogramText}>{monogram}</Text>
          </View>
          <View>
            <Text style={styles.clubName}>{clubName}</Text>
            <Text style={styles.multiplierLabel}>×{multiplier}</Text>
          </View>
        </View>

        {/* Right: WIN / LOSS badge */}
        <View style={[styles.badge, isWin ? styles.badgeWin : styles.badgeLoss]}>
          <Text style={[styles.badgeText, isWin ? styles.badgeTextWin : styles.badgeTextLoss]}>
            {isWin ? "WIN" : "LOSS"}
          </Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>STAKE</Text>
          <Text style={styles.statValue}>{stake}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statLabel}>PAYOUT</Text>
          <Text style={[styles.statValue, isWin && styles.statValueWin]}>{payout}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statLabel}>NET</Text>
          <Text
            style={[
              styles.statValue,
              netPositive ? styles.statValueWin : styles.statValueLoss,
            ]}
          >
            {net}
          </Text>
        </View>
      </View>

      <Text style={styles.time}>{time}</Text>
    </View>
  );
}

const { colors, radius, fonts } = theme;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  cardWin: {
    borderColor: "rgba(47,212,138,0.28)",
    backgroundColor: "rgba(19, 28, 51, 0.9)",
  },
  cardLoss: {
    borderColor: "rgba(255,84,104,0.18)",
  },

  /* Header */
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  monogram: {
    width: 40,
    height: 40,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  monogramText: {
    fontFamily: fonts.bodyBold,
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  clubName: {
    fontFamily: fonts.bodyMedium,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  multiplierLabel: {
    fontFamily: fonts.numbers,
    color: colors.gold,
    fontSize: 13,
    marginTop: 1,
  },

  /* Badge */
  badge: {
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  badgeWin: { backgroundColor: colors.successBg },
  badgeLoss: { backgroundColor: colors.errorBg },
  badgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.8,
    fontWeight: "700",
  },
  badgeTextWin: { color: colors.success },
  badgeTextLoss: { color: colors.error },

  /* Stats strip */
  stats: {
    flexDirection: "row",
    backgroundColor: colors.glassLight,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    overflow: "hidden",
    marginBottom: 10,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 11,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.borderMuted,
  },
  statLabel: {
    fontFamily: fonts.bodyMedium,
    color: colors.textDim,
    fontSize: 9,
    letterSpacing: 0.7,
    marginBottom: 3,
  },
  statValue: {
    fontFamily: fonts.numbers,
    color: colors.textPrimary,
    fontSize: 13,
  },
  statValueWin: { color: colors.success },
  statValueLoss: { color: colors.error },

  time: {
    fontFamily: fonts.body,
    color: colors.textDim,
    fontSize: 11,
    textAlign: "right",
  },
});
