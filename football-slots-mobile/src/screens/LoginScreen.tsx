import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { authApi, authStorage } from "../api/client";
import { useGameStore } from "../store/GameProvider";
import { useToast } from "../components/Toast";
import { theme } from "../components/theme";

export function LoginScreen() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [loading, setLoading] = useState(false);
  const setAuth = useGameStore((state) => state.setAuth);
  const { showError } = useToast();

  const sendOtp = async () => {
    if (phone.length < 10) {
      showError("Enter a valid phone number");
      return;
    }
    setLoading(true);
    try {
      await authApi.sendOtp(phone);
      setStep("code");
    } catch (error: any) {
      showError(error.response?.data?.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (code.length !== 6) {
      showError("Enter the 6-digit OTP code");
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.verifyOtp(phone, code);
      const { token, phone_number, kyc_status } = res.data;
      await authStorage.setToken(token);
      setAuth(phone_number, kyc_status);
    } catch (error: any) {
      showError(error.response?.data?.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.root}
    >
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* ─── Logo / Brand ─────────────────────────────── */}
      <View style={styles.brand}>
        <View style={styles.logoRing}>
          <Text style={styles.logoEmoji}>⚽</Text>
        </View>
        <Text style={styles.appName}>Football Slots</Text>
        <Text style={styles.tagline}>Spin. Bet. Win.</Text>
      </View>

      {/* ─── Form Card ─────────────────────────────────── */}
      <View style={styles.card}>
        {step === "phone" ? (
          <>
            <Text style={styles.cardTitle}>Enter your phone number</Text>
            <Text style={styles.cardSub}>
              We'll send a one-time code to verify your account
            </Text>

            <Text style={styles.fieldLabel}>Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="+254 712 345 678"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholderTextColor={colors.textDim}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={sendOtp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.btnText}>Send OTP</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.cardTitle}>Verify your number</Text>
            <Text style={styles.cardSub}>Code sent to {phone}</Text>

            <Text style={styles.fieldLabel}>OTP Code</Text>
            <TextInput
              style={[styles.input, styles.otpInput]}
              placeholder="123456"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
              placeholderTextColor={colors.textDim}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={verify}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.btnText}>Verify & Play</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setStep("phone")}
              style={styles.backLink}
            >
              <Text style={styles.backLinkText}>← Change number</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ─── Footer ────────────────────────────────────── */}
      <Text style={styles.footer}>Play responsibly · 18+ only</Text>
    </KeyboardAvoidingView>
  );
}

const { colors, radius, spacing } = theme;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },

  /* Brand section */
  brand: { alignItems: "center", marginBottom: 32 },
  logoRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#2d1b4e",
    borderWidth: 3,
    borderColor: colors.accent,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  logoEmoji: { fontSize: 44 },
  appName: {
    fontSize: 32,
    fontWeight: "900",
    color: colors.accent,
    letterSpacing: 0.5,
  },
  tagline: { fontSize: 14, color: colors.textMuted, marginTop: 4 },

  /* Form card */
  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    padding: spacing.lg,
    marginBottom: 24,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 6,
  },
  cardSub: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  fieldLabel: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.07)",
    padding: 14,
    borderRadius: radius.md,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  otpInput: {
    textAlign: "center",
    letterSpacing: 10,
    fontWeight: "800",
    fontSize: 22,
  },
  btn: {
    backgroundColor: colors.accent,
    padding: 15,
    borderRadius: radius.md,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color: colors.background,
    fontWeight: "800",
    fontSize: 16,
  },
  backLink: { marginTop: spacing.md, alignItems: "center" },
  backLinkText: { color: colors.accent, fontSize: 14 },

  footer: {
    textAlign: "center",
    color: colors.textDim,
    fontSize: 11,
  },
});
