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
    const cleanPhone = phone.trim().replace(/\s+/g, "");
    if (cleanPhone.length < 9) {
      showError("Enter a valid phone number");
      return;
    }
    setLoading(true);
    try {
      await authApi.sendOtp(cleanPhone);
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
      const cleanPhone = phone.trim().replace(/\s+/g, "");
      const res = await authApi.verifyOtp(cleanPhone, code);
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
      const cleanPhone = phone.trim().replace(/\s+/g, "");
      await authApi.sendOtp(cleanPhone);
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
        <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />

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
                <Ionicons name="chevron-back" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>

              <Text style={styles.otpHeading}>Verify your number</Text>
              <Text style={styles.otpSubheading}>
                Enter the 5-digit code we sent to{"\n"}
                <Text style={styles.otpPhoneHighlight}>+254 {phone}</Text>
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

const { colors, radius, spacing, fonts } = theme;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingBottom: 28,
  },
  container: {
    flex: 1,
    justifyContent: "space-between",
    paddingTop: 16,
  },

  /* Brand Center */
  brandCenter: {
    alignItems: "center",
    marginTop: 36,
  },
  logoBadge: {
    width: 92,
    height: 92,
    borderRadius: 28,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: "rgba(231,200,119,0.35)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 8,
  },
  brandTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 28,
    color: colors.textPrimary,
    letterSpacing: 1.2,
    lineHeight: 32,
    textAlign: "center",
  },
  brandSubtitle: {
    fontFamily: fonts.heading,
    fontSize: 12,
    letterSpacing: 4,
    color: colors.gold,
    marginTop: 6,
    marginBottom: 16,
  },
  brandDescription: {
    fontFamily: fonts.body,
    fontSize: 14.5,
    color: colors.textMuted,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 290,
  },

  /* Form section */
  formBottom: {
    marginTop: 40,
    marginBottom: 16,
  },
  fieldLabel: {
    fontFamily: fonts.heading,
    fontSize: 11.5,
    letterSpacing: 1,
    color: colors.textDim,
    marginBottom: 9,
  },
  phoneInputCard: {
    height: 58,
    borderRadius: 15,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  countryCodeGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 14,
    borderRightWidth: 1,
    borderRightColor: colors.borderMuted,
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
    color: colors.textPrimary,
  },
  phoneInput: {
    flex: 1,
    fontFamily: fonts.numbersRegular,
    fontSize: 17,
    color: colors.textPrimary,
    paddingLeft: 14,
    letterSpacing: 0.5,
  },

  /* Buttons */
  primaryGoldBtn: {
    height: 56,
    borderRadius: 15,
    backgroundColor: colors.gold,
    justifyContent: "center",
    alignItems: "center",
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
    letterSpacing: 0.5,
  },
  primaryBlueBtn: {
    height: 56,
    borderRadius: 15,
    backgroundColor: colors.blue,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: colors.blue,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
    marginTop: 24,
  },
  primaryBlueBtnText: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  btnDisabled: {
    opacity: 0.6,
  },

  /* Trust footer */
  trustRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    marginTop: 22,
  },
  trustItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  trustText: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.textDim,
  },
  ageCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.textDim,
    alignItems: "center",
    justifyContent: "center",
  },
  ageText: {
    fontFamily: fonts.heading,
    fontSize: 9,
    color: colors.textDim,
  },

  /* OTP Screen styles */
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  otpHeading: {
    fontFamily: fonts.headingBold,
    fontSize: 28,
    color: colors.textPrimary,
    lineHeight: 32,
    marginBottom: 10,
  },
  otpSubheading: {
    fontFamily: fonts.body,
    fontSize: 14.5,
    color: colors.textMuted,
    lineHeight: 22,
    marginBottom: 32,
  },
  otpPhoneHighlight: {
    fontFamily: fonts.numbers,
    color: colors.textPrimary,
    fontSize: 15,
  },
  otpBoxesRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 26,
  },
  otpBox: {
    flex: 1,
    height: 66,
    borderRadius: 15,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  otpBoxActive: {
    borderColor: colors.blue,
    borderWidth: 2,
    backgroundColor: "rgba(76,141,255,0.08)",
  },
  otpBoxFilled: {
    borderColor: colors.borderLight,
  },
  otpDigitText: {
    fontFamily: fonts.numbers,
    fontSize: 26,
    color: colors.textPrimary,
  },
  cursorBlink: {
    width: 2,
    height: 26,
    backgroundColor: colors.blue,
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
    color: colors.textDim,
  },
  timerBold: {
    fontFamily: fonts.numbers,
    color: colors.textSecondary,
  },
  resendActiveText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.blueLight,
  },
});
