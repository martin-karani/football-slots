import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useGameStore } from '../store/GameProvider';
import { CurrencyType, formatMinor } from '../types';

export function WalletHeader() {
  const currency = useGameStore((state) => state.currency);
  const balanceMinor = useGameStore((state) => state.balances[currency]);
  const setCurrency = useGameStore((state) => state.setCurrency);

  const currencies: { key: CurrencyType; label: string; icon: string }[] = [
    { key: 'virtual', label: 'DEMO', icon: '🎮' },
    { key: 'real', label: 'KES', icon: '💰' },
    { key: 'bonus', label: 'BONUS', icon: '🎁' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.balanceRow}>
        <Text style={styles.balanceIcon}>
          {currencies.find((c) => c.key === currency)?.icon}
        </Text>
        <Text style={styles.balance}>
          {currency === 'real' ? 'KES ' : ''}
          {formatMinor(balanceMinor, currency)}
        </Text>
      </View>

      <View style={styles.toggleRow}>
        {currencies.map((c) => (
          <TouchableOpacity
            key={c.key}
            style={[
              styles.toggleBtn,
              currency === c.key && styles.toggleBtnActive,
            ]}
            onPress={() => setCurrency(c.key)}
          >
            <Text style={styles.toggleIcon}>{c.icon}</Text>
            <Text
              style={[
                styles.toggleText,
                currency === c.key && styles.toggleTextActive,
              ]}
            >
              {c.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#2d1b4e',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#3d2b5e',
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  balanceIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  balance: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    gap: 4,
  },
  toggleBtnActive: {
    backgroundColor: '#FFD700',
  },
  toggleIcon: {
    fontSize: 14,
  },
  toggleText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  toggleTextActive: {
    color: '#1a0033',
  },
});
