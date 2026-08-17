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
import { maskPhoneNumber } from '../utils/mpesaErrors';
import { theme } from './theme';

interface MpesaWithdrawalModalProps {
  visible: boolean;
  transactionId: string | null;
  phoneNumber: string;
  amountKES: number;
  onSuccess: (receipt?: string) => void;
  onClose: () => void;
}

type ModalState = 'processing' | 'success' | 'failed';

export function MpesaWithdrawalModal({
  visible,
  transactionId,
  phoneNumber,
  amountKES,
  onSuccess,
  onClose,
}: MpesaWithdrawalModalProps) {
  const [modalState, setModalState] = useState<ModalState>('processing');
  const [receiptNumber, setReceiptNumber] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentTxIdRef = useRef<string | null>(transactionId);

  currentTxIdRef.current = transactionId;

  // Pulse animation for waiting spinner
  useEffect(() => {
    if (modalState === 'processing') {
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

  // Reset state when modal opens with a new transaction
  useEffect(() => {
    if (visible && transactionId) {
      setModalState('processing');
      setReceiptNumber(null);
      setErrorMessage(null);
      setPollCount(0);
    }
  }, [visible, transactionId]);

  // Status Polling
  const pollStatus = useCallback(async () => {
    const txId = currentTxIdRef.current;
    if (!txId || modalState !== 'processing') return;

    try {
      setPollCount((prev) => prev + 1);
      const res = await paymentsApi.status(txId);
      const data = res.data;

      if (data.status === 'completed' || data.status === 'settled') {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        setReceiptNumber(data.provider_receipt || null);
        setModalState('success');
        onSuccess(data.provider_receipt);
      } else if (data.status === 'failed' || data.status === 'reversed' || data.status === 'cancelled') {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        setErrorMessage(data.result_desc || 'Withdrawal could not be completed by M-Pesa.');
        setModalState('failed');
      }
    } catch {
      // Ignore transient polling errors
    }
  }, [modalState, onSuccess]);

  useEffect(() => {
    if (!visible || modalState !== 'processing') return;

    // Poll every 3 seconds
    pollTimerRef.current = setInterval(pollStatus, 3000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [visible, modalState, pollStatus]);

  if (!visible) return null;

  const maskedPhone = maskPhoneNumber(phoneNumber);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Top Header Row */}
          <View style={styles.topRow}>
            <View style={styles.brandRow}>
              <View style={styles.mpesaBadge}>
                <Text style={styles.mpesaBadgeText}>M-PESA B2C</Text>
              </View>
              <Text style={styles.amountHeader}>KES {amountKES.toLocaleString()}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color={theme.colors.textDim} />
            </TouchableOpacity>
          </View>

          {/* ============================================================ */}
          {/* 1. PROCESSING STATE                                          */}
          {/* ============================================================ */}
          {modalState === 'processing' && (
            <View style={styles.content}>
              <Animated.View style={[styles.iconContainer, { transform: [{ scale: pulseAnim }] }]}>
                <View style={styles.iconCircleProcessing}>
                  <Ionicons name="arrow-up-circle-outline" size={42} color={theme.colors.gold} />
                </View>
              </Animated.View>

              <Text style={styles.title}>Processing Payout</Text>
              <Text style={styles.bodyText}>
                Sending <Text style={styles.boldText}>KES {amountKES.toLocaleString()}</Text> to{' '}
                <Text style={styles.boldText}>{maskedPhone}</Text> via M-Pesa.
              </Text>
              <Text style={styles.subText}>
                Your payout request is with Safaricom. You will receive an SMS confirmation on your phone.
              </Text>

              {/* Progress Indicator */}
              <View style={styles.timerRow}>
                <ActivityIndicator size="small" color={theme.colors.gold} />
                <Text style={styles.timerText}>
                  {pollCount > 6 ? 'Finalizing transaction...' : 'Transferring funds...'}
                </Text>
              </View>

              <View style={styles.infoBanner}>
                <Ionicons name="information-circle-outline" size={16} color={theme.colors.blueLight} />
                <Text style={styles.infoBannerText}>
                  You can safely close this screen. Your balance updates automatically when completed.
                </Text>
              </View>

              <View style={styles.actionBtnRow}>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={onClose}
                  activeOpacity={0.8}
                >
                  <Text style={styles.secondaryBtnText}>Close Window</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ============================================================ */}
          {/* 2. SUCCESS STATE                                             */}
          {/* ============================================================ */}
          {modalState === 'success' && (
            <View style={styles.content}>
              <View style={styles.iconCircleSuccess}>
                <Ionicons name="checkmark-circle" size={46} color={theme.colors.success} />
              </View>

              <Text style={styles.titleSuccess}>Withdrawal Sent!</Text>
              <Text style={styles.bodyText}>
                <Text style={styles.boldText}>KES {amountKES.toLocaleString()}</Text> has been successfully sent to{' '}
                <Text style={styles.boldText}>{maskedPhone}</Text>.
              </Text>

              {receiptNumber && (
                <View style={styles.receiptBox}>
                  <Text style={styles.receiptLabel}>M-Pesa Receipt Number</Text>
                  <Text style={styles.receiptText}>{receiptNumber}</Text>
                </View>
              )}

              <View style={styles.actionBtnRow}>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={onClose}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ============================================================ */}
          {/* 3. FAILED / REVERSED STATE                                   */}
          {/* ============================================================ */}
          {modalState === 'failed' && (
            <View style={styles.content}>
              <View style={styles.iconCircleFailed}>
                <Ionicons name="alert-circle" size={46} color={theme.colors.error} />
              </View>

              <Text style={styles.titleFailed}>Withdrawal Failed</Text>
              <Text style={styles.bodyText}>
                {errorMessage || 'M-Pesa could not complete this payout at this time.'}
              </Text>

              <View style={styles.restoredBanner}>
                <Ionicons name="shield-checkmark-outline" size={16} color={theme.colors.success} />
                <Text style={styles.restoredBannerText}>
                  Your wallet balance has been safely restored in full.
                </Text>
              </View>

              <View style={styles.actionBtnRow}>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={onClose}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
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
    backgroundColor: 'rgba(4, 6, 12, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1E0438',
    borderRadius: theme.radius.xl,
    padding: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 229, 102, 0.25)',
    shadowColor: '#8800dd',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 229, 102, 0.12)',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mpesaBadge: {
    backgroundColor: '#00A859',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  mpesaBadgeText: {
    color: '#FFFFFF',
    fontFamily: theme.fonts.heading,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  amountHeader: {
    color: '#FFE566',
    fontFamily: theme.fonts.numbers,
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  content: {
    alignItems: 'center',
  },
  iconContainer: {
    marginVertical: 10,
  },
  iconCircleProcessing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255, 229, 102, 0.14)',
    borderWidth: 1.5,
    borderColor: '#FFE566',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircleSuccess: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: theme.colors.successBg,
    borderWidth: 1.5,
    borderColor: theme.colors.success,
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
    color: '#FFE566',
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
    color: '#FF5468',
    fontSize: 20,
    fontFamily: theme.fonts.heading,
    marginBottom: 8,
    textAlign: 'center',
  },
  bodyText: {
    color: '#F0E0FF',
    fontSize: 14.5,
    fontFamily: theme.fonts.body,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 8,
  },
  subText: {
    color: 'rgba(240, 224, 255, 0.65)',
    fontSize: 12.5,
    fontFamily: theme.fonts.body,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 16,
  },
  boldText: {
    color: '#FFFFFF',
    fontFamily: theme.fonts.bodyBold,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 229, 102, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 229, 102, 0.25)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 14,
  },
  timerText: {
    color: '#FFE566',
    fontSize: 13,
    fontFamily: theme.fonts.numbers,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(76, 141, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(76, 141, 255, 0.25)',
    padding: 10,
    borderRadius: theme.radius.md,
    marginBottom: 14,
    width: '100%',
  },
  infoBannerText: {
    color: '#B0C8FF',
    fontSize: 11.5,
    fontFamily: theme.fonts.body,
    flex: 1,
    lineHeight: 16,
  },
  restoredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.successBg,
    borderWidth: 1,
    borderColor: theme.colors.success,
    padding: 10,
    borderRadius: theme.radius.md,
    marginBottom: 14,
    width: '100%',
  },
  restoredBannerText: {
    color: theme.colors.success,
    fontSize: 12,
    fontFamily: theme.fonts.bodyBold,
    flex: 1,
  },
  receiptBox: {
    backgroundColor: 'rgba(46, 5, 80, 0.9)',
    padding: 14,
    borderRadius: theme.radius.md,
    width: '100%',
    alignItems: 'center',
    marginVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 229, 102, 0.25)',
  },
  receiptLabel: {
    color: 'rgba(255, 229, 102, 0.7)',
    fontSize: 11,
    fontFamily: theme.fonts.bodyBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  receiptText: {
    color: '#FFE566',
    fontSize: 18,
    fontFamily: theme.fonts.numbers,
    letterSpacing: 1,
    marginTop: 4,
    fontWeight: '700',
  },
  actionBtnRow: {
    width: '100%',
    gap: 10,
    marginTop: 10,
  },
  primaryBtn: {
    backgroundColor: '#FFE566',
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#FFE566',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryBtnText: {
    color: '#1A0033',
    fontFamily: theme.fonts.heading,
    fontSize: 15,
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: 'transparent',
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 229, 102, 0.35)',
    width: '100%',
  },
  secondaryBtnText: {
    color: '#FFE566',
    fontFamily: theme.fonts.bodyBold,
    fontSize: 14,
  },
});
