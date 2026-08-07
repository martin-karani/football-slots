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
  Alert,
} from "react-native";
import { authApi, authStorage } from "../api/client";
import { useGameStore } from "../store/GameProvider";

export function LoginScreen() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [loading, setLoading] = useState(false);
  const setAuth = useGameStore((state) => state.setAuth);

  const sendOtp = async () => {
    if (phone.length < 10) {
      Alert.alert("Error", "Enter a valid phone number");
      return;
    }

    setLoading(true);
    try {
      await authApi.sendOtp(phone);
      setStep("code");
    } catch (error: any) {
      Alert.alert(
        "Error",
        error.response?.data?.message || "Failed to send OTP",
      );
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (code.length !== 6) {
      Alert.alert("Error", "Enter the 6-digit OTP code");
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.verifyOtp(phone, code);
      const { token, phone_number, kyc_status } = res.data;

      await authStorage.setToken(token);
      setAuth(phone_number, kyc_status);
    } catch (error: any) {
      Alert.alert(
        "Error",
        error.response?.data?.message || "Verification failed",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <View style={styles.logoContainer}>
        <Text style={styles.logo}>⚽</Text>
        <Text style={styles.title}>Football Slots</Text>
        <Text style={styles.subtitle}>Spin. Bet. Win.</Text>
      </View>

      <View style={styles.form}>
        {step === "phone" ? (
          <>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="+254 712 345 678"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholderTextColor="#666"
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={sendOtp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#1a0033" />
              ) : (
                <Text style={styles.buttonText}>Send OTP</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.label}>Enter OTP Code</Text>
            <Text style={styles.hint}>Sent to {phone}</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="123456"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
              placeholderTextColor="#666"
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={verify}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#1a0033" />
              ) : (
                <Text style={styles.buttonText}>Verify & Play</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setStep("phone")}
              style={styles.backLink}
            >
              <Text style={styles.backText}>← Change number</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <Text style={styles.footer}>Play responsibly. 18+ only.</Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a0033",
    justifyContent: "center",
    padding: 24,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  logo: {
    fontSize: 80,
    marginBottom: 16,
  },
  title: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#FFD700",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 18,
    color: "#aaa",
    marginTop: 8,
  },
  form: {
    width: "100%",
  },
  label: {
    fontSize: 16,
    color: "#fff",
    marginBottom: 8,
    fontWeight: "600",
  },
  hint: {
    fontSize: 14,
    color: "#aaa",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.1)",
    padding: 16,
    borderRadius: 12,
    fontSize: 18,
    color: "#fff",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  codeInput: {
    textAlign: "center",
    letterSpacing: 8,
    fontWeight: "bold",
  },
  button: {
    backgroundColor: "#FFD700",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#1a0033",
    fontWeight: "bold",
    fontSize: 18,
  },
  backLink: {
    marginTop: 16,
    alignItems: "center",
  },
  backText: {
    color: "#FFD700",
    fontSize: 14,
  },
  footer: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#666",
    fontSize: 12,
  },
});
