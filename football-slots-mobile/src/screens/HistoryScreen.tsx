import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  StatusBar,
  TouchableOpacity,
} from "react-native";
import { gameApi } from "../api/client";
import { GameRound, formatMinor } from "../types";
import { useGameStore } from "../store/GameProvider";
import { theme } from "../components/theme";
import { EmptyState } from "../components/EmptyState";
import { BetHistoryCard } from "../components/BetHistoryCard";

export function HistoryScreen() {
  const [rounds, setRounds] = useState<GameRound[]>([]);
  const [_loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const isAuthenticated = useGameStore((state) => state.isAuthenticated);
  const currency = useGameStore((state) => state.currency);

  const [filter, setFilter] = useState<"real" | "demo">(
    currency === "real" || currency === "bonus" ? "real" : "demo"
  );

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

  const activeRounds = rounds.filter((item) =>
    filter === "real"
      ? item.currency === "real" || item.currency === "bonus"
      : item.currency === "virtual"
  );

  // Summary stats
  const totalStaked = activeRounds.reduce((s, r) => s + r.total_stake_minor, 0);
  const totalNet = activeRounds.reduce((s, r) => s + r.net_result_minor, 0);
  const wins = activeRounds.filter((r) => r.is_win).length;
  const winRate =
    activeRounds.length > 0
      ? Math.round((wins / activeRounds.length) * 100)
      : 0;

  const clubColors: Record<string, string> = {
    barcelona: "#003DA5",
    real_madrid: "#7c6c3e",
    man_city: "#6CABDD",
    liverpool: "#C8102E",
    paris: "#004170",
    arsenal: "#EF0107",
    bayern: "#DC052D",
    ucl_trophy: "#1B3A6E",
  };

  const renderItem = ({ item }: { item: GameRound }) => {
    const clubInfo = item.result_symbol.replace(/_/g, " ");
    const clubName = clubInfo.charAt(0).toUpperCase() + clubInfo.slice(1);
    const clubColor = clubColors[item.result_symbol] || theme.colors.card;
    const netValue = item.net_result_minor;
    const netPositive = netValue >= 0;

    return (
      <BetHistoryCard
        clubName={clubName}
        clubColor={clubColor}
        multiplier={item.result_multiplier}
        isWin={item.is_win}
        stake={formatMinor(item.total_stake_minor, item.currency)}
        payout={formatMinor(item.gross_payout_minor, item.currency)}
        net={`${netPositive ? "+" : ""}${formatMinor(netValue, item.currency)}`}
        time={formatDate(item.created_at)}
      />
    );
  };

  const isRealFilter = filter === "real";

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Bet History</Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, isRealFilter && styles.tabActiveReal]}
          onPress={() => setFilter("real")}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, isRealFilter && styles.tabTextActiveReal]}>
            REAL
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, !isRealFilter && styles.tabActiveDemo]}
          onPress={() => setFilter("demo")}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, !isRealFilter && styles.tabTextActiveDemo]}>
            DEMO
          </Text>
        </TouchableOpacity>
      </View>

      {/* Summary Strip */}
      {activeRounds.length > 0 && (
        <View style={styles.summaryStrip}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Staked</Text>
            <Text style={styles.summaryValue}>
              {formatMinor(totalStaked, isRealFilter ? "real" : "virtual")}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Net</Text>
            <Text
              style={[
                styles.summaryValue,
                totalNet >= 0 ? styles.summaryPositive : styles.summaryNegative,
              ]}
            >
              {totalNet >= 0 ? "+" : ""}
              {formatMinor(totalNet, isRealFilter ? "real" : "virtual")}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Win rate</Text>
            <Text style={styles.summaryValue}>{winRate}%</Text>
          </View>
        </View>
      )}

      <FlatList
        data={activeRounds}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchHistory();
            }}
            tintColor={theme.colors.gold}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="football-outline"
            title={`No ${isRealFilter ? "REAL" : "DEMO"} spins yet`}
            message={`Spin in ${isRealFilter ? "REAL" : "DEMO"} mode to see your history here`}
          />
        }
      />
    </View>
  );
}

const { colors, radius, spacing, fonts } = theme;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  header: {
    paddingHorizontal: spacing.md,
    paddingTop: 56,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontFamily: fonts.heading,
    color: colors.textPrimary,
    fontSize: 22,
    letterSpacing: 0.5,
  },

  /* Filter Tabs */
  tabRow: {
    flexDirection: "row",
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: radius.sm,
  },
  tabActiveReal: {
    backgroundColor: colors.realLight,
    borderWidth: 1,
    borderColor: colors.realBorder,
  },
  tabActiveDemo: {
    backgroundColor: colors.demoLight,
    borderWidth: 1,
    borderColor: colors.demoBorder,
  },
  tabText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.textDim,
  },
  tabTextActiveReal: { color: colors.gold },
  tabTextActiveDemo: { color: colors.success },

  /* Summary Strip */
  summaryStrip: {
    flexDirection: "row",
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    overflow: "hidden",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: colors.borderMuted,
  },
  summaryLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textDim,
    marginBottom: 3,
  },
  summaryValue: {
    fontFamily: fonts.numbers,
    fontSize: 14,
    color: colors.textPrimary,
  },
  summaryPositive: { color: colors.success },
  summaryNegative: { color: colors.error },

  list: { paddingHorizontal: spacing.md, gap: 10, paddingBottom: 40, paddingTop: 4 },
});
