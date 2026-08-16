import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useGameStore } from '../store/GameProvider';
import { CurrencyType, formatMinor } from '../types';
import { theme } from './theme';
import { Ionicons } from '@react-native-vector-icons/ionicons';

export function WalletHeader() {
  const currency = useGameStore((state) => state.currency);
  const balanceMinor = useGameStore((state) => state.balances[currency]);
  const setCurrency = useGameStore((state) => state.setCurrency);

  const currencies: { key: CurrencyType; label: string; icon: any; accent: string }[] = [
    { key: 'virtual', label: 'DEMO', icon: 'game-controller-outline', accent: theme.colors.blue },
    { key: 'real', label: 'KES', icon: 'cash-outline', accent: theme.colors.gold },
    { key: 'bonus', label: 'BONUS', icon: 'gift-outline', accent: theme.colors.bonusAccent },
  ];

  const activeCurrency = currencies.find((c) => c.key === currency)!;

  return (
    <View style={styles.container}>
      <View style={styles.balanceRow}>
        <Ionicons name={activeCurrency.icon as any} size={20} color={activeCurrency.accent} />
        <Text style={[styles.balance, { color: activeCurrency.accent }]}>
          {currency === 'real' ? 'KES ' : ''}
          {formatMinor(balanceMinor, currency)}
        </Text>
      </View>

      <View style={styles.toggleRow}>
        {currencies.map((c) => {
          const isActive = currency === c.key;
          return (
            <TouchableOpacity
              key={c.key}
              style={[
                styles.toggleBtn,
                isActive && [styles.toggleBtnActive, { backgroundColor: c.accent + '22', borderColor: c.accent + '55' }],
              ]}
              onPress={() => setCurrency(c.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={c.icon as any}
                size={14}
                color={isActive ? c.accent : theme.colors.textDim}
              />
              <Text
                style={[
                  styles.toggleText,
                  isActive && { color: c.accent },
                ]}
              >
                {c.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const { colors, radius } = theme;

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  balance: {
    fontFamily: theme.fonts.numbers,
    fontSize: 28,
    fontWeight: '900',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.glassLight,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 4,
  },
  toggleBtnActive: {
    borderWidth: 1,
  },
  toggleText: {
    fontFamily: theme.fonts.bodyBold,
    color: colors.textDim,
    fontWeight: '600',
    fontSize: 11,
  },
});
