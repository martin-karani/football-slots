import { useState, useRef } from "react";
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
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authApi, authStorage } from "../api/client";
import { useGameStore } from "../store/GameProvider";
import { useToast } from "../components/Toast";
import { theme } from "../components/theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";

/** Strip any prefix the user typed and return the raw 9-digit local number e.g. "712345678" */
function normalizeLocal(raw: string): string {
  let n = raw.trim().replace(/\s+/g, "").replace(/[^0-9]/g, "");
  if (n.startsWith("254")) n = n.slice(3);
  if (n.startsWith("0")) n = n.slice(1);
  return n; // e.g. "712345678"
}

/** Full E.164 number sent to the backend */
function toE164(raw: string): string {
  return "254" + normalizeLocal(raw);
}

export function LoginScreen() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const setAuth = useGameStore((state) => state.setAuth);
  const { showError } = useToast();
  const inputRef = useRef<TextInput>(null);

  const sendOtp = async () => {
    const local = normalizeLocal(phone);
    if (local.length !== 9) {
      showError("Enter a valid 9-digit Kenyan number (e.g. 712 345 678)");
      return;
    }
    setLoading(true);
    try {
      await authApi.sendOtp(toE164(phone));
      setStep("code");
      setResendTimer(24);
      const timer = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error: any) {
      showError(error.response?.data?.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (code.length < 6) {
      showError("Enter the verification code");
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.verifyOtp(toE164(phone), code);
      const { token, phone_number, kyc_status } = res.data;
      await authStorage.setToken(token);
      setAuth(phone_number, kyc_status);
    } catch (error: any) {
      showError(error.response?.data?.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (resendTimer > 0) return;
    setLoading(true);
    try {
      await authApi.sendOtp(toE164(phone));
      setResendTimer(24);
      const timer = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error: any) {
      showError(error.response?.data?.message || "Failed to resend OTP");
    } finally {
      setLoading(false);
    }
  };

  // OTP 6-digit box rendering
  const otpDigits = [0, 1, 2, 3, 4, 5];

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <StatusBar barStyle="light-content" backgroundColor="#2a0048" />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === "phone" ? (
            <View style={styles.container}>
              {/* Brand Center */}
              <View style={styles.brandCenter}>
                <View style={styles.logoBadge}>
                  <Ionicons name="star" size={42} color={theme.colors.gold} />
                </View>
                <Text style={styles.brandTitle}>FOOTBALL SLOTS</Text>
                <Text style={styles.brandSubtitle}>PREMIER PLAY</Text>
                <Text style={styles.brandDescription}>
                  Sign in with your phone number.{"\n"}No passwords — just a one-time code.
                </Text>
              </View>

              {/* Form Section */}
              <View style={styles.formBottom}>
                <Text style={styles.fieldLabel}>PHONE NUMBER</Text>
                <View style={styles.phoneInputCard}>
                  <View style={styles.countryCodeGroup}>
                    {/* Kenyan Flag Mini */}
                    <View style={styles.flagMini}>
                      <View style={[styles.flagStripe, { backgroundColor: "#000000" }]} />
                      <View style={[styles.flagStripe, { backgroundColor: "#BB0000" }]} />
                      <View style={[styles.flagStripe, { backgroundColor: "#006600" }]} />
                    </View>
                    <Text style={styles.countryCodeText}>+254</Text>
                  </View>
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="712 345 678"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    placeholderTextColor={theme.colors.textDim}
                    autoFocus
                  />
                </View>

                <TouchableOpacity
                  style={[styles.primaryGoldBtn, loading && styles.btnDisabled]}
                  onPress={sendOtp}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#1A1206" />
                  ) : (
                    <Text style={styles.primaryGoldBtnText}>Send code</Text>
                  )}
                </TouchableOpacity>

                {/* Trust Badges */}
                <View style={styles.trustRow}>
                  <View style={styles.trustItem}>
                    <Ionicons name="shield-checkmark-outline" size={15} color={theme.colors.textDim} />
                    <Text style={styles.trustText}>BCLB Licensed</Text>
                  </View>
                  <View style={styles.trustItem}>
                    <View style={styles.ageCircle}>
                      <Text style={styles.ageText}>18+</Text>
                    </View>
                    <Text style={styles.trustText}>Adults only</Text>
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.container}>
              {/* Back Button */}
              <TouchableOpacity
                onPress={() => setStep("phone")}
                style={styles.backButton}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>

              <Text style={styles.otpHeading}>Verify your number</Text>
              <Text style={styles.otpSubheading}>
                Enter the 6-digit code we sent to{"\n"}
                <Text style={styles.otpPhoneHighlight}>+254 {normalizeLocal(phone)}</Text>
              </Text>

              {/* OTP Digit Boxes */}
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => inputRef.current?.focus()}
                style={styles.otpBoxesRow}
              >
                {otpDigits.map((idx) => {
                  const digit = code[idx];
                  const isCurrent = code.length === idx;
                  return (
                    <View
                      key={idx}
                      style={[
                        styles.otpBox,
                        isCurrent && styles.otpBoxActive,
                        digit ? styles.otpBoxFilled : null,
                      ]}
                    >
                      <Text style={styles.otpDigitText}>{digit || ""}</Text>
                      {isCurrent && !digit && <View style={styles.cursorBlink} />}
                    </View>
                  );
                })}
              </TouchableOpacity>

              {/* Hidden Input for Keyboard */}
              <TextInput
                ref={inputRef}
                style={styles.hiddenInput}
                value={code}
                onChangeText={(text) => setCode(text.replace(/[^0-9]/g, "").slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />

              {/* Resend Timer */}
              <View style={styles.resendInfoRow}>
                <Ionicons name="time-outline" size={15} color={theme.colors.textDim} />
                {resendTimer > 0 ? (
                  <Text style={styles.resendTimerText}>
                    Resend code in <Text style={styles.timerBold}>0:{resendTimer < 10 ? `0${resendTimer}` : resendTimer}</Text>
                  </Text>
                ) : (
                  <TouchableOpacity onPress={resendOtp} activeOpacity={0.7}>
                    <Text style={styles.resendActiveText}>Resend code</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Verify Action Button */}
              <TouchableOpacity
                style={[styles.primaryBlueBtn, loading && styles.btnDisabled]}
                onPress={verify}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBlueBtnText}>Verify & continue</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const { fonts } = theme;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#2a0048",
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingBottom: 36,
  },
  container: {
    flex: 1,
    justifyContent: "space-between",
    paddingTop: 16,
  },

  /* ── Brand Centre ── */
  brandCenter: {
    alignItems: "center",
    marginTop: 40,
  },
  logoBadge: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: "#220538",
    borderWidth: 2,
    borderColor: "rgba(255, 215, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 22,
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  brandTitle: {
    fontFamily: fonts.marquee,
    fontSize: 26,
    color: "#FFFFFF",
    letterSpacing: 2,
    lineHeight: 32,
    textAlign: "center",
    textShadowColor: "#FFD700",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  brandSubtitle: {
    fontFamily: fonts.heading,
    fontSize: 11,
    letterSpacing: 5,
    color: "#FFD700",
    marginTop: 6,
    marginBottom: 16,
  },
  brandDescription: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.55)",
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 290,
  },

  /* ── Form ── */
  formBottom: {
    marginTop: 40,
    marginBottom: 16,
  },
  fieldLabel: {
    fontFamily: fonts.heading,
    fontSize: 11,
    letterSpacing: 1.5,
    color: "rgba(255, 215, 0, 0.7)",
    marginBottom: 10,
  },
  phoneInputCard: {
    height: 60,
    borderRadius: 16,
    backgroundColor: "#220538",
    borderWidth: 1.5,
    borderColor: "rgba(255, 215, 0, 0.3)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 18,
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  countryCodeGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 14,
    borderRightWidth: 1,
    borderRightColor: "rgba(255, 215, 0, 0.25)",
  },
  flagMini: {
    width: 22,
    height: 15,
    borderRadius: 3,
    overflow: "hidden",
  },
  flagStripe: {
    flex: 1,
  },
  countryCodeText: {
    fontFamily: fonts.numbers,
    fontSize: 15,
    fontWeight: "700",
    color: "#FFD700",
  },
  phoneInput: {
    flex: 1,
    fontFamily: fonts.numbersRegular,
    fontSize: 18,
    color: "#FFFFFF",
    paddingLeft: 14,
    letterSpacing: 1,
  },

  /* ── CTA Buttons ── */
  primaryGoldBtn: {
    height: 58,
    borderRadius: 16,
    backgroundColor: "#FFD700",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 8,
  },
  primaryGoldBtnText: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: "800",
    color: "#1A0A00",
    letterSpacing: 1,
  },
  primaryBlueBtn: {
    height: 58,
    borderRadius: 16,
    backgroundColor: "#5c0090",
    borderWidth: 1.5,
    borderColor: "rgba(255, 215, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#8800dd",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
    marginTop: 24,
  },
  primaryBlueBtnText: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.8,
  },
  btnDisabled: {
    opacity: 0.5,
  },

  /* ── Trust footer ── */
  trustRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    marginTop: 24,
  },
  trustItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  trustText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.35)",
  },
  ageCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  ageText: {
    fontFamily: fonts.heading,
    fontSize: 9,
    color: "rgba(255, 255, 255, 0.35)",
  },

  /* ── OTP Screen ── */
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#220538",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  otpHeading: {
    fontFamily: fonts.marquee,
    fontSize: 24,
    color: "#FFFFFF",
    lineHeight: 30,
    marginBottom: 10,
    textShadowColor: "#FFD700",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  otpSubheading: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.55)",
    lineHeight: 22,
    marginBottom: 32,
  },
  otpPhoneHighlight: {
    fontFamily: fonts.numbers,
    fontWeight: "700",
    color: "#FFD700",
    fontSize: 15,
  },
  otpBoxesRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 26,
  },
  otpBox: {
    flex: 1,
    height: 68,
    borderRadius: 16,
    backgroundColor: "#220538",
    borderWidth: 1.5,
    borderColor: "rgba(255, 215, 0, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  otpBoxActive: {
    borderColor: "#FFD700",
    borderWidth: 2,
    backgroundColor: "rgba(255, 215, 0, 0.07)",
  },
  otpBoxFilled: {
    borderColor: "rgba(255, 215, 0, 0.5)",
  },
  otpDigitText: {
    fontFamily: fonts.numbers,
    fontSize: 26,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  cursorBlink: {
    width: 2,
    height: 26,
    backgroundColor: "#FFD700",
    borderRadius: 1,
  },
  hiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  resendInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  resendTimerText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.45)",
  },
  timerBold: {
    fontFamily: fonts.numbers,
    fontWeight: "700",
    color: "#FFD700",
  },
  resendActiveText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: "#FFD700",
  },
});
