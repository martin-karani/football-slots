import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  TouchableWithoutFeedback,
} from 'react-native';
import { SYMBOLS } from '../types';
import { gameApi } from '../api/client';
import { PaytableRow } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function PaytableModal({ visible, onClose }: Props) {
  const [rows, setRows] = useState<PaytableRow[]>([]);

  useEffect(() => {
    if (!visible) return;
    gameApi.paytable()
      .then((res) => setRows(res.data.symbols))
      .catch(() => setRows([])); // keep the modal usable if the fetch fails
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modal}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.title}>⚽ HOW TO PLAY</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <Text style={styles.closeText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
                {/* Rules */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>📋 RULES</Text>
                  <Text style={styles.rule}>
                    1. Tap clubs below the wheel to place bets
                  </Text>
                  <Text style={styles.rule}>
                    2. Press GO to spin the wheel
                  </Text>
                  <Text style={styles.rule}>
                    3. If the wheel lands on a club you bet on, you win your bet × multiplier
                  </Text>
                </View>

                {/* Symbol Table */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>🏆 SYMBOLS & PAYOUTS</Text>
                  {SYMBOLS.map((sym) => {
                    const row = rows.find((r) => r.symbol === sym.key);
                    if (!row) return null;
                    return (
                      <View key={sym.key} style={styles.symbolRow}>
                        <View style={styles.symbolIconWrap}>
                          {sym.icon && <sym.icon width={28} height={28} />}
                        </View>
                        <View style={styles.symbolInfo}>
                          <Text style={styles.symbolName}>{sym.name}</Text>
                          <Text style={styles.symbolTier}>
                            {(row.probability * 100).toFixed(2)}% chance
                          </Text>
                        </View>
                        <View style={[styles.multiplierBadge, { backgroundColor: sym.color }]}>
                          <Text style={styles.multiplierText}>×{row.multiplier}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>

                {/* Betting Info */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>💡 BETTING TIPS</Text>
                  <Text style={styles.tip}>
                    • Bet on multiple clubs to increase your chances
                  </Text>
                  <Text style={styles.tip}>
                    • Common clubs (×5) hit more often but pay less
                  </Text>
                  <Text style={styles.tip}>
                    • The UCL Trophy (×100) is rare but pays big
                  </Text>
                  <Text style={styles.tip}>
                    • Long-press a club to remove a bet
                  </Text>
                </View>

                {/* Fairness */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>🔒 PROVABLY FAIR</Text>
                  <Text style={styles.tip}>
                    Every spin uses HMAC-SHA256 with a server seed and your client seed. Results can be independently verified.
                  </Text>
                </View>

                <View style={{ height: 20 }} />
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#1a0d3d',
    width: '92%',
    maxHeight: '80%',
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  scroll: {
    maxHeight: 500,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#FFD700',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  rule: {
    color: '#ccc',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 2,
  },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
  },
  symbolIconWrap: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  symbolInfo: {
    flex: 1,
  },
  symbolName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  symbolTier: {
    color: '#999',
    fontSize: 11,
    marginTop: 2,
  },
  multiplierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  multiplierText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  tip: {
    color: '#bbb',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 2,
  },
});
