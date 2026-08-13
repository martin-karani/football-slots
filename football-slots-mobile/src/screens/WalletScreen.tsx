import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  StatusBar,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useGameStore } from "../store/GameProvider";
import { useWallet } from "../hooks/useWallet";
import { formatMinor } from "../types";
import { useToast } from "../components/Toast";
import { authStorage } from "../api/client";
import { theme } from "../components/theme";

type PlayMode = "fun" | "real";

export function WalletScreen() {
  const navigation = useNavigation<any>();
  const balances = useGameStore((state) => state.balances);
  const currency = useGameStore((state) => state.currency);
  const setCurrency = useGameStore((state) => state.setCurrency);
  const clearAuth = useGameStore((state) => state.clearAuth);
  const { deposit, withdraw, fetchBalance, topupVirtual } = useWallet();
  const { showError } = useToast();
  const kycStatus = useGameStore((state) => state.kycStatus);

  const [depositAmount, setDepositAmount] = useState("");
  const [depositPhone, setDepositPhone] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawPhone, setWithdrawPhone] = useState("");

  // Derive current play mode from the active currency
  const playMode: PlayMode =
    currency === "real" || currency === "bonus" ? "real" : "fun";

  const switchMode = (mode: PlayMode) => {
    setCurrency(mode === "fun" ? "virtual" : "real");
  };

  const isFun = playMode === "fun";

  const handleLogout = async () => {
    await authStorage.clearToken();
    clearAuth();
  };

  const handleDeposit = async () => {
    const amount = parseInt(depositAmount);
    if (!amount || amount < 10) {
      showError("Minimum deposit is KES 10");
      return;
    }
    if (!depositPhone || depositPhone.length < 10) {
      showError("Enter a valid M-Pesa phone number");
      return;
    }
    await deposit(depositPhone, amount);
    setDepositAmount("");
    setTimeout(fetchBalance, 5000);
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.surface} />

      {/* ─── Header ──────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wallet</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Active Mode Banner ─────────────────────── */}
        <View style={[styles.activeModeBadge, isFun ? styles.activeModeBadgeFun : styles.activeModeBadgeReal]}>
          <Text style={styles.activeModeIcon}>{isFun ? "🎮" : "💰"}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.activeModeTitle}>
              {isFun ? "FUN Mode Wallet" : "REAL Mode Wallet (KES)"}
            </Text>
            <Text style={styles.activeModeSub}>
              {isFun ? "Free Play Credits" : "M-Pesa Deposits & Withdrawals"}
            </Text>
          </View>
        </View>

        {/* ══════════════════════════════════════════════
            FUN MODE
            ══════════════════════════════════════════════ */}
        {isFun && (
          <>
            {/* Balance card */}
            <View style={[styles.bigBalanceCard, styles.bigBalanceCardFun]}>
              <View style={styles.bigBalanceBadge}>
                <Text style={styles.bigBalanceBadgeFunText}>FREE PLAY</Text>
              </View>
              <Text style={styles.bigBalanceLabel}>FUN Credits</Text>
              <Text style={[styles.bigBalanceAmount, styles.funText]}>
                {formatMinor(balances.virtual, "virtual")}
              </Text>
              <Text style={styles.bigBalanceNote}>
                No real value · Can't be withdrawn
              </Text>
            </View>

            {/* Bonus sub-row */}
            {balances.bonus > 0 && (
              <View style={[styles.sectionGroup, styles.sectionGroupFun]}>
                <View style={styles.row}>
                  <View style={[styles.rowIcon, styles.rowIconFun]}>
                    <Text style={styles.rowIconEmoji}>🎁</Text>
                  </View>
                  <Text style={styles.rowLabel}>Bonus Credits</Text>
                  <Text style={[styles.rowValue, styles.funText]}>
                    {formatMinor(balances.bonus, "bonus")}
                  </Text>
                </View>
              </View>
            )}

            {/* Free Refill action */}
            <View style={styles.actionCard}>
              <Text style={[styles.actionTitle, styles.funText]}>
                🎁  Free FUN Refill
              </Text>
              <Text style={styles.actionHint}>
                Running low? Get 1,000 free FUN credits instantly — no strings
                attached!
              </Text>
              <TouchableOpacity
                style={[styles.btn, styles.btnFun]}
                onPress={topupVirtual}
              >
                <Text style={styles.btnTextDark}>Refill 1,000 FUN</Text>
              </TouchableOpacity>
            </View>

            {/* Info block */}
            <View style={[styles.sectionGroup, styles.sectionGroupFun]}>
              <View style={[styles.row, styles.rowBorder]}>
                <Text style={styles.rowLabel}>
                  <Text style={[styles.bold, styles.funText]}>FUN</Text>
                  {" — "}Free play money, zero risk
                </Text>
              </View>
              <View style={[styles.row, styles.rowBorder]}>
                <Text style={styles.rowLabel}>
                  <Text style={[styles.bold, styles.funText]}>BONUS</Text>
                  {" — "}Promo credits, cannot withdraw
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>
                  Switch to{" "}
                  <Text style={[styles.bold, styles.realText]}>REAL Mode</Text>{" "}
                  to play with M-Pesa money
                </Text>
              </View>
            </View>
          </>
        )}

        {/* ══════════════════════════════════════════════
            REAL MODE
            ══════════════════════════════════════════════ */}
        {!isFun && (
          <>
            {/* Balance card */}
            <View style={[styles.bigBalanceCard, styles.bigBalanceCardReal]}>
              <View style={styles.bigBalanceBadge}>
                <Text style={styles.bigBalanceBadgeRealText}>REAL MONEY</Text>
              </View>
              <Text style={styles.bigBalanceLabel}>KES Balance</Text>
              <Text style={[styles.bigBalanceAmount, styles.realText]}>
                KES {formatMinor(balances.real, "real")}
              </Text>
              <Text style={styles.bigBalanceNote}>
                Deposited via M-Pesa · Winnings withdrawable
              </Text>
            </View>

            {/* Bonus sub-row */}
            {balances.bonus > 0 && (
              <View style={[styles.sectionGroup, styles.sectionGroupReal]}>
                <View style={styles.row}>
                  <View style={[styles.rowIcon, styles.rowIconReal]}>
                    <Text style={styles.rowIconEmoji}>🎁</Text>
                  </View>
                  <Text style={styles.rowLabel}>Bonus Credits</Text>
                  <Text style={[styles.rowValue, styles.realText]}>
                    {formatMinor(balances.bonus, "bonus")}
                  </Text>
                </View>
              </View>
            )}

            {/* Deposit */}
            <View style={styles.actionCard}>
              <Text style={[styles.actionTitle, styles.realText]}>
                💳  Deposit via M-Pesa
              </Text>
              <TextInput
                style={styles.input}
                placeholder="M-Pesa Phone Number"
                value={depositPhone}
                onChangeText={setDepositPhone}
                keyboardType="phone-pad"
                placeholderTextColor={colors.textDim}
              />
              <TextInput
                style={styles.input}
                placeholder="Amount (KES)"
                value={depositAmount}
                onChangeText={setDepositAmount}
                keyboardType="numeric"
                placeholderTextColor={colors.textDim}
              />
              <TouchableOpacity
                style={[styles.btn, styles.btnReal]}
                onPress={handleDeposit}
              >
                <Text style={styles.btnTextDark}>Deposit</Text>
              </TouchableOpacity>
              <Text style={styles.actionHint}>
                STK Push sent to your M-Pesa number
              </Text>
            </View>

            {/* Withdraw */}
            <View style={styles.actionCard}>
              <Text style={[styles.actionTitle, styles.realText]}>
                💸  Withdraw to M-Pesa
              </Text>
              {kycStatus !== "verified" ? (
                <Text style={styles.actionHint}>
                  ⚠️ Withdrawals require a verified account. Complete KYC
                  verification to enable this feature.
                </Text>
              ) : (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="M-Pesa Phone Number"
                    value={withdrawPhone}
                    onChangeText={setWithdrawPhone}
                    keyboardType="phone-pad"
                    placeholderTextColor={colors.textDim}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Amount (KES)"
                    value={withdrawAmount}
                    onChangeText={setWithdrawAmount}
                    keyboardType="numeric"
                    placeholderTextColor={colors.textDim}
                  />
                  <TouchableOpacity
                    style={[styles.btn, styles.btnDanger]}
                    onPress={async () => {
                      const amount = parseInt(withdrawAmount);
                      if (!amount || amount < 100) {
                        showError("Minimum withdrawal is KES 100");
                        return;
                      }
                      if (!withdrawPhone || withdrawPhone.length < 10) {
                        showError("Enter a valid M-Pesa phone number");
                        return;
                      }
                      if (amount * 100 > balances.real) {
                        showError("Withdrawal exceeds your available balance");
                        return;
                      }
                      await withdraw(withdrawPhone, amount);
                      setWithdrawAmount("");
                    }}
                  >
                    <Text style={styles.btnText}>Withdraw</Text>
                  </TouchableOpacity>
                  <Text style={styles.actionHint}>
                    Funds held immediately; sent within minutes.
                  </Text>
                </>
              )}
            </View>

            {/* Info block */}
            <View style={[styles.sectionGroup, styles.sectionGroupReal]}>
              <View style={[styles.row, styles.rowBorder]}>
                <Text style={styles.rowLabel}>
                  <Text style={[styles.bold, styles.realText]}>KES</Text>
                  {" — "}Real M-Pesa money, fully withdrawable
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>
                  Switch to{" "}
                  <Text style={[styles.bold, styles.funText]}>FUN Mode</Text>{" "}
                  to play for free with zero risk
                </Text>
              </View>
            </View>
          </>
        )}

        {/* ─── Logout ──────────────────────────────────── */}
        <View style={styles.sectionGroup}>
          <TouchableOpacity style={styles.row} onPress={handleLogout}>
            <View style={[styles.rowIcon, styles.rowIconDanger]}>
              <Text style={styles.rowIconEmoji}>🚪</Text>
            </View>
            <Text style={[styles.rowLabel, styles.dangerText]}>Log Out</Text>
            <Text style={[styles.chevron, styles.dangerText]}>›</Text>
          </TouchableOpacity>
        </View>
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

  /* Mode toggle */
  modeToggleWrap: {
    flexDirection: "row",
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
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
    gap: 3,
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
  modeTabIcon: { fontSize: 24 },
  modeTabLabel: { color: colors.textMuted, fontWeight: "800", fontSize: 14 },
  modeTabLabelFunActive: { color: colors.fun },
  modeTabLabelRealActive: { color: colors.real },
  modeTabSub: { color: colors.textDim, fontSize: 10, textAlign: "center" },
  modeTabSubFun: { color: colors.fun },
  modeTabSubReal: { color: colors.real },

  /* Big balance card */
  bigBalanceCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: "center",
    ...shadows.md,
  },
  bigBalanceCardFun: {
    backgroundColor: colors.funLight,
    borderColor: colors.fun,
  },
  bigBalanceCardReal: {
    backgroundColor: colors.realLight,
    borderColor: colors.real,
  },
  bigBalanceBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.glassLight,
    marginBottom: 10,
  },
  bigBalanceBadgeFunText: {
    color: colors.fun,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  bigBalanceBadgeRealText: {
    color: colors.real,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  bigBalanceLabel: { color: colors.textMuted, fontSize: 13, marginBottom: 4 },
  bigBalanceAmount: { fontSize: 40, fontWeight: "900", marginBottom: 6 },
  bigBalanceNote: {
    color: colors.textDim,
    fontSize: 11,
    textAlign: "center",
  },

  /* Shared group card */
  sectionGroup: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    overflow: "hidden",
    ...shadows.sm,
  },
  sectionGroupFun: {
    borderColor: colors.fun,
    backgroundColor: colors.funLight,
  },
  sectionGroupReal: {
    borderColor: colors.real,
    backgroundColor: colors.realLight,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.glassLight,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.glassMedium,
    justifyContent: "center",
    alignItems: "center",
  },
  rowIconFun: { backgroundColor: colors.funLight },
  rowIconReal: { backgroundColor: colors.realLight },
  rowIconDanger: { backgroundColor: colors.negativeLight },
  rowIconEmoji: { fontSize: 18 },
  rowLabel: { flex: 1, color: colors.textPrimary, fontSize: 13, lineHeight: 18 },
  rowValue: { fontWeight: "700", fontSize: 14 },
  chevron: { color: colors.textMuted, fontSize: 22, fontWeight: "300" },
  bold: { fontWeight: "700" },

  /* Action cards */
  actionCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    padding: spacing.md,
    ...shadows.sm,
  },
  actionTitle: {
    fontWeight: "700",
    fontSize: 15,
    marginBottom: spacing.md,
  },
  actionHint: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 16,
  },
  input: {
    backgroundColor: colors.glassLight,
    padding: 14,
    borderRadius: radius.md,
    color: colors.textPrimary,
    fontSize: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  btn: {
    padding: 15,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: 4,
    ...shadows.sm,
  },
  btnFun: { backgroundColor: colors.fun },
  btnReal: { backgroundColor: "#7c3aed" }, // Keep original brand purple for Real deposit button? Actually let's use colors.accent/gold or keep purple.
  btnDanger: { backgroundColor: colors.negative },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  btnTextDark: { color: "#0f1a0f", fontWeight: "800", fontSize: 15 },

  funText: { color: colors.fun },
  realText: { color: colors.real },
  dangerText: { color: colors.danger },
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

