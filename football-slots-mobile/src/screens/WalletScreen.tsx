import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
} from "react-native";
import { useGameStore } from "../store/GameProvider";
import { useWallet } from "../hooks/useWallet";
import { CurrencyType, formatMinor } from "../types";
import { useToast } from "../components/Toast";

import { authStorage } from "../api/client";

export function WalletScreen() {
  const balances = useGameStore((state) => state.balances);
  const _currency = useGameStore((state) => state.currency);
  const _setCurrency = useGameStore((state) => state.setCurrency);
  const clearAuth = useGameStore((state) => state.clearAuth);
  const { deposit, withdraw, fetchBalance, topupVirtual } = useWallet();
  const { showError } = useToast();

  const [depositAmount, setDepositAmount] = useState("");
  const [depositPhone, setDepositPhone] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawPhone, setWithdrawPhone] = useState("");
  const kycStatus = useGameStore((state) => state.kycStatus);

  const handleLogout = async () => {
    await authStorage.clearToken();
    clearAuth();
  };

  const currencies: { key: CurrencyType; label: string; icon: string }[] = [
    { key: "virtual", label: "FUN", icon: "🎮" },
    { key: "real", label: "KES", icon: "💰" },
    { key: "bonus", label: "BONUS", icon: "🎁" },
  ];

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
    <ScrollView style={styles.container}>
      {/* Currency Toggle */}
      <View style={styles.currencyToggle}>
        {currencies.map((c) => (
          <TouchableOpacity
            key={c.key}
            style={[
              styles.currencyButton,
              _currency === c.key && styles.currencyButtonActive,
            ]}
            onPress={() => _setCurrency(c.key)}
          >
            <Text style={styles.currencyIcon}>{c.icon}</Text>
            <Text
              style={[
                styles.currencyLabel,
                _currency === c.key && styles.currencyLabelActive,
              ]}
            >
              {c.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Balance Display */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>
          {_currency === "real"
            ? "Real Money"
            : _currency === "bonus"
              ? "Bonus"
              : "Play Money"}{" "}
          Balance
        </Text>
        <Text style={styles.balanceAmount}>
          {_currency === "real" ? "KES " : ""}
          {formatMinor(balances[_currency], _currency)}
        </Text>
      </View>

      {/* All Balances Summary */}
      <View style={styles.summaryCard}>
        {currencies.map((c) => (
          <View key={c.key} style={styles.summaryRow}>
            <Text style={styles.summaryIcon}>{c.icon}</Text>
            <Text style={styles.summaryLabel}>{c.label}</Text>
            <Text style={styles.summaryValue}>
              {c.key === "real" ? "KES " : ""}
              {formatMinor(balances[c.key], c.key)}
            </Text>
          </View>
        ))}
      </View>

      {/* Deposit Section (Real Money Only) */}
      {_currency === "real" && (
        <View style={styles.depositCard}>
          <Text style={styles.sectionTitle}>💳 Deposit via M-Pesa</Text>
          <TextInput
            style={styles.input}
            placeholder="M-Pesa Phone Number"
            value={depositPhone}
            onChangeText={setDepositPhone}
            keyboardType="phone-pad"
            placeholderTextColor="#666"
          />
          <TextInput
            style={styles.input}
            placeholder="Amount (KES)"
            value={depositAmount}
            onChangeText={setDepositAmount}
            keyboardType="numeric"
            placeholderTextColor="#666"
          />
          <TouchableOpacity
            style={styles.depositButton}
            onPress={handleDeposit}
          >
            <Text style={styles.depositButtonText}>Deposit</Text>
          </TouchableOpacity>
          <Text style={styles.depositHint}>
            STK Push will be sent to your M-Pesa number
          </Text>
        </View>
      )}

      {/* Withdrawal Section (Real Money Only) */}
      {_currency === "real" && (
        <View style={styles.depositCard}>
          <Text style={styles.sectionTitle}>💸 Withdraw to M-Pesa</Text>
          {kycStatus !== "verified" ? (
            <Text style={styles.depositHint}>
              Withdrawals require a verified account. Complete KYC verification to enable this.
            </Text>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="M-Pesa Phone Number"
                value={withdrawPhone}
                onChangeText={setWithdrawPhone}
                keyboardType="phone-pad"
                placeholderTextColor="#666"
              />
              <TextInput
                style={styles.input}
                placeholder="Amount (KES)"
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                keyboardType="numeric"
                placeholderTextColor="#666"
              />
              <TouchableOpacity
                style={[styles.depositButton, { backgroundColor: "#c0392b" }]}
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
                <Text style={styles.depositButtonText}>Withdraw</Text>
              </TouchableOpacity>
              <Text style={styles.depositHint}>
                Funds are held from your balance immediately and sent to M-Pesa within a few minutes.
              </Text>
            </>
          )}
        </View>
      )}

      {/* Free Refill Section (Virtual Money Only) */}
      {_currency === "virtual" && (
        <View style={styles.depositCard}>
          <Text style={styles.sectionTitle}>🎁 Free FUN Refill</Text>
          <Text style={styles.depositHint}>
            Running low on FUN? Get 1,000 free FUN credits to keep playing!
          </Text>
          <TouchableOpacity
            style={[styles.depositButton, { marginTop: 16 }]}
            onPress={topupVirtual}
          >
            <Text style={styles.depositButtonText}>Refill (1,000 FUN)</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Info Cards */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>ℹ️ About Your Wallet</Text>
        <Text style={styles.infoText}>
          • <Text style={styles.infoBold}>FUN</Text>: Free play money. No real
          value.
        </Text>
        <Text style={styles.infoText}>
          • <Text style={styles.infoBold}>KES</Text>: Real money deposited via
          M-Pesa. Winnings can be withdrawn.
        </Text>
        <Text style={styles.infoText}>
          • <Text style={styles.infoBold}>BONUS</Text>: Promotional credits.
          Cannot be withdrawn.
        </Text>
        <Text style={styles.infoText}>
          • Balances are separate and cannot be converted between each other.
        </Text>
      </View>

      {/* Logout Button */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutBtnText}>🚪 Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  logoutBtn: {
    marginHorizontal: 16,
    marginBottom: 40,
    backgroundColor: "rgba(255, 77, 77, 0.15)",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 77, 77, 0.4)",
  },
  logoutBtnText: {
    color: "#ff4d4d",
    fontWeight: "bold",
    fontSize: 16,
  },
  container: {
    flex: 1,
    backgroundColor: "#1a0033",
  },
  currencyToggle: {
    flexDirection: "row",
    justifyContent: "center",
    padding: 16,
    gap: 12,
  },
  currencyButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
  },
  currencyButtonActive: {
    backgroundColor: "#FFD700",
  },
  currencyIcon: {
    fontSize: 20,
  },
  currencyLabel: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 12,
    marginTop: 2,
  },
  currencyLabelActive: {
    color: "#1a0033",
  },
  balanceCard: {
    backgroundColor: "#2d1b4e",
    margin: 16,
    padding: 24,
    borderRadius: 16,
    alignItems: "center",
  },
  balanceLabel: {
    color: "#aaa",
    fontSize: 14,
    marginBottom: 8,
  },
  balanceAmount: {
    color: "#FFD700",
    fontSize: 36,
    fontWeight: "bold",
  },
  summaryCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  summaryIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  summaryLabel: {
    color: "#fff",
    flex: 1,
    fontSize: 14,
  },
  summaryValue: {
    color: "#FFD700",
    fontWeight: "bold",
    fontSize: 14,
  },
  depositCard: {
    backgroundColor: "#2d1b4e",
    margin: 16,
    padding: 20,
    borderRadius: 16,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.1)",
    padding: 14,
    borderRadius: 10,
    color: "#fff",
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  depositButton: {
    backgroundColor: "#4CAF50",
    padding: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  depositButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  depositHint: {
    color: "#aaa",
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },
  infoCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    margin: 16,
    padding: 20,
    borderRadius: 16,
  },
  infoTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 12,
  },
  infoText: {
    color: "#aaa",
    fontSize: 13,
    marginBottom: 6,
    lineHeight: 20,
  },
  infoBold: {
    color: "#FFD700",
    fontWeight: "bold",
  },
  responsibleCard: {
    backgroundColor: "rgba(220,53,69,0.1)",
    margin: 16,
    padding: 20,
    borderRadius: 16,
    marginBottom: 40,
  },
  responsibleTitle: {
    color: "#dc3545",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
  },
  responsibleText: {
    color: "#aaa",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 6,
  },
});
