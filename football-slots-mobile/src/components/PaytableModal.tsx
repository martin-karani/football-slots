import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SYMBOLS } from '../types';
import { gameApi } from '../api/client';
import { PaytableRow as PaytableRowType } from '../types';
import { theme } from './theme';
import { PaytableRow } from './PaytableRow';
import { Ionicons } from '@react-native-vector-icons/ionicons';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** Tier legend item */
function TierLegend({
  label,
  bg,
  fg,
}: {
  label: string;
  bg: string;
  fg: string;
}) {
  return (
    <View style={[legendStyles.pill, { backgroundColor: bg }]}>
      <Text style={[legendStyles.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

const legendStyles = StyleSheet.create({
  pill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pillText: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
});

export function PaytableModal({ visible, onClose }: Props) {
  const [rows, setRows] = useState<PaytableRowType[]>([]);

  useEffect(() => {
    if (!visible) return;
    gameApi
      .paytable()
      .then((res) => setRows(res.data.symbols))
      .catch(() => setRows([]));
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdropTouchable}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.modal}>
          {/* ── Header ── */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Paytable</Text>
              <View style={styles.rtpRow}>
                <Text style={styles.subtitle}>Return to player</Text>
                <View style={styles.rtpPill}>
                  <Text style={styles.rtpValue}>95.24%</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* ── Tier Legend ── */}
          <View style={styles.tierRow}>
            <TierLegend label="COMMON" bg="rgba(148,163,208,0.14)" fg={theme.colors.textMuted} />
            <TierLegend label="MID" bg="rgba(76,141,255,0.14)" fg={theme.colors.blue} />
            <TierLegend label="RARE" bg="rgba(196,162,255,0.14)" fg={theme.colors.bonusAccent} />
            <TierLegend label="JACKPOT" bg="rgba(231,200,119,0.18)" fg={theme.colors.gold} />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            bounces
          >
            {/* ── Symbol Table ── */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="trophy-outline" size={15} color={theme.colors.gold} />
                <Text style={styles.sectionTitle}>Symbols & Payouts</Text>
              </View>
              {SYMBOLS.map((sym) => {
                const row = rows.find((r) => r.symbol === sym.key);
                const multiplier = row ? row.multiplier : sym.multiplier;
                const probability = row ? (row.probability * 100).toFixed(2) : null;
                return (
                  <PaytableRow
                    key={sym.key}
                    name={sym.name}
                    tier={sym.tier.toUpperCase()}
                    probability={probability ? `${probability}%` : '—'}
                    multiplier={multiplier}
                    color={sym.color}
                    icon={sym.icon}
                  />
                );
              })}
            </View>

            {/* ── Rules ── */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="document-text-outline" size={15} color={theme.colors.blue} />
                <Text style={styles.sectionTitle}>How to Play</Text>
              </View>
              {[
                "Tap clubs below the wheel to place bets",
                "Press GO to spin the wheel",
                "If the wheel lands on a club you bet on, you win your bet × multiplier",
                "Long-press a club chip to remove a bet",
              ].map((rule, i) => (
                <Text key={i} style={styles.rule}>
                  {i + 1}. {rule}
                </Text>
              ))}
            </View>

            {/* ── Tips ── */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="bulb-outline" size={15} color={theme.colors.warning} />
                <Text style={styles.sectionTitle}>Tips</Text>
              </View>
              {[
                "Bet on multiple clubs to increase your chances",
                "Common clubs (×5) hit more often but pay less",
                "The UCL Trophy (×100) is rare but pays big",
                "Play responsibly — check your balance before each spin",
              ].map((tip, i) => (
                <Text key={i} style={styles.tip}>
                  • {tip}
                </Text>
              ))}
            </View>

            {/* ── Provably Fair ── */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="shield-checkmark-outline" size={15} color={theme.colors.success} />
                <Text style={styles.sectionTitle}>Provably Fair</Text>
              </View>
              <Text style={styles.tip}>
                Every spin uses HMAC-SHA256 with a server seed and your client seed. Results can be independently verified.
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const { colors, radius, spacing, fonts } = theme;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'flex-end',
  },
  backdropTouchable: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  modal: {
    backgroundColor: colors.surfaceElevated,
    width: '100%',
    maxHeight: '92%',
    borderTopLeftRadius: radius.xl2,
    borderTopRightRadius: radius.xl2,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: 0,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderBottomWidth: 0,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 24,
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  rtpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  rtpPill: {
    backgroundColor: colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  rtpValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.success,
    fontWeight: '700',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.glassMedium,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Tier legend row */
  tierRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: spacing.md,
    flexWrap: 'wrap',
  },

  /* Scroll */
  scroll: { flexGrow: 1, flexShrink: 1 },
  scrollContent: { paddingBottom: spacing.xl2 },

  /* Sections */
  section: { marginBottom: spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fonts.bodyMedium,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  rule: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 4,
    paddingLeft: 4,
  },
  tip: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
    paddingLeft: 4,
  },
});
