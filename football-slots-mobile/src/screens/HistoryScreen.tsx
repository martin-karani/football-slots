import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  StatusBar,
  TouchableOpacity,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { gameApi } from "../api/client";
import { GameRound, SYMBOLS } from "../types";
import { useGameStore } from "../store/GameProvider";
import { theme } from "../components/theme";
import { EmptyState } from "../components/EmptyState";

export function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [rounds, setRounds] = useState<GameRound[]>([]);
  const [_loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const isAuthenticated = useGameStore((state) => state.isAuthenticated);
  const currency = useGameStore((state) => state.currency);

  const [filter, setFilter] = useState<"real" | "demo">(
    currency === "real" ? "real" : "demo"
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
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMin / 60);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;

    return date.toLocaleDateString("en-KE", {
      day: "2-digit",
      month: "short",
    });
  };

  const activeRounds = rounds.filter((item) =>
    filter === "real"
      ? item.currency === "real"
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

  const isRealFilter = filter === "real";

  const renderItem = ({ item }: { item: GameRound }) => {
    const symbolDef = SYMBOLS.find((s) => s.key === item.result_symbol);
    const ClubIcon = symbolDef?.icon;
    const clubName = symbolDef?.name || item.result_symbol.replace(/_/g, " ");
    const clubColor = symbolDef?.color || "#FFD700";

    const isWin = item.is_win;
    const netValueMinor = item.net_result_minor;
    const isNetPositive = netValueMinor >= 0;
    const netFormatted = `${isNetPositive ? "+" : "−"}${(
      Math.abs(netValueMinor) / 100
    ).toLocaleString()}`;
    const stakeFormatted = `KES ${(item.total_stake_minor / 100).toLocaleString()}`;
    const payoutFormatted = `KES ${(item.gross_payout_minor / 100).toLocaleString()}`;

    return (
      <View style={styles.betCard}>
        {/* Top row */}
        <View style={styles.cardTopRow}>
          <View
            style={[
              styles.clubIconBox,
              {
                backgroundColor: clubColor + "22",
                borderColor: clubColor + "55",
              },
            ]}
          >
            {ClubIcon ? (
              <ClubIcon width={24} height={24} />
            ) : (
              <Text style={styles.clubIconFallback}>
                {item.result_symbol.slice(0, 3).toUpperCase()}
              </Text>
            )}
          </View>
          <View style={styles.clubMeta}>
            <Text style={styles.clubName}>{clubName}</Text>
            <Text style={styles.clubMult}>×{item.result_multiplier}</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              isWin ? styles.statusBadgeWin : styles.statusBadgeLoss,
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                isWin ? styles.statusBadgeTextWin : styles.statusBadgeTextLoss,
              ]}
            >
              {isWin ? "WIN" : "LOSS"}
            </Text>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.cardDivider} />

        {/* Bottom row */}
        <View style={styles.cardBottomRow}>
          <View style={styles.statsLeft}>
            <View>
              <Text style={styles.statLabel}>Stake</Text>
              <Text style={styles.statValue}>{stakeFormatted}</Text>
            </View>
            <View>
              <Text style={styles.statLabel}>Payout</Text>
              <Text style={styles.statValue}>{payoutFormatted}</Text>
            </View>
          </View>

          <View style={styles.statsRight}>
            <Text style={styles.timeText}>{formatDate(item.created_at)}</Text>
            <Text
              style={[
                styles.netValue,
                isNetPositive ? styles.netPositive : styles.netNegative,
              ]}
            >
              {netFormatted}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#5c0090" />

      {/* Header with Back + REAL/DEMO Toggle */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 14) + 6 }]}>
        <TouchableOpacity
          style={styles.headerBack}
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Game"))}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>BET HISTORY</Text>
        <View style={styles.modeToggleGroup}>
          <Pressable
            style={[styles.toggleBtn, isRealFilter && styles.toggleBtnActiveReal]}
            onPress={() => setFilter("real")}
            hitSlop={8}
          >
            <Text
              style={[
                styles.toggleText,
                isRealFilter && styles.toggleTextActiveReal,
              ]}
            >
              REAL
            </Text>
          </Pressable>
          <Pressable
            style={[styles.toggleBtn, !isRealFilter && styles.toggleBtnActiveDemo]}
            onPress={() => setFilter("demo")}
            hitSlop={8}
          >
            <Text
              style={[
                styles.toggleText,
                !isRealFilter && styles.toggleTextActiveDemo,
              ]}
            >
              DEMO
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Summary Strip (3 Columns) */}
      <View style={styles.summaryStrip}>
        <View style={[styles.summaryCol, styles.summaryColBorder]}>
          <Text style={styles.summaryValue}>
            {(totalStaked / 100).toLocaleString()}
          </Text>
          <Text style={styles.summaryLabel}>Staked</Text>
        </View>
        <View style={[styles.summaryCol, styles.summaryColBorder]}>
          <Text
            style={[
              styles.summaryValue,
              totalNet >= 0 ? styles.netPositive : styles.netNegative,
            ]}
          >
            {totalNet >= 0 ? "+" : "−"}
            {(Math.abs(totalNet) / 100).toLocaleString()}
          </Text>
          <Text style={styles.summaryLabel}>Net</Text>
        </View>
        <View style={styles.summaryCol}>
          <Text style={[styles.summaryValue, { color: "#FFD700" }]}>
            {winRate}%
          </Text>
          <Text style={styles.summaryLabel}>Win rate</Text>
        </View>
      </View>

      {/* List */}
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
            tintColor="#FFD700"
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="football-outline"
            title={`No ${isRealFilter ? "REAL" : "DEMO"} spins yet`}
            message={`Spin in ${
              isRealFilter ? "REAL" : "DEMO"
            } mode to see your bet history here.`}
          />
        }
      />
    </View>
  );
}

const { fonts } = theme;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#2a0048",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#5c0090",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 3,
    borderBottomColor: "#8b5a2b",
    shadowColor: "#8800dd",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 100,
  },
  headerBack: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: fonts.marquee,
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 2,
    textShadowColor: "#FFD700",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  modeToggleGroup: {
    flexDirection: "row",
    padding: 3,
    borderRadius: 10,
    backgroundColor: "#220538",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.25)",
    zIndex: 10,
    elevation: 10,
  },
  toggleBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  toggleBtnActiveReal: {
    backgroundColor: "rgba(255, 215, 0, 0.18)",
  },
  toggleBtnActiveDemo: {
    backgroundColor: "rgba(34, 197, 94, 0.18)",
  },
  toggleText: {
    fontFamily: fonts.button,
    fontWeight: "700",
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.4)",
  },
  toggleTextActiveReal: {
    color: "#FFD700",
  },
  toggleTextActiveDemo: {
    color: "#22c55e",
  },

  /* 3-Column Summary Strip */
  summaryStrip: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: "#220538",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.25)",
    overflow: "hidden",
  },
  summaryCol: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryColBorder: {
    borderRightWidth: 1,
    borderRightColor: "rgba(255, 215, 0, 0.15)",
  },
  summaryValue: {
    fontFamily: fonts.numbers,
    fontWeight: "700",
    fontSize: 17,
    color: "#FFFFFF",
  },
  summaryLabel: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    color: "rgba(255, 255, 255, 0.45)",
    marginTop: 3,
  },

  /* List */
  list: {
    paddingHorizontal: 16,
    paddingBottom: 36,
    gap: 8,
  },

  /* Bet Card */
  betCard: {
    borderRadius: 16,
    backgroundColor: "#220538",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
    padding: 12,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginBottom: 9,
  },
  clubIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  clubIconFallback: {
    fontFamily: fonts.heading,
    fontWeight: "800",
    fontSize: 12,
    color: "#FFFFFF",
  },
  clubMeta: {
    flex: 1,
  },
  clubName: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  clubMult: {
    fontFamily: fonts.numbers,
    fontWeight: "600",
    fontSize: 12,
    color: "#FFD700",
    marginTop: 1,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  statusBadgeWin: {
    backgroundColor: "rgba(34, 197, 94, 0.18)",
  },
  statusBadgeLoss: {
    backgroundColor: "rgba(255, 102, 102, 0.18)",
  },
  statusBadgeText: {
    fontFamily: fonts.button,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 0.4,
  },
  statusBadgeTextWin: {
    color: "#22c55e",
  },
  statusBadgeTextLoss: {
    color: "#ff6666",
  },
  cardDivider: {
    height: 1,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    marginVertical: 4,
  },
  cardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
  },
  statsLeft: {
    flexDirection: "row",
    gap: 18,
  },
  statLabel: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: "rgba(255, 255, 255, 0.45)",
  },
  statValue: {
    fontFamily: fonts.numbers,
    fontWeight: "600",
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.7)",
    marginTop: 2,
  },
  statsRight: {
    alignItems: "flex-end",
  },
  timeText: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: "rgba(255, 255, 255, 0.45)",
  },
  netValue: {
    fontFamily: fonts.numbers,
    fontWeight: "700",
    fontSize: 16,
    marginTop: 2,
  },
  netPositive: {
    color: "#22c55e",
  },
  netNegative: {
    color: "#ff6666",
  },
});
