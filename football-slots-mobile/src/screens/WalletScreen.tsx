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
import { theme } from "../components/theme";

type WalletTab = "deposit" | "withdraw";

export function WalletScreen() {
  const navigation = useNavigation<any>();
  const balances = useGameStore((state) => state.balances);
  const currency = useGameStore((state) => state.currency);
  const { deposit, withdraw, fetchBalance, topupVirtual } = useWallet();
  const { showError, showSuccess } = useToast();
  const kycStatus = useGameStore((state) => state.kycStatus);

  const [activeTab, setActiveTab] = useState<WalletTab>("deposit");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositPhone, setDepositPhone] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawPhone, setWithdrawPhone] = useState("");

  const isReal = currency === "real" || currency === "bonus";



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

  const handleWithdraw = async () => {
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
  };

  const quickDepositPresets = [100, 500, 1000, 2500, 5000];
  const quickWithdrawPresets = [100, 500, 1000, 2500];

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
        {/* ─── Balance Summary Card ─────────────────────── */}
        <View style={[styles.balanceCard, isReal ? styles.balanceCardReal : styles.balanceCardDemo]}>
          <View style={styles.balanceMain}>
            <Text style={styles.balanceLabel}>
              {isReal ? "REAL KES BALANCE" : "DEMO VIRTUAL CREDITS"}
            </Text>
            <Text style={[styles.balanceAmount, isReal ? styles.realText : styles.demoText]}>
              {isReal
                ? `KES ${formatMinor(balances.real, "real")}`
                : formatMinor(balances.virtual, "virtual")}
            </Text>
            <Text style={styles.balanceSubtext}>
              {isReal
                ? "Withdrawable via M-Pesa KES"
                : "Free practice credits · Zero risk"}
            </Text>
          </View>

          {balances.bonus > 0 && (
            <View style={styles.bonusBanner}>
              <Text style={styles.bonusText}>
                🎁 Bonus Credits: <Text style={styles.bold}>{formatMinor(balances.bonus, "bonus")}</Text>
              </Text>
            </View>
          )}
        </View>

        {/* ─── Bonus Info Card ──────────────────────────── */}
        {balances.bonus > 0 && (
          <View style={styles.bonusInfoCard}>
            <Text style={styles.bonusInfoTitle}>🎁 Bonus Credits</Text>
            <Text style={styles.bonusInfoAmount}>
              KES {formatMinor(balances.bonus, "bonus")}
            </Text>
            <Text style={styles.bonusInfoNote}>
              Not withdrawable. Complete wagering in Bonus Mode to convert to real KES.
            </Text>
          </View>
        )}

        {/* ─── Segmented Tabs (Deposit / Withdraw) ─────── */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === "deposit" && styles.tabBtnActiveDeposit]}
            onPress={() => setActiveTab("deposit")}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabBtnText,
                activeTab === "deposit" && styles.tabBtnTextActiveDeposit,
              ]}
            >
              💳 Deposit
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === "withdraw" && styles.tabBtnActiveWithdraw]}
            onPress={() => setActiveTab("withdraw")}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabBtnText,
                activeTab === "withdraw" && styles.tabBtnTextActiveWithdraw,
              ]}
            >
              💸 Withdraw
            </Text>
          </TouchableOpacity>
        </View>

        {/* ══════════════════════════════════════════════
            DEPOSIT TAB CONTENT
            ══════════════════════════════════════════════ */}
        {activeTab === "deposit" && (
          <View style={styles.tabCard}>
            {!isReal ? (
              /* DEMO Mode Deposit / Refill View */
              <View style={styles.demoRefillContainer}>
                <Text style={styles.cardHeaderTitle}>🎮 DEMO Credits Refill</Text>
                <Text style={styles.cardDescription}>
                  Need more practice credits? Get 1,000 free DEMO credits instantly.
                </Text>
                <TouchableOpacity
                  style={[styles.btn, styles.btnDemo]}
                  onPress={() => {
                    topupVirtual();
                    showSuccess("Refilled 1,000 DEMO credits!");
                  }}
                >
                  <Text style={styles.btnTextDark}>🎁 Refill 1,000 DEMO Credits</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* REAL Mode Deposit View */
              <View>
                <Text style={styles.cardHeaderTitle}>💳 Deposit via M-Pesa</Text>
                <Text style={styles.cardDescription}>
                  Instant deposit to your wallet via M-Pesa STK Push.
                </Text>

                <Text style={styles.inputLabel}>M-Pesa Phone Number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 0712345678"
                  value={depositPhone}
                  onChangeText={setDepositPhone}
                  keyboardType="phone-pad"
                  placeholderTextColor={colors.textDim}
                />

                <Text style={styles.inputLabel}>Amount (KES)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter amount (min KES 10)"
                  value={depositAmount}
                  onChangeText={setDepositAmount}
                  keyboardType="numeric"
                  placeholderTextColor={colors.textDim}
                />

                {/* Quick Presets */}
                <Text style={styles.presetLabel}>Quick Select Amount:</Text>
                <View style={styles.presetRow}>
                  {quickDepositPresets.map((val) => (
                    <TouchableOpacity
                      key={val}
                      style={[
                        styles.presetChip,
                        depositAmount === val.toString() && styles.presetChipSelected,
                      ]}
                      onPress={() => setDepositAmount(val.toString())}
                    >
                      <Text
                        style={[
                          styles.presetChipText,
                          depositAmount === val.toString() && styles.presetChipTextSelected,
                        ]}
                      >
                        +{val}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.btn, styles.btnReal]}
                  onPress={handleDeposit}
                >
                  <Text style={styles.btnTextDark}>Deposit via M-Pesa</Text>
                </TouchableOpacity>

                <Text style={styles.actionHint}>
                  🔒 Secure M-Pesa STK push prompt will pop up on your phone.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ══════════════════════════════════════════════
            WITHDRAW TAB CONTENT
            ══════════════════════════════════════════════ */}
        {activeTab === "withdraw" && (
          <View style={styles.tabCard}>
            {!isReal ? (
              /* DEMO Mode Withdraw Notice */
              <View style={styles.demoRefillContainer}>
                <Text style={styles.cardHeaderTitle}>⚠️ DEMO Credits Cannot Be Withdrawn</Text>
                <Text style={styles.cardDescription}>
                  You are currently playing in DEMO mode. Practice credits have no real monetary value.
                </Text>
              </View>
            ) : kycStatus !== "verified" ? (
              /* Unverified KYC Notice */
              <View style={styles.kycNoticeCard}>
                <Text style={styles.kycNoticeIcon}>🔒</Text>
                <Text style={styles.kycNoticeTitle}>Identity Verification Required</Text>
                <Text style={styles.kycNoticeText}>
                  Withdrawals require a verified account for security and regulatory compliance.
                </Text>
              </View>
            ) : (
              /* REAL Mode Withdraw View */
              <View>
                <Text style={styles.cardHeaderTitle}>💸 Withdraw to M-Pesa</Text>
                <Text style={styles.cardDescription}>
                  Transfer your winnings directly to your M-Pesa mobile line.
                </Text>

                <View style={styles.withdrawLimitBox}>
                  <Text style={styles.withdrawLimitLabel}>Withdrawable Balance:</Text>
                  <Text style={styles.withdrawLimitVal}>
                    KES {formatMinor(balances.real, "real")}
                  </Text>
                </View>

                <Text style={styles.inputLabel}>M-Pesa Phone Number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 0712345678"
                  value={withdrawPhone}
                  onChangeText={setWithdrawPhone}
                  keyboardType="phone-pad"
                  placeholderTextColor={colors.textDim}
                />

                <Text style={styles.inputLabel}>Amount (KES)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter amount (min KES 100)"
                  value={withdrawAmount}
                  onChangeText={setWithdrawAmount}
                  keyboardType="numeric"
                  placeholderTextColor={colors.textDim}
                />

                {/* Quick Presets */}
                <Text style={styles.presetLabel}>Quick Select Amount:</Text>
                <View style={styles.presetRow}>
                  {quickWithdrawPresets.map((val) => (
                    <TouchableOpacity
                      key={val}
                      style={[
                        styles.presetChip,
                        withdrawAmount === val.toString() && styles.presetChipSelectedWithdraw,
                      ]}
                      onPress={() => setWithdrawAmount(val.toString())}
                    >
                      <Text
                        style={[
                          styles.presetChipText,
                          withdrawAmount === val.toString() && styles.presetChipTextSelectedWithdraw,
                        ]}
                      >
                        {val}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={[
                      styles.presetChip,
                      withdrawAmount === Math.floor(balances.real / 100).toString() && styles.presetChipSelectedWithdraw,
                    ]}
                    onPress={() => setWithdrawAmount(Math.floor(balances.real / 100).toString())}
                  >
                    <Text style={styles.presetChipText}>MAX</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.btn, styles.btnDanger]}
                  onPress={handleWithdraw}
                >
                  <Text style={styles.btnText}>Withdraw Funds</Text>
                </TouchableOpacity>

                <Text style={styles.actionHint}>
                  ⚡ Processed instantly to your M-Pesa registered line.
                </Text>
              </View>
            )}
          </View>
        )}

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
  backArrow: { fontFamily: theme.fonts.bodyBold, color: "#fff", fontSize: 18, fontWeight: "600", lineHeight: 20 },
  headerTitle: { fontFamily: theme.fonts.marquee, color: "#fff", fontSize: 17, fontWeight: "700" },

  /* Balance Card */
  balanceCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    ...shadows.md,
  },
  balanceCardDemo: {
    backgroundColor: "rgba(34, 197, 94, 0.08)",
    borderColor: "rgba(34, 197, 94, 0.35)",
  },
  balanceCardReal: {
    backgroundColor: "rgba(255, 215, 0, 0.08)",
    borderColor: "rgba(255, 215, 0, 0.35)",
  },
  balanceMain: {
    alignItems: "center",
    paddingVertical: 6,
  },
  balanceLabel: {
    fontFamily: theme.fonts.bodyBold,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 2,
  },
  balanceAmount: {
    fontFamily: theme.fonts.digitalRegular,
    fontSize: 32,
    fontWeight: "900",
    marginBottom: 4,
  },
  balanceSubtext: {
    fontFamily: theme.fonts.body,
    color: colors.textDim,
    fontSize: 11,
  },
  bonusBanner: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
  },
  bonusText: {
    fontFamily: theme.fonts.bodyBold,
    color: colors.real,
    fontSize: 12,
  },
  bold: {
    fontWeight: "800",
  },

  /* Segmented Tabs */
  tabContainer: {
    flexDirection: "row",
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: "center",
  },
  tabBtnActiveDeposit: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.5)",
  },
  tabBtnActiveWithdraw: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.5)",
  },
  tabBtnText: {
    fontFamily: theme.fonts.button,
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "800",
  },
  tabBtnTextActiveDeposit: {
    color: colors.real,
  },
  tabBtnTextActiveWithdraw: {
    color: "#ff6666",
  },

  /* Tab Card Content */
  tabCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    padding: spacing.md,
    ...shadows.sm,
  },
  cardHeaderTitle: {
    fontFamily: theme.fonts.bodyBold,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
  },
  cardDescription: {
    fontFamily: theme.fonts.body,
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 14,
    lineHeight: 16,
  },
  inputLabel: {
    fontFamily: theme.fonts.bodyBold,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4,
    marginTop: 4,
  },
  input: {
    backgroundColor: colors.glassLight,
    padding: 12,
    borderRadius: radius.md,
    color: colors.textPrimary,
    fontSize: 15,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  presetLabel: {
    fontFamily: theme.fonts.bodyBold,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
    marginBottom: 6,
  },
  presetRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  presetChip: {
    backgroundColor: colors.glassLight,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  presetChipSelected: {
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    borderColor: colors.real,
  },
  presetChipSelectedWithdraw: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    borderColor: "#ff6666",
  },
  presetChipText: {
    fontFamily: theme.fonts.digitalRegular,
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "800",
  },
  presetChipTextSelected: {
    color: colors.real,
  },
  presetChipTextSelectedWithdraw: {
    color: "#ff6666",
  },

  /* Buttons */
  btn: {
    padding: 14,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: 4,
    ...shadows.sm,
  },
  btnDemo: { backgroundColor: colors.demo },
  btnReal: { backgroundColor: colors.real },
  btnDanger: { backgroundColor: colors.negative },
  btnText: { fontFamily: theme.fonts.button, color: "#fff", fontWeight: "800", fontSize: 15 },
  btnTextDark: { fontFamily: theme.fonts.button, color: "#1a0033", fontWeight: "900", fontSize: 15 },
  actionHint: {
    fontFamily: theme.fonts.body,
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 10,
    textAlign: "center",
    lineHeight: 16,
  },

  /* Demo Refill container */
  demoRefillContainer: {
    paddingVertical: 4,
  },

  /* Withdraw limit */
  withdrawLimitBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    padding: 10,
    borderRadius: radius.md,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  withdrawLimitLabel: {
    fontFamily: theme.fonts.bodyBold,
    color: colors.textMuted,
    fontSize: 12,
  },
  withdrawLimitVal: {
    fontFamily: theme.fonts.digitalRegular,
    color: colors.real,
    fontWeight: "800",
    fontSize: 14,
  },

  /* KYC Notice */
  kycNoticeCard: {
    alignItems: "center",
    padding: 16,
  },
  kycNoticeIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  kycNoticeTitle: {
    fontFamily: theme.fonts.bodyBold,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 4,
  },
  kycNoticeText: {
    fontFamily: theme.fonts.body,
    color: colors.textMuted,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 16,
  },



  demoText: { color: colors.demo },
  realText: { color: colors.real },

  // ── Bonus Info Card ──────────────────────────────────────────────
  bonusInfoCard: {
    backgroundColor: "rgba(168, 85, 247, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(168, 85, 247, 0.3)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  bonusInfoTitle: {
    fontFamily: theme.fonts.marquee,
    color: "#c084fc",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 4,
  },
  bonusInfoAmount: {
    fontFamily: theme.fonts.digitalRegular,
    color: "#e9d5ff",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 4,
  },
  bonusInfoNote: {
    fontFamily: theme.fonts.body,
    color: "#a78bfa",
    fontSize: 11,
    lineHeight: 16,
  },
});
