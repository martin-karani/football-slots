import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useGameStore } from '../store/GameProvider';
import { SYMBOLS, CHIP_VALUES } from '../types';

function getSymbolIcon(symbol: string) {
  const found = SYMBOLS.find((s) => s.key === symbol);
  return found?.icon || null;
}

export function BettingPanel() {
  const currentBets = useGameStore((state) => state.currentBets);
  const selectedChip = useGameStore((state) => state.selectedChip);
  const currency = useGameStore((state) => state.currency);
  const placeBet = useGameStore((state) => state.placeBet);
  const removeBet = useGameStore((state) => state.removeBet);
  const setSelectedChip = useGameStore((state) => state.setSelectedChip);

  const chipMultiplier = currency === 'real' ? 100 : 1;

  return (
    <View style={styles.container}>
      {/* Chip Selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
        <View style={styles.chipRow}>
          {CHIP_VALUES.map((value) => (
            <TouchableOpacity
              key={value}
              style={[
                styles.chip,
                selectedChip === value && styles.chipSelected,
              ]}
              onPress={() => setSelectedChip(value)}
            >
              <Text style={[
                styles.chipText,
                selectedChip === value && styles.chipTextSelected,
              ]}>
                {value}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Symbol Bet Buttons */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.symbolsScroll}>
        <View style={styles.symbolRow}>
          {SYMBOLS.map((sym) => {
            const betAmount = currentBets[sym.key] || 0;
            return (
              <View key={sym.key} style={styles.symbolCard}>
                <View style={styles.symbolIconContainer}>
                  {(() => {
                    const Icon = getSymbolIcon(sym.key);
                    return Icon ? <Icon width={28} height={28} /> : null;
                  })()}
                </View>
                <Text style={styles.symbolName}>{sym.name}</Text>
                <View style={styles.betControls}>
                  <TouchableOpacity
                    style={[styles.betBtn, styles.betBtnMinus]}
                    onPress={() => removeBet(sym.key, selectedChip * chipMultiplier)}
                  >
                    <Text style={styles.betBtnText}>−</Text>
                  </TouchableOpacity>
                  <View style={styles.betAmountContainer}>
                    <Text style={[
                      styles.betAmount,
                      betAmount > 0 && styles.betAmountActive,
                    ]}>
                      {betAmount || '0'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.betBtn, styles.betBtnPlus]}
                    onPress={() => placeBet(sym.key, selectedChip * chipMultiplier)}
                  >
                    <Text style={styles.betBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#120024',
    borderTopWidth: 1,
    borderTopColor: '#2d1b4e',
    maxHeight: 180,
  },
  chipScroll: {
    paddingHorizontal: 8,
  },
  chipRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  chip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#555',
  },
  chipSelected: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  chipText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  chipTextSelected: {
    color: '#1a0033',
  },
  symbolsScroll: {
    paddingHorizontal: 8,
  },
  symbolRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
  },
  symbolCard: {
    width: 72,
    backgroundColor: '#2d1b4e',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  symbolIconContainer: {
    marginBottom: 4,
  },
  symbolName: {
    color: '#aaa',
    fontSize: 9,
    marginTop: 2,
    textAlign: 'center',
  },
  betControls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  betBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  betBtnMinus: {
    backgroundColor: '#dc3545',
  },
  betBtnPlus: {
    backgroundColor: '#4CAF50',
  },
  betBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
    lineHeight: 14,
  },
  betAmountContainer: {
    minWidth: 30,
    alignItems: 'center',
  },
  betAmount: {
    color: '#666',
    fontSize: 11,
  },
  betAmountActive: {
    color: '#FFD700',
    fontWeight: 'bold',
  },
});
