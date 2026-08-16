import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useGameStore } from "../store/GameProvider";
import { useWallet } from "../hooks/useWallet";
import { formatMinor } from "../types";
import { useToast } from "../components/Toast";
import { theme } from "../components/theme";
import { ScreenHeader } from "../components/ScreenHeader";
import { AmountSelector } from "../components/AmountSelector";
import { Ionicons } from "@react-native-vector-icons/ionicons";

type WalletTab = "overview" | "deposit" | "withdraw";

export function WalletScreen() {
  const navigation = useNavigation<any>();
  const balances = useGameStore((state) => state.balances);
  const currency = useGameStore((state) => state.currency);
  const { deposit, withdraw, fetchBalance, topupVirtual } = useWallet();
  const { showError, showSuccess, showInfo } = useToast();
  const kycStatus = useGameStore((state) => state.kycStatus);
  const phoneNumber = useGameStore((state) => state.phoneNumber);

  const [activeTab, setActiveTab] = useState<WalletTab>("overview");
  const [depositAmount, setDepositAmount] = useState("1000");
  const [depositPhone, setDepositPhone] = useState(phoneNumber || "");
  const [withdrawAmount, setWithdrawAmount] = useState("5000");
  const [withdrawPhone, setWithdrawPhone] = useState(phoneNumber || "");
  const [depositLoading, setDepositLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  const isReal = currency === "real" || currency === "bonus";

  const handleDeposit = async () => {
    const amount = parseInt(depositAmount, 10);
    if (!amount || amount < 10) {
      showError("Minimum deposit is KES 10");
      return;
    }
    const phone = (depositPhone || phoneNumber || "").trim().replace(/\s+/g, "");
    if (!phone || phone.length < 9) {
      showError("Enter a valid M-Pesa phone number");
      return;
    }
    setDepositLoading(true);
    try {
      await deposit(phone, amount);
      showSuccess(`STK Push sent to ${phone}! Check your phone.`);
      setTimeout(() => {
        fetchBalance();
        setActiveTab("overview");
      }, 3000);
    } catch (e: any) {
      showError(e?.response?.data?.message || "Failed to initiate deposit");
    } finally {
      setDepositLoading(false);
    }
  };

  const handleWithdraw = async () => {
    const amount = parseInt(withdrawAmount, 10);
    if (!amount || amount < 100) {
      showError("Minimum withdrawal is KES 100");
      return;
    }
    const phone = (withdrawPhone || phoneNumber || "").trim().replace(/\s+/g, "");
    if (!phone || phone.length < 9) {
      showError("Enter a valid M-Pesa phone number");
      return;
    }
    if (amount * 100 > balances.real) {
      showError("Withdrawal exceeds your available real balance");
      return;
    }
    setWithdrawLoading(true);
    try {
      await withdraw(phone, amount);
      showSuccess(`KES ${amount} withdrawn successfully to M-Pesa!`);
      setTimeout(() => {
        fetchBalance();
        setActiveTab("overview");
      }, 2000);
    } catch (e: any) {
      showError(e?.response?.data?.message || "Failed to process withdrawal");
    } finally {
      setWithdrawLoading(false);
    }
  };

  const quickDepositPresets = [100, 500, 1000, 2500, 5000];
  const quickWithdrawPresets = [500, 1000, 5000];

  const realBalanceDisplay = formatMinor(balances.real, "real");
  const demoBalanceDisplay = formatMinor(balances.virtual, "virtual");
  const bonusBalanceDisplay = formatMinor(balances.bonus, "bonus");

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.surface} />

      {/* Screen Header */}
      <ScreenHeader
        title={activeTab === "deposit" ? "Deposit" : activeTab === "withdraw" ? "Withdraw" : "Wallet"}
        showBack={activeTab !== "overview"}
        onBack={() => setActiveTab("overview")}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "overview" && (
          <>
            {/* HERO BALANCE CARD */}
            <View style={styles.heroBalanceCard}>
              <View style={styles.heroHeaderRow}>
                <View style={styles.goldDot} />
                <Text style={styles.heroModeLabel}>REAL BALANCE · KES</Text>
              </View>
              <Text style={styles.heroBalanceNumber}>
                {realBalanceDisplay}
              </Text>
              <View style={styles.heroActionRow}>
                <TouchableOpacity
                  style={styles.heroDepositBtn}
                  onPress={() => setActiveTab("deposit")}
                  activeOpacity={0.85}
                >
                  <Ionicons name="arrow-up" size={16} color="#1A1206" />
                  <Text style={styles.heroDepositBtnText}>Deposit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.heroWithdrawBtn}
                  onPress={() => setActiveTab("withdraw")}
                  activeOpacity={0.85}
                >
                  <Ionicons name="arrow-down" size={16} color={theme.colors.textPrimary} />
                  <Text style={styles.heroWithdrawBtnText}>Withdraw</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* BALANCE CHIPS ROW: DEMO & BONUS */}
            <View style={styles.chipsRow}>
              <View style={styles.demoChip}>
                <Text style={styles.demoChipTag}>DEMO</Text>
                <Text style={styles.chipBalanceValue}>{demoBalanceDisplay}</Text>
                <TouchableOpacity onPress={topupVirtual} style={styles.chipRefillBtn}>
                  <Text style={styles.chipRefillText}>+ Free Refill</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.bonusChip}>
                <Text style={styles.bonusChipTag}>BONUS</Text>
                <Text style={styles.chipBalanceValue}>{bonusBalanceDisplay}</Text>
                <Text style={styles.chipSubtitle}>5× wagering</Text>
              </View>
            </View>

            {/* RECENT ACTIVITY STRIP */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeading}>Recent activity</Text>
              <TouchableOpacity onPress={() => navigation.navigate("Activity")} activeOpacity={0.7}>
                <Text style={styles.seeAllText}>See all</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.activityFeed}>
              <View style={styles.activityItem}>
                <View style={[styles.activityIcon, { backgroundColor: "rgba(47,212,138,0.14)" }]}>
                  <Ionicons name="arrow-down" size={18} color={theme.colors.success} />
                </View>
                <View style={styles.activityMeta}>
                  <Text style={styles.activityTitle}>Deposit</Text>
                  <Text style={styles.activitySub}>M-Pesa · instant</Text>
                </View>
                <Text style={[styles.activityAmount, { color: theme.colors.success }]}>+1,000</Text>
              </View>

              <View style={styles.activityItem}>
                <View style={[styles.activityIcon, { backgroundColor: "rgba(47,212,138,0.14)" }]}>
                  <Ionicons name="trophy" size={16} color={theme.colors.success} />
                </View>
                <View style={styles.activityMeta}>
                  <Text style={styles.activityTitle}>Win credited</Text>
                  <Text style={styles.activitySub}>Bayern ×25</Text>
                </View>
                <Text style={[styles.activityAmount, { color: theme.colors.success }]}>+1,000</Text>
              </View>

              <View style={styles.activityItem}>
                <View style={[styles.activityIcon, { backgroundColor: "rgba(231,200,119,0.14)" }]}>
                  <Ionicons name="arrow-up" size={18} color={theme.colors.gold} />
                </View>
                <View style={styles.activityMeta}>
                  <Text style={styles.activityTitle}>Withdrawal</Text>
                  <Text style={styles.activitySub}>M-Pesa · registered line</Text>
                </View>
                <Text style={[styles.activityAmount, { color: theme.colors.textPrimary }]}>-500</Text>
              </View>
            </View>
          </>
        )}

        {/* ─── DEPOSIT TAB ─── */}
        {activeTab === "deposit" && (
          <View style={styles.formContainer}>
            {/* M-Pesa Badge Card */}
            <View style={styles.mpesaInfoCard}>
              <View style={styles.mpesaLogoBox}>
                <Text style={styles.mpesaLogoText}>M-PESA</Text>
              </View>
              <View style={styles.mpesaInfoText}>
                <Text style={styles.mpesaInfoTitle}>Instant M-Pesa STK Push</Text>
                <Text style={styles.mpesaInfoSub}>A prompt appears on your phone to confirm</Text>
              </View>
            </View>

            {/* Amount Big Display */}
            <View style={styles.amountDisplayBlock}>
              <Text style={styles.amountDisplayLabel}>ENTER AMOUNT</Text>
              <Text style={styles.amountDisplayNumber}>
                <Text style={styles.amountCurrencyPrefix}>KES </Text>
                {depositAmount || "0"}
              </Text>
            </View>

            {/* Quick Preset Chips */}
            <View style={styles.presetsRow}>
              {quickDepositPresets.map((val) => {
                const isSelected = depositAmount === val.toString();
                return (
                  <TouchableOpacity
                    key={val}
                    style={[styles.presetChip, isSelected && styles.presetChipActiveGold]}
                    onPress={() => setDepositAmount(val.toString())}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.presetChipText, isSelected && styles.presetChipTextActiveGold]}>
                      {val}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>M-PESA PHONE NUMBER</Text>
            <View style={styles.textInputCard}>
              <TextInput
                style={styles.inputField}
                placeholder="0712 345 678"
                value={depositPhone}
                onChangeText={setDepositPhone}
                keyboardType="phone-pad"
                placeholderTextColor={theme.colors.textDim}
              />
            </View>

            <View style={styles.limitRow}>
              <Text style={styles.limitText}>Min KES 10</Text>
              <Text style={styles.limitText}>Max KES 500,000 / day</Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryGoldBtn, depositLoading && styles.btnDisabled]}
              onPress={handleDeposit}
              disabled={depositLoading}
              activeOpacity={0.85}
            >
              {depositLoading ? (
                <ActivityIndicator color="#1A1206" />
              ) : (
                <Text style={styles.primaryGoldBtnText}>Deposit KES {depositAmount || "0"}</Text>
              )}
            </TouchableOpacity>

            <View style={styles.securedFooter}>
              <Ionicons name="lock-closed-outline" size={13} color={theme.colors.textDim} />
              <Text style={styles.securedText}>Secured by Safaricom Daraja</Text>
            </View>
          </View>
        )}

        {/* ─── WITHDRAW TAB ─── */}
        {activeTab === "withdraw" && (
          <View style={styles.formContainer}>
            {/* Withdrawable Balance Info */}
            <View style={styles.withdrawableCard}>
              <View>
                <Text style={styles.withdrawableLabel}>WITHDRAWABLE BALANCE</Text>
                <Text style={styles.withdrawableAmount}>KES {realBalanceDisplay}</Text>
              </View>
              <View style={styles.kycOkBadge}>
                <Ionicons name="checkmark" size={14} color={theme.colors.success} />
                <Text style={styles.kycOkText}>KYC OK</Text>
              </View>
            </View>

            {/* Amount Big Display */}
            <View style={styles.amountDisplayBlock}>
              <Text style={styles.amountDisplayLabel}>WITHDRAW AMOUNT</Text>
              <Text style={styles.amountDisplayNumber}>
                <Text style={styles.amountCurrencyPrefix}>KES </Text>
                {withdrawAmount || "0"}
              </Text>
            </View>

            {/* Quick Preset Chips */}
            <View style={styles.presetsRow}>
              {quickWithdrawPresets.map((val) => {
                const isSelected = withdrawAmount === val.toString();
                return (
                  <TouchableOpacity
                    key={val}
                    style={[styles.presetChip, isSelected && styles.presetChipActiveBlue]}
                    onPress={() => setWithdrawAmount(val.toString())}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.presetChipText, isSelected && styles.presetChipTextActiveBlue]}>
                      {val}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => setWithdrawAmount(Math.floor(balances.real / 100).toString())}
                activeOpacity={0.7}
              >
                <Text style={styles.presetChipText}>MAX</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>TO M-PESA NUMBER</Text>
            <View style={styles.textInputCard}>
              <TextInput
                style={styles.inputField}
                placeholder="0712 345 678"
                value={withdrawPhone}
                onChangeText={setWithdrawPhone}
                keyboardType="phone-pad"
                placeholderTextColor={theme.colors.textDim}
              />
              <View style={styles.registeredTag}>
                <Text style={styles.registeredTagText}>Registered</Text>
              </View>
            </View>

            <View style={styles.limitRow}>
              <Text style={styles.limitText}>Min KES 100</Text>
              <Text style={styles.limitText}>Instant to M-Pesa</Text>
            </View>

            <TouchableOpacity
              style={[styles.secondaryBorderBtn, withdrawLoading && styles.btnDisabled]}
              onPress={handleWithdraw}
              disabled={withdrawLoading}
              activeOpacity={0.85}
            >
              {withdrawLoading ? (
                <ActivityIndicator color={theme.colors.textPrimary} />
              ) : (
                <Text style={styles.secondaryBorderBtnText}>Withdraw KES {withdrawAmount || "0"}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const { colors, radius, fonts } = theme;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 36,
  },

  /* HERO BALANCE CARD */
  heroBalanceCard: {
    borderRadius: 22,
    padding: 24,
    backgroundColor: "rgba(29, 42, 80, 0.45)",
    borderWidth: 1,
    borderColor: "rgba(231, 200, 119, 0.28)",
    marginTop: 8,
    marginBottom: 16,
  },
  heroHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  goldDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.gold,
  },
  heroModeLabel: {
    fontFamily: fonts.heading,
    fontSize: 11.5,
    letterSpacing: 1.5,
    color: colors.gold,
  },
  heroBalanceNumber: {
    fontFamily: fonts.numbers,
    fontSize: 40,
    color: colors.textPrimary,
    lineHeight: 46,
    letterSpacing: 0.5,
  },
  heroActionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 22,
  },
  heroDepositBtn: {
    flex: 1,
    height: 46,
    borderRadius: 13,
    backgroundColor: colors.gold,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
  heroDepositBtnText: {
    fontFamily: fonts.heading,
    fontSize: 14.5,
    color: "#1A1206",
  },
  heroWithdrawBtn: {
    flex: 1,
    height: 46,
    borderRadius: 13,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 208, 0.28)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  heroWithdrawBtnText: {
    fontFamily: fonts.heading,
    fontSize: 14.5,
    color: colors.textPrimary,
  },

  /* CHIPS ROW */
  chipsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  demoChip: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: "rgba(47, 212, 138, 0.28)",
    padding: 14,
  },
  demoChipTag: {
    fontFamily: fonts.heading,
    fontSize: 10.5,
    letterSpacing: 1.2,
    color: colors.success,
    marginBottom: 4,
  },
  bonusChip: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: "rgba(196, 162, 255, 0.3)",
    padding: 14,
  },
  bonusChipTag: {
    fontFamily: fonts.heading,
    fontSize: 10.5,
    letterSpacing: 1.2,
    color: colors.bonusAccent,
    marginBottom: 4,
  },
  chipBalanceValue: {
    fontFamily: fonts.numbers,
    fontSize: 18,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  chipRefillBtn: {
    marginTop: 6,
  },
  chipRefillText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.blueLight,
  },
  chipSubtitle: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textDim,
    marginTop: 6,
  },

  /* ACTIVITY FEED */
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionHeading: {
    fontFamily: fonts.headingBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  seeAllText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.blueLight,
  },
  activityFeed: {
    flexDirection: "column",
    gap: 9,
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 13,
    borderRadius: 15,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  activityIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  activityMeta: {
    flex: 1,
  },
  activityTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  activitySub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textDim,
    marginTop: 2,
  },
  activityAmount: {
    fontFamily: fonts.numbers,
    fontSize: 15,
    fontWeight: "700",
  },

  /* FORM STYLES (Deposit & Withdraw) */
  formContainer: {
    marginTop: 10,
  },
  mpesaInfoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 14,
    borderRadius: 15,
    backgroundColor: "rgba(47, 212, 138, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(47, 212, 138, 0.25)",
    marginBottom: 24,
  },
  mpesaLogoBox: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: "#0B7A3B",
    justifyContent: "center",
    alignItems: "center",
  },
  mpesaLogoText: {
    fontFamily: fonts.headingBold,
    fontSize: 10.5,
    color: "#fff",
  },
  mpesaInfoText: {
    flex: 1,
  },
  mpesaInfoTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 13.5,
    color: colors.textPrimary,
  },
  mpesaInfoSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  withdrawableCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    backgroundColor: "rgba(29, 42, 80, 0.45)",
    borderWidth: 1,
    borderColor: "rgba(231, 200, 119, 0.25)",
    marginBottom: 18,
  },
  withdrawableLabel: {
    fontFamily: fonts.heading,
    fontSize: 10.5,
    letterSpacing: 1.2,
    color: colors.gold,
    marginBottom: 4,
  },
  withdrawableAmount: {
    fontFamily: fonts.numbers,
    fontSize: 24,
    color: colors.textPrimary,
  },
  kycOkBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: "rgba(47, 212, 138, 0.14)",
  },
  kycOkText: {
    fontFamily: fonts.heading,
    fontSize: 11,
    color: colors.success,
  },
  amountDisplayBlock: {
    alignItems: "center",
    marginBottom: 22,
  },
  amountDisplayLabel: {
    fontFamily: fonts.heading,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.textDim,
    marginBottom: 8,
  },
  amountDisplayNumber: {
    fontFamily: fonts.numbers,
    fontSize: 46,
    color: colors.textPrimary,
    lineHeight: 50,
  },
  amountCurrencyPrefix: {
    fontSize: 22,
    color: colors.textDim,
  },
  presetsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginBottom: 24,
  },
  presetChip: {
    flex: 1,
    minWidth: 56,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  presetChipActiveGold: {
    backgroundColor: "rgba(231, 200, 119, 0.14)",
    borderColor: colors.gold,
  },
  presetChipActiveBlue: {
    backgroundColor: "rgba(76, 141, 255, 0.14)",
    borderColor: colors.blue,
  },
  presetChipText: {
    fontFamily: fonts.numbers,
    fontSize: 14,
    color: colors.textSecondary,
  },
  presetChipTextActiveGold: {
    color: colors.gold,
    fontWeight: "700",
  },
  presetChipTextActiveBlue: {
    color: colors.blueLight,
    fontWeight: "700",
  },
  fieldLabel: {
    fontFamily: fonts.heading,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textDim,
    marginBottom: 9,
  },
  textInputCard: {
    height: 54,
    borderRadius: 14,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  inputField: {
    flex: 1,
    fontFamily: fonts.numbersRegular,
    fontSize: 16,
    color: colors.textPrimary,
  },
  registeredTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(148, 163, 208, 0.1)",
  },
  registeredTagText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textDim,
  },
  limitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    marginBottom: 26,
  },
  limitText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textDim,
  },
  primaryGoldBtn: {
    height: 56,
    borderRadius: 15,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  primaryGoldBtnText: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: "#1A1206",
  },
  secondaryBorderBtn: {
    height: 56,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 208, 0.3)",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBorderBtnText: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.textPrimary,
  },
  securedFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 18,
  },
  securedText: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.textDim,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
