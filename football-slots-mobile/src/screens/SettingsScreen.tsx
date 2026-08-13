import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  StatusBar,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useGameStore } from "../store/GameProvider";
import { useWallet } from "../hooks/useWallet";
import { authStorage } from "../api/client";
import { formatMinor } from "../types";
import { theme } from "../components/theme";

/** Top-level play modes – separates free fun from real-money play */
type PlayMode = "fun" | "real";

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const balances = useGameStore((state) => state.balances);
  const currency = useGameStore((state) => state.currency);
  const setCurrency = useGameStore((state) => state.setCurrency);
  const clearAuth = useGameStore((state) => state.clearAuth);
  const phoneNumber = useGameStore((state) => state.phoneNumber);
  const { topupVirtual } = useWallet();

  // Derive current play mode from the active currency
  const playMode: PlayMode =
    currency === "real" || currency === "bonus" ? "real" : "fun";

  const switchMode = (mode: PlayMode) => {
    setCurrency(mode === "fun" ? "virtual" : "real");
  };

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          await authStorage.clearToken();
          clearAuth();
        },
      },
    ]);
  };

  const infoItems = [
    {
      icon: "🔒",
      label: "Responsible Gambling",
      sub: "Set limits and protect your play",
      onPress: () =>
        Alert.alert(
          "Coming Soon",
          "Responsible gambling tools will be available soon.",
        ),
    },
    {
      icon: "📋",
      label: "Provably Fair",
      sub: "Verify every spin is genuinely random",
      onPress: () =>
        Alert.alert(
          "Provably Fair",
          "Each spin uses HMAC-SHA256 with your client seed + our server seed. Results are verifiable.",
        ),
    },
  ];

  const isFun = playMode === "fun";

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.surface} />

      {/* ─── Header ─────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Profile Card ────────────────────────────── */}
        <View style={styles.profileCard}>
          <View style={styles.avatarRing}>
            <Text style={styles.avatarEmoji}>⚽</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profilePhone}>{phoneNumber}</Text>
            <Text style={styles.profileSub}>Football Slots Player</Text>
          </View>
        </View>

        {/* ─── Active Mode Banner ─────────────────────── */}
        <View style={[styles.activeModeBadge, isFun ? styles.activeModeBadgeFun : styles.activeModeBadgeReal]}>
          <Text style={styles.activeModeIcon}>{isFun ? "🎮" : "💰"}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.activeModeTitle}>
              {isFun ? "FUN Mode Active" : "REAL Mode Active (KES)"}
            </Text>
            <Text style={styles.activeModeSub}>
              {isFun ? "Free Play · Virtual Credits" : "M-Pesa · Real Money Play"}
            </Text>
          </View>
        </View>

        {/* ─── Balance Panel (FUN mode) ─────────────────── */}
        {isFun && (
          <>
            <View style={[styles.balancePanel, styles.balancePanelFun]}>
              <View style={styles.balancePanelRow}>
                <View>
                  <Text style={styles.balancePanelLabel}>FUN Credits</Text>
                  <Text style={[styles.balancePanelAmount, styles.funAmount]}>
                    {formatMinor(balances.virtual, "virtual")}
                  </Text>
                </View>
                <View style={styles.funBadge}>
                  <Text style={styles.funBadgeText}>FREE PLAY</Text>
                </View>
              </View>
              {balances.bonus > 0 && (
                <View style={styles.bonusRow}>
                  <Text style={styles.bonusIcon}>🎁</Text>
                  <Text style={styles.bonusLabel}>Bonus Credits</Text>
                  <Text style={styles.bonusValue}>
                    {formatMinor(balances.bonus, "bonus")}
                  </Text>
                </View>
              )}
            </View>

            {/* FUN actions */}
            <View style={styles.menuGroup}>
              <TouchableOpacity
                style={styles.menuRow}
                onPress={topupVirtual}
                activeOpacity={0.7}
              >
                <View style={[styles.menuRowIcon, styles.iconFun]}>
                  <Text style={styles.menuRowIconText}>🎁</Text>
                </View>
                <View style={styles.menuRowContent}>
                  <Text style={styles.menuRowLabel}>Free FUN Refill</Text>
                  <Text style={styles.menuRowSub}>
                    Get 1,000 free FUN credits instantly
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ─── Balance Panel (REAL mode) ────────────────── */}
        {!isFun && (
          <>
            <View style={[styles.balancePanel, styles.balancePanelReal]}>
              <View style={styles.balancePanelRow}>
                <View>
                  <Text style={styles.balancePanelLabel}>KES Balance</Text>
                  <Text style={[styles.balancePanelAmount, styles.realAmount]}>
                    KES {formatMinor(balances.real, "real")}
                  </Text>
                </View>
                <View style={styles.realBadge}>
                  <Text style={styles.realBadgeText}>REAL MONEY</Text>
                </View>
              </View>
              {balances.bonus > 0 && (
                <View style={styles.bonusRow}>
                  <Text style={styles.bonusIcon}>🎁</Text>
                  <Text style={styles.bonusLabel}>Bonus Credits</Text>
                  <Text style={styles.bonusValue}>
                    {formatMinor(balances.bonus, "bonus")}
                  </Text>
                </View>
              )}
            </View>

            {/* REAL actions */}
            <View style={styles.menuGroup}>
              <TouchableOpacity
                style={[styles.menuRow, styles.menuRowBorder]}
                onPress={() => navigation.navigate("Wallet")}
                activeOpacity={0.7}
              >
                <View style={[styles.menuRowIcon, styles.iconReal]}>
                  <Text style={styles.menuRowIconText}>💳</Text>
                </View>
                <View style={styles.menuRowContent}>
                  <Text style={styles.menuRowLabel}>Deposit via M-Pesa</Text>
                  <Text style={styles.menuRowSub}>
                    Add real money to your account
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => navigation.navigate("Wallet")}
                activeOpacity={0.7}
              >
                <View style={[styles.menuRowIcon, styles.iconReal]}>
                  <Text style={styles.menuRowIconText}>💸</Text>
                </View>
                <View style={styles.menuRowContent}>
                  <Text style={styles.menuRowLabel}>Withdraw Winnings</Text>
                  <Text style={styles.menuRowSub}>
                    Send your balance to M-Pesa
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ─── Navigation Items ────────────────────────── */}
        <View style={styles.menuGroup}>
          <TouchableOpacity
            style={[styles.menuRow, styles.menuRowBorder]}
            onPress={() => navigation.navigate("History")}
            activeOpacity={0.7}
          >
            <View style={styles.menuRowIcon}>
              <Text style={styles.menuRowIconText}>📜</Text>
            </View>
            <View style={styles.menuRowContent}>
              <Text style={styles.menuRowLabel}>Bet History</Text>
              <Text style={styles.menuRowSub}>
                View your past spins and results
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.menuRow, styles.menuRowBorder]}
            onPress={() => navigation.navigate("Wallet")}
            activeOpacity={0.7}
          >
            <View style={styles.menuRowIcon}>
              <Text style={styles.menuRowIconText}>👛</Text>
            </View>
            <View style={styles.menuRowContent}>
              <Text style={styles.menuRowLabel}>Full Wallet</Text>
              <Text style={styles.menuRowSub}>
                Manage all your balances
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          {infoItems.map((item, i) => (
            <TouchableOpacity
              key={item.label}
              style={[
                styles.menuRow,
                i < infoItems.length - 1 && styles.menuRowBorder,
              ]}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={styles.menuRowIcon}>
                <Text style={styles.menuRowIconText}>{item.icon}</Text>
              </View>
              <View style={styles.menuRowContent}>
                <Text style={styles.menuRowLabel}>{item.label}</Text>
                <Text style={styles.menuRowSub}>{item.sub}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ─── Logout ──────────────────────────────────── */}
        <View style={styles.menuGroup}>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <View style={[styles.menuRowIcon, styles.menuRowIconDanger]}>
              <Text style={styles.menuRowIconText}>🚪</Text>
            </View>
            <View style={styles.menuRowContent}>
              <Text style={[styles.menuRowLabel, styles.dangerText]}>
                Log Out
              </Text>
            </View>
            <Text style={[styles.chevron, styles.dangerText]}>›</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>
          Football Slots v1.0 · Provably Fair RNG
        </Text>
      </ScrollView>
    </View>
  );
}

const { colors, radius, spacing, shadows } = theme;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingBottom: 48 },

  /* Header */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: 52,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  backArrow: { color: "#fff", fontSize: 18, fontWeight: "600", lineHeight: 20 },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },

  /* Profile card */
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    ...shadows.md,
  },
  avatarRing: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.accent,
    justifyContent: "center",
    alignItems: "center",
    ...shadows.sm,
  },
  avatarEmoji: { fontSize: 30 },
  profileInfo: { flex: 1 },
  profilePhone: { color: colors.accent, fontWeight: "800", fontSize: 16 },
  profileSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  /* Mode toggle */
  modeToggleWrap: {
    flexDirection: "row",
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  modeTab: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.borderMuted,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 4,
    ...shadows.sm,
  },
  modeTabFunActive: {
    borderColor: colors.fun,
    backgroundColor: colors.funLight,
  },
  modeTabRealActive: {
    borderColor: colors.real,
    backgroundColor: colors.realLight,
  },
  modeTabIcon: { fontSize: 24, marginBottom: 2 },
  modeTabLabel: {
    color: colors.textMuted,
    fontWeight: "800",
    fontSize: 14,
  },
  modeTabLabelFunActive: { color: colors.fun },
  modeTabLabelRealActive: { color: colors.real },
  modeTabSub: { color: colors.textDim, fontSize: 10, textAlign: "center" },
  modeTabSubActive: { color: colors.textMuted },

  /* Balance panel */
  balancePanel: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    ...shadows.md,
  },
  balancePanelFun: {
    backgroundColor: colors.funLight,
    borderColor: colors.fun,
  },
  balancePanelReal: {
    backgroundColor: colors.realLight,
    borderColor: colors.real,
  },
  balancePanelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  balancePanelLabel: {
    color: colors.textMuted,
    fontSize: 11,
    marginBottom: 4,
  },
  balancePanelAmount: { fontSize: 28, fontWeight: "900" },
  funAmount: { color: colors.fun },
  realAmount: { color: colors.real },

  funBadge: {
    backgroundColor: colors.glassMedium,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.funLight,
  },
  funBadgeText: { color: colors.fun, fontSize: 10, fontWeight: "800" },

  realBadge: {
    backgroundColor: colors.glassMedium,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.realLight,
  },
  realBadgeText: { color: colors.real, fontSize: 10, fontWeight: "800" },

  bonusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
    gap: 8,
  },
  bonusIcon: { fontSize: 14 },
  bonusLabel: { color: colors.textMuted, fontSize: 12, flex: 1 },
  bonusValue: { color: colors.textPrimary, fontWeight: "700", fontSize: 12 },

  /* Menu group */
  menuGroup: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    overflow: "hidden",
    ...shadows.sm,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    gap: 12,
  },
  menuRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.glassLight,
  },
  menuRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.glassMedium,
    justifyContent: "center",
    alignItems: "center",
  },
  iconFun: { backgroundColor: colors.funLight },
  iconReal: { backgroundColor: colors.realLight },
  menuRowIconDanger: { backgroundColor: colors.negativeLight },
  menuRowIconText: { fontSize: 18 },
  menuRowContent: { flex: 1 },
  menuRowLabel: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  menuRowSub: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  chevron: { color: colors.textMuted, fontSize: 22, fontWeight: "300" },
  dangerText: { color: colors.danger },

  version: {
    textAlign: "center",
    color: colors.textDim,
    fontSize: 10,
    marginTop: spacing.md,
  },
  activeModeBadge: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    gap: 12,
  },
  activeModeBadgeFun: {
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderColor: "rgba(34, 197, 94, 0.4)",
  },
  activeModeBadgeReal: {
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderColor: "rgba(255, 215, 0, 0.4)",
  },
  activeModeIcon: { fontSize: 24 },
  activeModeTitle: { color: colors.textPrimary, fontWeight: "800", fontSize: 14 },
  activeModeSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
});

