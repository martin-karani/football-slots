import { useState, useEffect } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGameStore } from "../store/GameProvider";
import { useWallet } from "../hooks/useWallet";
import { formatMinor, PaymentProviderInfo, PROVIDER_BRANDING } from "../types";
import { useAppNavigation, useGoBack } from "../navigation/types";
import { useToast } from "../components/Toast";
import { theme } from "../components/theme";
import { AmountSelector } from "../components/AmountSelector";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { walletApi, paymentsApi } from "../api/client";
import { LedgerEntry } from "../types";
import { MpesaDepositModal } from "../components/MpesaDepositModal";
import { MpesaWithdrawalModal } from "../components/MpesaWithdrawalModal";

type WalletTab = "overview" | "deposit" | "withdraw";

export function WalletScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useAppNavigation();
  const goBack = useGoBack();
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
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [providers, setProviders] = useState<PaymentProviderInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("mpesa");

  // M-Pesa Interactive Deposit State
  const [activeDepositTxId, setActiveDepositTxId] = useState<string | null>(null);
  const [depositModalVisible, setDepositModalVisible] = useState(false);
  const [activeDepositPhone, setActiveDepositPhone] = useState("");
  const [activeDepositAmount, setActiveDepositAmount] = useState(0);

  // M-Pesa Interactive Withdrawal State
  const [activeWithdrawTxId, setActiveWithdrawTxId] = useState<string | null>(null);
  const [withdrawModalVisible, setWithdrawModalVisible] = useState(false);
  const [activeWithdrawPhone, setActiveWithdrawPhone] = useState("");
  const [activeWithdrawAmount, setActiveWithdrawAmount] = useState(0);

  const isReal = currency === "real";

  // Fetch providers on mount
  useEffect(() => {
    paymentsApi.providers()
      .then((res) => {
        const enabled = res.data.providers.filter((p) => p.enabled);
        setProviders(enabled);
        if (enabled.length > 0 && !enabled.find((p) => p.code === selectedProvider)) {
          setSelectedProvider(enabled[0].code);
        }
      })
      .catch(() => { /* fallback to default mpesa */ });
  }, []);

  // Fetch ledger whenever currency changes
  useEffect(() => {
    walletApi
      .ledger(isReal ? "real" : "virtual", 10)
      .then((res) => setLedgerEntries(res.data.entries))
      .catch(() => { });
  }, [currency]);

  const handleDeposit = async () => {
    const amount = parseInt(depositAmount, 10);
    if (!amount || amount < 10) {
      showError("Minimum deposit is KES 10");
      return;
    }
    const phone = (depositPhone || phoneNumber || "").trim().replace(/\s+/g, "");
    if (!phone || phone.length < 9) {
      showError("Enter a valid phone number");
      return;
    }
    setDepositLoading(true);
    try {
      const data = await deposit(selectedProvider, phone, amount);
      if (selectedProvider === "mpesa" && data?.transaction_id) {
        setActiveDepositTxId(data.transaction_id);
        setActiveDepositPhone(phone);
        setActiveDepositAmount(amount);
        setDepositModalVisible(true);
      } else {
        const providerName = providers.find((p) => p.code === selectedProvider)?.display_name || selectedProvider;
        showSuccess(`Payment request sent to ${phone} via ${providerName}! Check your phone.`);
        setTimeout(() => {
          fetchBalance();
          setActiveTab("overview");
        }, 3000);
      }
    } catch (e: any) {
      showError(e?.response?.data?.message || "Failed to initiate deposit");
    } finally {
      setDepositLoading(false);
    }
  };

  const handleDepositRetry = async (): Promise<string | null> => {
    try {
      const data = await deposit(selectedProvider, activeDepositPhone, activeDepositAmount);
      if (data?.transaction_id) {
        setActiveDepositTxId(data.transaction_id);
        return data.transaction_id;
      }
      return null;
    } catch (e: any) {
      showError(e?.response?.data?.message || "Retry failed. Try again.");
      return null;
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
      showError("Enter a valid phone number");
      return;
    }
    if (amount * 100 > balances.real) {
      showError("Withdrawal exceeds your available real balance");
      return;
    }
    setWithdrawLoading(true);
    try {
      const data = await withdraw(selectedProvider, phone, amount);
      if (selectedProvider === "mpesa" && data?.transaction_id) {
        setActiveWithdrawTxId(data.transaction_id);
        setActiveWithdrawPhone(phone);
        setActiveWithdrawAmount(amount);
        setWithdrawModalVisible(true);
      } else {
        const providerName = providers.find((p) => p.code === selectedProvider)?.display_name || selectedProvider;
        showSuccess(`KES ${amount} withdrawn successfully to ${providerName}!`);
        setTimeout(() => {
          fetchBalance();
          setActiveTab("overview");
        }, 2000);
      }
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
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#5c0090" />

      {/* ── Marquee Header ── */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 14) + 6 }]}>
        <TouchableOpacity
          onPress={() =>
            activeTab !== "overview" ? setActiveTab("overview") : goBack()
          }
          style={styles.backBtn}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color="#FFE566" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {activeTab === "deposit" ? "DEPOSIT" : activeTab === "withdraw" ? "WITHDRAW" : "WALLET"}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "overview" && (
          <>
            {/* ── HERO BALANCE CARD ── */}
            <View style={styles.heroBalanceCard}>
              <View style={styles.heroHeaderRow}>
                <View style={styles.goldDot} />
                <Text style={styles.heroModeLabel}>REAL BALANCE · KES</Text>
              </View>
              <Text style={styles.heroBalanceNumber}>{realBalanceDisplay}</Text>
              <View style={styles.heroActionRow}>
                <TouchableOpacity
                  style={styles.heroDepositBtn}
                  onPress={() => setActiveTab("deposit")}
                  activeOpacity={0.85}
                >
                  <Ionicons name="arrow-up" size={16} color="#1a0033" />
                  <Text style={styles.heroDepositBtnText}>Deposit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.heroWithdrawBtn}
                  onPress={() => setActiveTab("withdraw")}
                  activeOpacity={0.85}
                >
                  <Ionicons name="arrow-down" size={16} color="#FFFFFF" />
                  <Text style={styles.heroWithdrawBtnText}>Withdraw</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── DEMO CHIP ── */}
            <View style={styles.chipsRow}>
              <View style={styles.demoChip}>
                <Text style={styles.demoChipTag}>DEMO</Text>
                <Text style={styles.chipBalanceValue}>{demoBalanceDisplay}</Text>
                <TouchableOpacity onPress={topupVirtual} style={styles.chipRefillBtn}>
                  <Text style={styles.chipRefillText}>+ Free Refill</Text>
                </TouchableOpacity>
              </View>

            </View>

            {/* ── RECENT ACTIVITY STRIP ── */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeading}>Recent activity</Text>
              <TouchableOpacity onPress={() => navigation.navigate("Transactions")} activeOpacity={0.7}>
                <Text style={styles.seeAllText}>See all</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.activityFeed}>
              {ledgerEntries.length === 0 ? (
                <View style={styles.activityItem}>
                  <View style={styles.activityMeta}>
                    <Text style={[styles.activitySub, { textAlign: "center", paddingVertical: 8 }]}>
                      No transactions yet
                    </Text>
                  </View>
                </View>
              ) : (
                ledgerEntries.slice(0, 5).map((entry) => {
                  const isCredit = entry.amount_minor > 0;
                  const isDeposit = entry.entry_type === "mpesa_deposit" || entry.entry_type === "deposit" || entry.entry_type === "manual_deposit";
                  const isWithdrawal = entry.entry_type === "mpesa_withdraw" || entry.entry_type === "withdrawal";
                  const isBet = entry.entry_type === "bet" || entry.entry_type === "spin_debit";
                  const isWin = entry.entry_type === "win" || entry.entry_type === "payout";

                  const glyph = isDeposit ? "↓" : isWithdrawal ? "↑" : isWin ? "★" : "•";

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
                    : entry.entry_type.replace(/_/g, " ");

                  const sub = isDeposit || isWithdrawal
                    ? "Payment · instant"
                    : isBet || isWin
                    ? "Football Slots"
                    : "";

                  const amountKes = (Math.abs(entry.amount_minor) / 100).toLocaleString();
                  const amountStr = `${isCredit ? "+" : "−"}${amountKes}`;
                  const amountColor = isCredit ? "#22c55e" : "#FFFFFF";

                  return (
                    <View key={entry.id} style={styles.activityItem}>
                      <View style={[styles.activityIcon, { backgroundColor: glyphBg }]}>
                        <Text style={{ fontFamily: theme.fonts.heading, fontSize: 17, fontWeight: "800", color: glyphFg }}>
                          {glyph}
                        </Text>
                      </View>
                      <View style={styles.activityMeta}>
                        <Text style={styles.activityTitle}>{title}</Text>
                        <Text style={styles.activitySub}>{sub}</Text>
                      </View>
                      <Text style={[styles.activityAmount, { color: amountColor }]}>{amountStr}</Text>
                    </View>
                  );
                })
              )}
            </View>
          </>
        )}

        {/* ── DEPOSIT TAB ── */}
        {activeTab === "deposit" && (
          <View style={styles.formContainer}>
            {/* Provider Badge Card */}
            <View style={styles.mpesaInfoCard}>
              <View style={[styles.mpesaLogoBox, { backgroundColor: PROVIDER_BRANDING[selectedProvider]?.color || "#4CAF50" }]}>
                <Text style={styles.mpesaLogoText}>{providers.find((p) => p.code === selectedProvider)?.display_name || selectedProvider.toUpperCase()}</Text>
              </View>
              <View style={styles.mpesaInfoText}>
                <Text style={styles.mpesaInfoTitle}>Instant Deposit</Text>
                <Text style={styles.mpesaInfoSub}>A prompt appears on your phone to confirm</Text>
              </View>
            </View>

            {/* Provider Selector */}
            {providers.length > 1 && (
              <View style={styles.providerSelectorRow}>
                {providers.map((p) => (
                  <TouchableOpacity
                    key={p.code}
                    style={[styles.providerPill, selectedProvider === p.code && styles.providerPillActive]}
                    onPress={() => setSelectedProvider(p.code)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.providerDot, { backgroundColor: PROVIDER_BRANDING[p.code]?.color || "#4CAF50" }]} />
                    <Text style={[styles.providerPillText, selectedProvider === p.code && styles.providerPillTextActive]}>
                      {p.display_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Custom Deposit Amount Input */}
            <Text style={styles.fieldLabel}>CUSTOM DEPOSIT AMOUNT (KES)</Text>
            <View style={styles.textInputCard}>
              <Text style={styles.inputPrefix}>KES</Text>
              <TextInput
                style={styles.inputField}
                placeholder="1000"
                value={depositAmount}
                onChangeText={(text) => setDepositAmount(text.replace(/[^0-9]/g, ""))}
                keyboardType="numeric"
                placeholderTextColor="rgba(255,255,255,0.3)"
              />
              {depositAmount.length > 0 && (
                <TouchableOpacity
                  onPress={() => setDepositAmount("")}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              )}
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
                      +{val}
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
                placeholderTextColor="rgba(255,255,255,0.3)"
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
                <ActivityIndicator color="#1a0033" />
              ) : (
                <Text style={styles.primaryGoldBtnText}>Deposit KES {depositAmount || "0"}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelLink}
              onPress={() => setActiveTab("overview")}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelLinkText}>Back to Wallet</Text>
            </TouchableOpacity>

            <View style={styles.securedFooter}>
              <Ionicons name="lock-closed-outline" size={13} color="rgba(255,255,255,0.4)" />
              <Text style={styles.securedText}>Secured by Safaricom Daraja</Text>
            </View>
          </View>
        )}

        {/* ── WITHDRAW TAB ── */}
        {activeTab === "withdraw" && (
          <View style={styles.formContainer}>
            {/* Withdrawable Balance Info */}
            <View style={styles.withdrawableCard}>
              <View>
                <Text style={styles.withdrawableLabel}>WITHDRAWABLE BALANCE</Text>
                <Text style={styles.withdrawableAmount}>KES {realBalanceDisplay}</Text>
              </View>
              <View style={styles.kycOkBadge}>
                <Ionicons name="checkmark" size={14} color="#22c55e" />
                <Text style={styles.kycOkText}>KYC OK</Text>
              </View>
            </View>

            {/* Custom Withdraw Amount Input */}
            <Text style={styles.fieldLabel}>CUSTOM WITHDRAW AMOUNT (KES)</Text>
            <View style={styles.textInputCard}>
              <Text style={styles.inputPrefix}>KES</Text>
              <TextInput
                style={styles.inputField}
                placeholder="5000"
                value={withdrawAmount}
                onChangeText={(text) => setWithdrawAmount(text.replace(/[^0-9]/g, ""))}
                keyboardType="numeric"
                placeholderTextColor="rgba(255,255,255,0.3)"
              />
              {withdrawAmount.length > 0 && (
                <TouchableOpacity
                  onPress={() => setWithdrawAmount("")}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              )}
            </View>

            {/* Quick Preset Chips */}
            <View style={styles.presetsRow}>
              {quickWithdrawPresets.map((val) => {
                const isSelected = withdrawAmount === val.toString();
                return (
                  <TouchableOpacity
                    key={val}
                    style={[styles.presetChip, isSelected && styles.presetChipActivePurple]}
                    onPress={() => setWithdrawAmount(val.toString())}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.presetChipText, isSelected && styles.presetChipTextActivePurple]}>
                      +{val}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[
                  styles.presetChip,
                  withdrawAmount === Math.floor(balances.real / 100).toString() && styles.presetChipActivePurple,
                ]}
                onPress={() => setWithdrawAmount(Math.floor(balances.real / 100).toString())}
                activeOpacity={0.7}
              >
                <Text style={[styles.presetChipText, { color: "#FFD700", fontWeight: "900" }]}>MAX</Text>
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
                placeholderTextColor="rgba(255,255,255,0.3)"
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
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.secondaryBorderBtnText}>Withdraw KES {withdrawAmount || "0"}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelLink}
              onPress={() => setActiveTab("overview")}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelLinkText}>Back to Wallet</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* ── Interactive M-Pesa Deposit Flow Modal ── */}
      <MpesaDepositModal
        visible={depositModalVisible}
        transactionId={activeDepositTxId}
        phoneNumber={activeDepositPhone}
        amountKES={activeDepositAmount}
        onSuccess={(receipt) => {
          fetchBalance();
          showSuccess(
            `KES ${activeDepositAmount.toLocaleString()} added to your Real Balance!${receipt ? ` (Receipt: ${receipt})` : ""}`,
            "Deposit Confirmed"
          );
        }}
        onRetry={handleDepositRetry}
        onClose={() => {
          setDepositModalVisible(false);
          fetchBalance();
        }}
      />

      {/* ── Interactive M-Pesa Withdrawal Flow Modal ── */}
      <MpesaWithdrawalModal
        visible={withdrawModalVisible}
        transactionId={activeWithdrawTxId}
        phoneNumber={activeWithdrawPhone}
        amountKES={activeWithdrawAmount}
        onSuccess={(receipt) => {
          fetchBalance();
          showSuccess(
            `KES ${activeWithdrawAmount.toLocaleString()} sent to ${activeWithdrawPhone}!${receipt ? ` (Receipt: ${receipt})` : ""}`,
            "Withdrawal Confirmed"
          );
        }}
        onClose={() => {
          setWithdrawModalVisible(false);
          fetchBalance();
        }}
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
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 14,
    paddingBottom: 36,
  },

  /* ── Marquee Header ── */
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
    color: "#fff",
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: 2,
    textAlign: "center",
    textShadowColor: "#FFD700",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },

  /* ── Hero Balance Card ── */
  heroBalanceCard: {
    borderRadius: 20,
    padding: 22,
    backgroundColor: "#220538",
    borderWidth: 1.5,
    borderColor: "rgba(255,215,0,0.35)",
    marginTop: 16,
    marginBottom: 14,
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
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
    backgroundColor: "#FFD700",
  },
  heroModeLabel: {
    fontFamily: fonts.button,
    fontSize: 11,
    letterSpacing: 1.5,
    color: "#FFD700",
  },
  heroBalanceNumber: {
    fontFamily: fonts.numbers,
    fontSize: 40,
    color: "#FFFFFF",
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
    backgroundColor: "#FFD700",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  heroDepositBtnText: {
    fontFamily: fonts.heading,
    fontSize: 14.5,
    color: "#1a0033",
  },
  heroWithdrawBtn: {
    flex: 1,
    height: 46,
    borderRadius: 13,
    backgroundColor: "#7a00b8",
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.4)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  heroWithdrawBtnText: {
    fontFamily: fonts.heading,
    fontSize: 14.5,
    color: "#FFFFFF",
  },

  /* ── Chips Row ── */
  chipsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 22,
  },
  demoChip: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "#220538",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.35)",
    padding: 14,
  },
  demoChipTag: {
    fontFamily: fonts.button,
    fontSize: 10,
    letterSpacing: 1.2,
    color: "#22c55e",
    marginBottom: 4,
  },

  chipBalanceValue: {
    fontFamily: fonts.numbers,
    fontSize: 18,
    color: "#FFFFFF",
    lineHeight: 22,
  },
  chipRefillBtn: { marginTop: 6 },
  chipRefillText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: "#22c55e",
  },
  chipSubtitle: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    marginTop: 6,
  },

  /* ── Activity Feed ── */
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionHeading: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: "#FFD700",
    letterSpacing: 0.5,
  },
  seeAllText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: "#a855f7",
  },
  activityFeed: { flexDirection: "column", gap: 9 },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 13,
    borderRadius: 14,
    backgroundColor: "#220538",
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.15)",
  },
  activityIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  activityMeta: { flex: 1 },
  activityTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  activitySub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: "rgba(255,255,255,0.45)",
    marginTop: 2,
  },
  activityAmount: {
    fontFamily: fonts.numbers,
    fontSize: 15,
    fontWeight: "700",
  },

  /* ── Form Styles ── */
  formContainer: { marginTop: 10 },
  mpesaInfoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "rgba(34,197,94,0.08)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.3)",
    marginBottom: 22,
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
    fontSize: 10,
    color: "#fff",
  },
  mpesaInfoText: { flex: 1 },
  mpesaInfoTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: "#FFFFFF",
  },
  mpesaInfoSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    marginTop: 2,
  },
  withdrawableCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#220538",
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.3)",
    marginBottom: 18,
  },
  withdrawableLabel: {
    fontFamily: fonts.button,
    fontSize: 10,
    letterSpacing: 1.2,
    color: "#FFD700",
    marginBottom: 4,
  },
  withdrawableAmount: {
    fontFamily: fonts.numbers,
    fontSize: 24,
    color: "#FFFFFF",
  },
  kycOkBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: "rgba(34,197,94,0.14)",
  },
  kycOkText: {
    fontFamily: fonts.button,
    fontSize: 11,
    color: "#22c55e",
  },
  amountDisplayBlock: { alignItems: "center", marginBottom: 22 },
  amountDisplayLabel: {
    fontFamily: fonts.button,
    fontSize: 11,
    letterSpacing: 1.5,
    color: "rgba(255,255,255,0.4)",
    marginBottom: 8,
  },
  amountDisplayNumber: {
    fontFamily: fonts.numbers,
    fontSize: 46,
    color: "#FFFFFF",
    lineHeight: 50,
  },
  amountCurrencyPrefix: {
    fontSize: 22,
    color: "rgba(255,255,255,0.4)",
  },
  presetsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginBottom: 22,
  },
  presetChip: {
    flex: 1,
    minWidth: 56,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#220538",
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  presetChipActiveGold: {
    backgroundColor: "rgba(255,215,0,0.15)",
    borderColor: "#FFD700",
  },
  presetChipActivePurple: {
    backgroundColor: "rgba(122,0,184,0.2)",
    borderColor: "#7a00b8",
  },
  presetChipText: {
    fontFamily: fonts.numbers,
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
  },
  presetChipTextActiveGold: {
    color: "#FFD700",
    fontWeight: "700",
  },
  presetChipTextActivePurple: {
    color: "#c084fc",
    fontWeight: "700",
  },
  fieldLabel: {
    fontFamily: fonts.button,
    fontSize: 11,
    letterSpacing: 1,
    color: "rgba(255,255,255,0.4)",
    marginBottom: 9,
  },
  textInputCard: {
    height: 54,
    borderRadius: 14,
    backgroundColor: "#220538",
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.25)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  inputField: {
    flex: 1,
    fontFamily: fonts.numbersRegular,
    fontSize: 16,
    color: "#FFFFFF",
  },
  registeredTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  registeredTagText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
  },
  limitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    marginBottom: 24,
  },
  limitText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: "rgba(255,255,255,0.35)",
  },
  primaryGoldBtn: {
    height: 56,
    borderRadius: 15,
    backgroundColor: "#FFD700",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 6,
  },
  primaryGoldBtnText: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: "#1a0033",
  },
  secondaryBorderBtn: {
    height: 56,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: "rgba(255,215,0,0.4)",
    backgroundColor: "#7a00b8",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBorderBtnText: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: "#FFFFFF",
  },
  inputPrefix: {
    fontFamily: fonts.button,
    fontSize: 14,
    color: "#FFD700",
    marginRight: 8,
    letterSpacing: 0.5,
  },
  cancelLink: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    marginTop: 6,
  },
  cancelLinkText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.5)",
    textDecorationLine: "underline",
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
    color: "rgba(255,255,255,0.35)",
  },
  btnDisabled: { opacity: 0.6 },

  // Provider selector
  providerSelectorRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  providerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  providerPillActive: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,215,0,0.4)",
  },
  providerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  providerPillText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
  },
  providerPillTextActive: {
    color: "#FFFFFF",
    fontFamily: fonts.bodyBold,
  },
});
