import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  StatusBar,
} from "react-native";
import { gameApi } from "../api/client";
import { GameRound, formatMinor } from "../types";
import { useGameStore } from "../store/GameProvider";
import { theme } from "../components/theme";

export function HistoryScreen() {
  const [rounds, setRounds] = useState<GameRound[]>([]);
  const [_loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const isAuthenticated = useGameStore((state) => state.isAuthenticated);

  const fetchHistory = async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const res = await gameApi.history();
      setRounds(res.data.rounds);
    } catch (error: any) {
      if (error.response?.status !== 401) {
        console.error("Failed to fetch history:", error);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) fetchHistory();
  }, [isAuthenticated]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-KE", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderItem = ({ item, index }: { item: GameRound; index: number }) => (
    <View style={[styles.card, item.is_win && styles.winCard]}>
      {/* Card header */}
      <View style={styles.cardHeader}>
        <View style={styles.symbolWrap}>
          <Text style={styles.symbolText}>
            {item.result_symbol.replace(/_/g, " ")}
          </Text>
          <Text style={styles.multiplierText}>×{item.result_multiplier}</Text>
        </View>
        <View
          style={[
            styles.badge,
            item.is_win ? styles.badgeWin : styles.badgeLoss,
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              item.is_win ? styles.badgeTextWin : styles.badgeTextLoss,
            ]}
          >
            {item.is_win ? "WIN" : "LOSS"}
          </Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Stake</Text>
          <Text style={styles.statValue}>
            {formatMinor(item.total_stake_minor, item.currency)}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Payout</Text>
          <Text style={[styles.statValue, item.is_win && styles.winValue]}>
            {formatMinor(item.gross_payout_minor, item.currency)}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Net</Text>
          <Text
            style={[
              styles.statValue,
              item.net_result_minor >= 0 ? styles.winValue : styles.lossValue,
            ]}
          >
            {item.net_result_minor >= 0 ? "+" : ""}
            {formatMinor(item.net_result_minor, item.currency)}
          </Text>
        </View>
      </View>

      {/* Date */}
      <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
    </View>
  );

  const currency = useGameStore((state) => state.currency);
  const isRealMode = currency === "real" || currency === "bonus";

  const activeRounds = rounds.filter((item) =>
    isRealMode
      ? item.currency === "real" || item.currency === "bonus"
      : item.currency === "virtual"
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <FlatList
        data={activeRounds}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={[styles.modeBanner, !isRealMode ? styles.modeBannerFun : styles.modeBannerReal]}>
            <Text style={styles.modeBannerIcon}>{!isRealMode ? "🎮" : "💰"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.modeBannerTitle}>
                {!isRealMode ? "FUN Mode Bet History" : "REAL Mode Bet History"}
              </Text>
              <Text style={styles.modeBannerSub}>
                {!isRealMode ? "Showing Free Play Spins" : "Showing M-Pesa Real Money Spins"}
              </Text>
            </View>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchHistory();
            }}
            tintColor={colors.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>⚽</Text>
            <Text style={styles.emptyTitle}>No {!isRealMode ? "FUN" : "REAL"} spins yet</Text>
            <Text style={styles.emptyHint}>
              Spin in {!isRealMode ? "FUN" : "REAL"} mode to see your history here
            </Text>
          </View>
        }
      />
    </View>
  );
}

const { colors, radius, spacing, shadows } = theme;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, gap: 10, paddingBottom: 40 },

  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    ...shadows.sm,
  },
  winCard: { borderColor: colors.positive },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  symbolWrap: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  symbolText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  multiplierText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "700",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  badgeWin: { backgroundColor: colors.positiveLight },
  badgeLoss: { backgroundColor: colors.negativeLight },
  badgeText: { fontSize: 11, fontWeight: "700" },
  badgeTextWin: { color: colors.positive },
  badgeTextLoss: { color: colors.negative },

  statsRow: {
    flexDirection: "row",
    backgroundColor: colors.glassLight,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  statItem: { flex: 1, alignItems: "center", paddingVertical: 10 },
  statDivider: { width: 1, backgroundColor: colors.glassMedium },
  statLabel: { color: colors.textMuted, fontSize: 10, marginBottom: 3 },
  statValue: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  winValue: { color: colors.positive },
  lossValue: { color: colors.negative },

  dateText: {
    color: colors.textDim,
    fontSize: 10,
    marginTop: 10,
    textAlign: "right",
  },

  empty: { alignItems: "center", paddingVertical: 80 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  emptyHint: { color: colors.textMuted, fontSize: 13, marginTop: 6 },

  modeBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: radius.md,
    marginBottom: 12,
    gap: 12,
  },
  modeBannerFun: { backgroundColor: colors.funLight, borderWidth: 1, borderColor: colors.fun },
  modeBannerReal: { backgroundColor: colors.realLight, borderWidth: 1, borderColor: colors.real },
  modeBannerIcon: { fontSize: 24 },
  modeBannerTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  modeBannerSub: { color: colors.textMuted, fontSize: 12 },
});
