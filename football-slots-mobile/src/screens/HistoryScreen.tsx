import { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl } from "react-native";
import { gameApi } from "../api/client";
import { GameRound, formatMinor } from "../types";
import { useGameStore } from "../store/GameProvider";

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
    if (isAuthenticated) {
      fetchHistory();
    }
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

  const renderItem = ({ item }: { item: GameRound }) => (
    <View style={[styles.card, item.is_win && styles.winCard]}>
      <View style={styles.cardHeader}>
        <Text style={styles.symbolText}>
          {item.result_symbol.replace(/_/g, " ")} ×{item.result_multiplier}
        </Text>
        <Text
          style={[
            styles.resultText,
            item.is_win ? styles.winText : styles.loseText,
          ]}
        >
          {item.is_win ? "WIN" : "LOSS"}
        </Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Stake</Text>
          <Text style={styles.statValue}>
            {formatMinor(item.total_stake_minor, item.currency)}
          </Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Payout</Text>
          <Text style={[styles.statValue, item.is_win && styles.winValue]}>
            {formatMinor(item.gross_payout_minor, item.currency)}
          </Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Net</Text>
          <Text
            style={[
              styles.statValue,
              item.net_result_minor >= 0 ? styles.winValue : styles.loseValue,
            ]}
          >
            {item.net_result_minor >= 0 ? "+" : ""}
            {formatMinor(item.net_result_minor, item.currency)}
          </Text>
        </View>
      </View>
      <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={rounds}
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
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🏈</Text>
            <Text style={styles.emptyText}>No spins yet</Text>
            <Text style={styles.emptyHint}>
              Start playing to see your history
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a0033",
  },
  list: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: "#2d1b4e",
    borderRadius: 12,
    padding: 16,
  },
  winCard: {
    borderColor: "#4CAF50",
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  symbolText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  resultText: {
    fontSize: 12,
    fontWeight: "bold",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  winText: {
    color: "#4CAF50",
    backgroundColor: "rgba(76,175,80,0.2)",
  },
  loseText: {
    color: "#dc3545",
    backgroundColor: "rgba(220,53,69,0.2)",
  },
  cardBody: {
    gap: 6,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statLabel: {
    color: "#aaa",
    fontSize: 13,
  },
  statValue: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  winValue: {
    color: "#4CAF50",
  },
  loseValue: {
    color: "#dc3545",
  },
  dateText: {
    color: "#666",
    fontSize: 11,
    marginTop: 10,
    textAlign: "right",
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 60,
    marginBottom: 16,
  },
  emptyText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  emptyHint: {
    color: "#aaa",
    fontSize: 14,
    marginTop: 8,
  },
});
