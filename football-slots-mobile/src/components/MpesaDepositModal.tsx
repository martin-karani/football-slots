import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { paymentsApi } from '../api/client';
import { classifyMpesaResult, maskPhoneNumber, MpesaClassification } from '../utils/mpesaErrors';
import { theme } from './theme';

interface MpesaDepositModalProps {
  visible: boolean;
  transactionId: string | null;
  phoneNumber: string;
  amountKES: number;
  onSuccess: (receipt?: string) => void;
  onRetry: () => Promise<string | null>;
  onClose: () => void;
}

type ModalState = 'waiting' | 'paid' | 'failed';

export function MpesaDepositModal({
  visible,
  transactionId,
  phoneNumber,
  amountKES,
  onSuccess,
  onRetry,
  onClose,
}: MpesaDepositModalProps) {
  const [modalState, setModalState] = useState<ModalState>('waiting');
  const [timeLeft, setTimeLeft] = useState(60);
  const [retryCooldown, setRetryCooldown] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [classification, setClassification] = useState<MpesaClassification | null>(null);
  const [receiptNumber, setReceiptNumber] = useState<string | null>(null);
  const [showPaybillFallback, setShowPaybillFallback] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentTxIdRef = useRef<string | null>(transactionId);

  currentTxIdRef.current = transactionId;

  // Pulse animation for waiting spinner
  useEffect(() => {
    if (modalState === 'waiting') {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.12,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }
  }, [modalState]);

  // Reset state when modal opens with new transaction
  useEffect(() => {
    if (visible && transactionId) {
      setModalState('waiting');
      setTimeLeft(60);
      setRetryCooldown(0);
      setClassification(null);
      setReceiptNumber(null);
      setShowPaybillFallback(false);
    }
  }, [visible, transactionId]);

  // Countdown timer for STK prompt timeout
  useEffect(() => {
    if (!visible || modalState !== 'waiting') return;

    countdownTimerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(countdownTimerRef.current as NodeJS.Timeout);
          // Auto timeout if no callback arrived
          const timeoutClass = classifyMpesaResult(1037, 'DS timeout user cannot be reached', phoneNumber);
          setClassification(timeoutClass);
          setModalState('failed');
          setRetryCooldown(timeoutClass.retryCooldownSecs);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [visible, modalState, phoneNumber]);

  // Retry cooldown timer
  useEffect(() => {
    if (retryCooldown <= 0) return;
    const timer = setInterval(() => {
      setRetryCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [retryCooldown]);

  // Status Polling
  const pollStatus = useCallback(async () => {
    const txId = currentTxIdRef.current;
    if (!txId || modalState !== 'waiting') return;

    try {
      const res = await paymentsApi.status(txId);
      const data = res.data;

      if (data.status === 'settled') {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        setReceiptNumber(data.provider_receipt || null);
        setClassification(classifyMpesaResult(0, null, phoneNumber));
        setModalState('paid');
        onSuccess(data.provider_receipt);
      } else if (data.status === 'failed') {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        const classified = classifyMpesaResult(data.result_code, data.result_desc, phoneNumber);
        setClassification(classified);
        setModalState('failed');
        setRetryCooldown(classified.retryCooldownSecs);
      }
    } catch {
      // Ignore transient polling errors
    }
  }, [modalState, phoneNumber, onSuccess]);

  useEffect(() => {
    if (!visible || modalState !== 'waiting') return;

    // Poll every 3 seconds
    pollTimerRef.current = setInterval(pollStatus, 3000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [visible, modalState, pollStatus]);

  const handleRetryPress = async () => {
    if (retryCooldown > 0 || isRetrying) return;
    setIsRetrying(true);
    try {
      const newTxId = await onRetry();
      if (newTxId) {
        setModalState('waiting');
        setTimeLeft(60);
        setClassification(null);
      }
    } catch {
      // Failed retry initiation
    } finally {
      setIsRetrying(false);
    }
  };

  if (!visible) return null;

  const maskedPhone = maskPhoneNumber(phoneNumber);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.topRow}>
            <View style={styles.brandRow}>
              <View style={styles.mpesaBadge}>
                <Text style={styles.mpesaBadgeText}>M-PESA</Text>
              </View>
              <Text style={styles.amountHeader}>KES {amountKES.toLocaleString()}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={theme.colors.textDim} />
            </TouchableOpacity>
          </View>

          {/* ============================================================ */}
          {/* WAITING STATE                                                 */}
          {/* ============================================================ */}
          {modalState === 'waiting' && (
            <View style={styles.content}>
              <Animated.View style={[styles.iconContainer, { transform: [{ scale: pulseAnim }] }]}>
                <View style={styles.iconCircleWaiting}>
                  <Ionicons name="phone-portrait-outline" size={38} color={theme.colors.success} />
                </View>
              </Animated.View>

              <Text style={styles.title}>Check Your Phone</Text>
              <Text style={styles.bodyText}>
                We sent an M-Pesa PIN prompt to <Text style={styles.boldText}>{maskedPhone}</Text>.
              </Text>
              <Text style={styles.subText}>
                Please unlock your screen and enter your M-Pesa PIN to confirm the deposit.
              </Text>

              {/* Progress Bar / Countdown */}
              <View style={styles.timerRow}>
                <ActivityIndicator size="small" color={theme.colors.success} />
                <Text style={styles.timerText}>Waiting for PIN ({timeLeft}s)</Text>
              </View>

              {/* Fallback button */}
              <TouchableOpacity
                onPress={() => setShowPaybillFallback(!showPaybillFallback)}
                style={styles.fallbackToggle}
              >
                <Text style={styles.fallbackToggleText}>
                  {showPaybillFallback ? 'Hide Paybill details' : 'Prompt not showing? Pay via Paybill'}
                </Text>
                <Ionicons
                  name={showPaybillFallback ? 'chevron-up' : 'chevron-down'}
                  size={15}
                  color={theme.colors.blueLight}
                />
              </TouchableOpacity>

              {showPaybillFallback && (
                <View style={styles.paybillBox}>
                  <Text style={styles.paybillTitle}>Manual Paybill Payment:</Text>
                  <View style={styles.paybillRow}>
                    <Text style={styles.paybillLabel}>Business No:</Text>
                    <Text style={styles.paybillValue}>174379</Text>
                  </View>
                  <View style={styles.paybillRow}>
                    <Text style={styles.paybillLabel}>Account No:</Text>
                    <Text style={styles.paybillValue}>FootballSlots</Text>
                  </View>
                  <View style={styles.paybillRow}>
                    <Text style={styles.paybillLabel}>Amount:</Text>
                    <Text style={styles.paybillValue}>KES {amountKES}</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ============================================================ */}
          {/* PAID / SUCCESS STATE                                         */}
          {/* ============================================================ */}
          {modalState === 'paid' && (
            <View style={styles.content}>
              <View style={styles.iconCircleSuccess}>
                <Ionicons name="checkmark-circle" size={54} color={theme.colors.success} />
              </View>

              <Text style={styles.titleSuccess}>Deposit Confirmed!</Text>
              <Text style={styles.bodyText}>
                <Text style={styles.boldText}>KES {amountKES.toLocaleString()}</Text> has been added to your Real Balance.
              </Text>

              {receiptNumber ? (
                <View style={styles.receiptBox}>
                  <Text style={styles.receiptLabel}>M-Pesa Receipt</Text>
                  <Text style={styles.receiptText}>{receiptNumber}</Text>
                </View>
              ) : null}

              <TouchableOpacity style={styles.primaryBtn} onPress={onClose}>
                <Text style={styles.primaryBtnText}>Back to Game</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ============================================================ */}
          {/* FAILED / 1037 / CANCELLED STATE                              */}
          {/* ============================================================ */}
          {modalState === 'failed' && classification && (
            <View style={styles.content}>
              <View style={classification.category === 'unreachable' ? styles.iconCircleWarning : styles.iconCircleFailed}>
                <Ionicons
                  name={classification.category === 'unreachable' ? 'cloud-offline-outline' : 'alert-circle-outline'}
                  size={44}
                  color={classification.category === 'unreachable' ? theme.colors.gold : theme.colors.error}
                />
              </View>

              <Text style={styles.titleFailed}>{classification.title}</Text>

              {classification.reassureNoCharge && (
                <View style={styles.reassuranceBadge}>
                  <Ionicons name="shield-checkmark" size={15} color={theme.colors.success} />
                  <Text style={styles.reassuranceText}>Nothing has been charged</Text>
                </View>
              )}

              <Text style={styles.bodyText}>{classification.message}</Text>

              {/* Action Buttons */}
              <View style={styles.actionBtnRow}>
                {classification.canRetry && (
                  <TouchableOpacity
                    style={[styles.primaryBtn, (retryCooldown > 0 || isRetrying) && styles.btnDisabled]}
                    onPress={handleRetryPress}
                    disabled={retryCooldown > 0 || isRetrying}
                  >
                    {isRetrying ? (
                      <ActivityIndicator size="small" color="#1A1206" />
                    ) : (
                      <Text style={styles.primaryBtnText}>
                        {retryCooldown > 0 ? `Retry in ${retryCooldown}s` : classification.actionText}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.secondaryBtn} onPress={onClose}>
                  <Text style={styles.secondaryBtnText}>Dismiss</Text>
                </TouchableOpacity>
              </View>

              {/* Fallback Paybill Option for unreachable lines */}
              {classification.category === 'unreachable' && (
                <View style={styles.paybillBox}>
                  <Text style={styles.paybillTitle}>💡 Prompt not popping up?</Text>
                  <Text style={styles.paybillSubText}>
                    Go to M-Pesa &rarr; Lipa na M-Pesa &rarr; Paybill:
                  </Text>
                  <View style={styles.paybillRow}>
                    <Text style={styles.paybillLabel}>Business No:</Text>
                    <Text style={styles.paybillValue}>174379</Text>
                  </View>
                  <View style={styles.paybillRow}>
                    <Text style={styles.paybillLabel}>Account No:</Text>
                    <Text style={styles.paybillValue}>FootballSlots</Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(7, 10, 18, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.xl,
    borderWidth: 1.5,
    borderColor: theme.colors.borderLight,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderMuted,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mpesaBadge: {
    backgroundColor: '#0B7A3B',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 7,
  },
  mpesaBadgeText: {
    color: '#FFFFFF',
    fontFamily: theme.fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  amountHeader: {
    color: theme.colors.textPrimary,
    fontFamily: theme.fonts.numbers,
    fontSize: 17,
  },
  closeBtn: {
    padding: 4,
  },
  content: {
    alignItems: 'center',
  },
  iconContainer: {
    marginVertical: 10,
  },
  iconCircleWaiting: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: theme.colors.demoLight,
    borderWidth: 1.5,
    borderColor: theme.colors.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircleSuccess: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: theme.colors.demoLight,
    borderWidth: 1.5,
    borderColor: theme.colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 10,
  },
  iconCircleWarning: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: theme.colors.warningBg,
    borderWidth: 1.5,
    borderColor: theme.colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 10,
  },
  iconCircleFailed: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: theme.colors.errorBg,
    borderWidth: 1.5,
    borderColor: theme.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 10,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontFamily: theme.fonts.heading,
    marginBottom: 8,
    textAlign: 'center',
  },
  titleSuccess: {
    color: theme.colors.success,
    fontSize: 22,
    fontFamily: theme.fonts.heading,
    marginBottom: 8,
    textAlign: 'center',
  },
  titleFailed: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontFamily: theme.fonts.heading,
    marginBottom: 8,
    textAlign: 'center',
  },
  reassuranceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.successBg,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    marginBottom: 10,
  },
  reassuranceText: {
    color: theme.colors.success,
    fontSize: 12,
    fontFamily: theme.fonts.bodyBold,
  },
  bodyText: {
    color: theme.colors.textSecondary,
    fontSize: 14.5,
    fontFamily: theme.fonts.body,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 8,
  },
  subText: {
    color: theme.colors.textDim,
    fontSize: 12.5,
    fontFamily: theme.fonts.body,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 16,
  },
  boldText: {
    color: theme.colors.textPrimary,
    fontFamily: theme.fonts.bodyBold,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 14,
  },
  timerText: {
    color: theme.colors.success,
    fontSize: 13,
    fontFamily: theme.fonts.numbers,
  },
  receiptBox: {
    backgroundColor: theme.colors.card,
    padding: 14,
    borderRadius: theme.radius.md,
    width: '100%',
    alignItems: 'center',
    marginVertical: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
  },
  receiptLabel: {
    color: theme.colors.textDim,
    fontSize: 11,
    fontFamily: theme.fonts.bodyBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  receiptText: {
    color: theme.colors.gold,
    fontSize: 17,
    fontFamily: theme.fonts.numbers,
    letterSpacing: 1,
    marginTop: 3,
  },
  actionBtnRow: {
    width: '100%',
    gap: 10,
    marginTop: 14,
  },
  primaryBtn: {
    backgroundColor: theme.colors.gold,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    width: '100%',
    shadowColor: theme.colors.gold,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryBtnText: {
    color: '#1A1206',
    fontFamily: theme.fonts.heading,
    fontSize: 15,
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    backgroundColor: 'transparent',
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    width: '100%',
  },
  secondaryBtnText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.bodyBold,
    fontSize: 14,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  fallbackToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  fallbackToggleText: {
    color: theme.colors.blueLight,
    fontSize: 12.5,
    fontFamily: theme.fonts.bodyMedium,
  },
  paybillBox: {
    backgroundColor: theme.colors.card,
    padding: 14,
    borderRadius: theme.radius.md,
    width: '100%',
    marginTop: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
  },
  paybillTitle: {
    color: theme.colors.gold,
    fontSize: 12.5,
    fontFamily: theme.fonts.bodyBold,
    marginBottom: 6,
  },
  paybillSubText: {
    color: theme.colors.textDim,
    fontSize: 11.5,
    fontFamily: theme.fonts.body,
    marginBottom: 8,
  },
  paybillRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  paybillLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontFamily: theme.fonts.body,
  },
  paybillValue: {
    color: theme.colors.textPrimary,
    fontFamily: theme.fonts.numbers,
    fontSize: 13,
  },
});
