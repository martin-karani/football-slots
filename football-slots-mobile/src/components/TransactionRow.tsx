import { View, Text, StyleSheet } from "react-native";
import { theme } from "./theme";

type GlyphType = "deposit" | "withdraw" | "bet" | "win";
type StatusType = "COMPLETED" | "PROCESSING" | "SETTLED" | "CREDITED" | "FAILED";

interface TransactionRowProps {
  /** Semantic transaction type drives the colored glyph square */
  type?: GlyphType;
  /** Legacy icon name — kept for backwards compat, ignored in favour of `type` */
  icon?: string;
  title: string;
  description?: string;
  amount: string;
  amountType?: "positive" | "negative" | "neutral";
  status?: string;
  time?: string;
}

const GLYPHS: Record<GlyphType, { symbol: string; bg: string; fg: string }> = {
  deposit: { symbol: "↓", bg: "rgba(47,212,138,0.14)", fg: theme.colors.success },
  withdraw: { symbol: "↑", bg: "rgba(231,200,119,0.14)", fg: theme.colors.gold },
  bet: { symbol: "•", bg: "rgba(76,141,255,0.14)", fg: theme.colors.blue },
  win: { symbol: "★", bg: "rgba(47,212,138,0.14)", fg: theme.colors.success },
};

const STATUS_STYLES: Record<
  StatusType,
  { bg: string; fg: string; label: string }
> = {
  COMPLETED: { bg: "rgba(47,212,138,0.14)", fg: theme.colors.success, label: "COMPLETED" },
  PROCESSING: { bg: "rgba(231,200,119,0.16)", fg: theme.colors.warning, label: "PROCESSING" },
  SETTLED: { bg: "rgba(76,141,255,0.14)", fg: theme.colors.blue, label: "SETTLED" },
  CREDITED: { bg: "rgba(196,162,255,0.14)", fg: theme.colors.bonusAccent, label: "CREDITED" },
  FAILED: { bg: "rgba(255,84,104,0.14)", fg: theme.colors.error, label: "FAILED" },
};

/**
 * Single transaction row for activity/history feeds.
 * Renders a colored glyph square (↓ ↑ • ★) and a status badge.
 */
export function TransactionRow({
  type = "deposit",
  title,
  description,
  amount,
  amountType = "neutral",
  status,
  time,
}: TransactionRowProps) {
  const glyph = GLYPHS[type];

  const amountColor = {
    positive: theme.colors.success,
    negative: theme.colors.error,
    neutral: theme.colors.textPrimary,
  }[amountType];

  // Resolve status style — fall back gracefully
  const normalizedStatus = (status?.toUpperCase() as StatusType) ?? undefined;
  const statusStyle = normalizedStatus ? STATUS_STYLES[normalizedStatus] ?? null : null;

  return (
    <View style={styles.row}>
      {/* Glyph square */}
      <View style={[styles.glyphBox, { backgroundColor: glyph.bg }]}>
        <Text style={[styles.glyphText, { color: glyph.fg }]}>{glyph.symbol}</Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {description && <Text style={styles.description}>{description}</Text>}
        {time && <Text style={styles.time}>{time}</Text>}
      </View>

      {/* Right */}
      <View style={styles.right}>
        <Text style={[styles.amount, { color: amountColor }]}>{amount}</Text>
        {statusStyle && (
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.fg }]}>
              {statusStyle.label}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const { colors, radius, fonts } = theme;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 4,
  },
  glyphBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 13,
  },
  glyphText: {
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 22,
  },
  content: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontFamily: fonts.bodyMedium,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  description: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  time: {
    fontFamily: fonts.body,
    color: colors.textDim,
    fontSize: 11,
    marginTop: 2,
  },
  right: {
    alignItems: "flex-end",
    gap: 5,
  },
  amount: {
    fontFamily: fonts.numbers,
    fontSize: 14,
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  statusText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 9,
    letterSpacing: 0.5,
    fontWeight: "600",
  },
});
