import { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { walletApi } from "../api/client";
import { LedgerEntry } from "../types";
import { useGameStore } from "../store/GameProvider";
import { theme } from "../components/theme";
import { EmptyState } from "../components/EmptyState";

type FilterType = "all" | "deposits" | "withdrawals" | "bets";

export function TransactionsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const currency = useGameStore((state) => state.currency);
  const isReal = currency === "real";

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [_loading, setLoading] = useState(false);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const res = await walletApi.ledger(isReal ? "real" : "virtual", 50);
      setEntries(res.data.entries);
    } catch (e) {
      console.error("Failed to load transactions:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [currency]);

  const filteredEntries = entries.filter((item) => {
    const type = item.entry_type;
    if (filter === "deposits") {
      return type === "mpesa_deposit" || type === "deposit" || type === "manual_deposit";
    }
    if (filter === "withdrawals") {
      return type === "mpesa_withdraw" || type === "withdrawal";
    }
    if (filter === "bets") {
      return (
        type === "bet" ||
        type === "spin_debit" ||
        type === "win" ||
        type === "payout"
      );
    }
    return true;
  });

  const renderItem = ({ item }: { item: LedgerEntry }) => {
    const isCredit = item.amount_minor > 0;
    const isDeposit =
      item.entry_type === "mpesa_deposit" || item.entry_type === "deposit" || item.entry_type === "manual_deposit";
    const isWithdrawal =
      item.entry_type === "mpesa_withdraw" || item.entry_type === "withdrawal";
    const isBet =
      item.entry_type === "bet" || item.entry_type === "spin_debit";
    const isWin = item.entry_type === "win" || item.entry_type === "payout";

    const glyph = isDeposit
      ? "↓"
      : isWithdrawal
      ? "↑"
      : isWin
      ? "★"
      : "•";

    const glyphBg = isDeposit
      ? "rgba(34, 197, 94, 0.18)"
      : isWithdrawal
      ? "rgba(255, 215, 0, 0.16)"
      : isWin
      ? "rgba(34, 197, 94, 0.18)"
      : "rgba(255, 255, 255, 0.08)";

    const glyphFg = isDeposit
      ? "#22c55e"
      : isWithdrawal
      ? "#FFD700"
      : isWin
      ? "#22c55e"
      : "rgba(255, 255, 255, 0.6)";

    const title = isDeposit
      ? "Deposit"
      : isWithdrawal
      ? "Withdrawal"
      : isBet
      ? "Bet settled"
      : isWin
      ? "Win credited"
      : item.entry_type.replace(/_/g, " ");

    const date = new Date(item.created_at);
    const dateStr = date.toLocaleDateString("en-KE", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

    const sub = isDeposit
      ? `Payment · ${dateStr}`
      : isWithdrawal
      ? `Payment · registered line`
      : isBet || isWin
      ? `Football Slots · ${dateStr}`
      : dateStr;

    const amountAbs = (Math.abs(item.amount_minor) / 100).toLocaleString();
    const amtStr = `${isCredit ? "+" : "−"}${amountAbs}`;
    const amtc = isCredit ? "#22c55e" : "#FFFFFF";

    const status = isDeposit
      ? "COMPLETED"
      : isWithdrawal
      ? "PROCESSING"
      : isBet
      ? "SETTLED"
      : isWin
      ? "CREDITED"
      : "COMPLETED";

    const statusColor = isDeposit || isWin
      ? "#22c55e"
      : isWithdrawal
      ? "#FFD700"
      : "rgba(255, 255, 255, 0.5)";

    return (
      <View style={styles.txnCard}>
        <View style={[styles.glyphBox, { backgroundColor: glyphBg }]}>
          <Text style={[styles.glyphText, { color: glyphFg }]}>{glyph}</Text>
        </View>

        <View style={styles.txnMeta}>
          <Text style={styles.txnTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.txnSub} numberOfLines={1}>
            {sub}
          </Text>
        </View>

        <View style={styles.txnRight}>
          <Text style={[styles.txnAmount, { color: amtc }]}>{amtStr}</Text>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {status}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#5c0090" />

      {/* Marquee Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 14) + 6 }]}>
        <TouchableOpacity
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Wallet"))}
          style={styles.backBtn}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color="#FFE566" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>TRANSACTIONS</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(["all", "deposits", "withdrawals", "bets"] as FilterType[]).map((tab) => {
          const isActive = filter === tab;
          const label =
            tab === "all"
              ? "All"
              : tab === "deposits"
              ? "Deposits"
              : tab === "withdrawals"
              ? "Withdrawals"
              : "Bets";

          return (
            <TouchableOpacity
              key={tab}
              style={[styles.filterPill, isActive && styles.filterPillActive]}
              onPress={() => setFilter(tab)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterText,
                  isActive && styles.filterTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={filteredEntries}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          filteredEntries.length > 0 ? (
            <Text style={styles.sectionHeader}>TODAY</Text>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchTransactions();
            }}
            tintColor="#FFD700"
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="wallet-outline"
            title="No transactions found"
            message={`No ${filter} transactions found for your account.`}
          />
        }
      />
    </View>
  );
}

const { fonts, radius } = theme;

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
    paddingHorizontal: 16,
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
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.35)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 101,
  },
  headerSpacer: {
    width: 38,
  },
  headerTitle: {
    flex: 1,
    fontFamily: fonts.marquee,
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 2,
    textAlign: "center",
    textShadowColor: "#FFD700",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterPill: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    backgroundColor: "#220538",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.25)",
  },
  filterPillActive: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderColor: "#FFD700",
  },
  filterText: {
    fontFamily: fonts.button,
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.5)",
  },
  filterTextActive: {
    color: "#FFD700",
    fontWeight: "700",
  },
  sectionHeader: {
    fontFamily: fonts.button,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: "#D0B0FF",
    marginVertical: 8,
    paddingHorizontal: 4,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 36,
    gap: 8,
  },
  txnCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 15,
    backgroundColor: "#220538",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
  },
  glyphBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  glyphText: {
    fontFamily: fonts.heading,
    fontSize: 17,
    fontWeight: "800",
  },
  txnMeta: {
    flex: 1,
  },
  txnTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  txnSub: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: "rgba(255, 255, 255, 0.45)",
    marginTop: 2,
  },
  txnRight: {
    alignItems: "flex-end",
  },
  txnAmount: {
    fontFamily: fonts.numbers,
    fontSize: 14.5,
    fontWeight: "700",
  },
  statusText: {
    fontFamily: fonts.button,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginTop: 3,
  },
});
