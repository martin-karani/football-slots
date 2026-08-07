import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useGameStore } from '../store/GameProvider';
import { useWallet } from '../hooks/useWallet';
import { authStorage } from '../api/client';
import { CurrencyType } from '../types';

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const balances = useGameStore((state) => state.balances);
  const currency = useGameStore((state) => state.currency);
  const setCurrency = useGameStore((state) => state.setCurrency);
  const clearAuth = useGameStore((state) => state.clearAuth);
  const phoneNumber = useGameStore((state) => state.phoneNumber);
  const { topupVirtual } = useWallet();

  const formatBalance = (minor: number) => (minor / 100).toFixed(2);

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await authStorage.clearToken();
          clearAuth();
        },
      },
    ]);
  };

  const currencies: { key: CurrencyType; label: string; icon: string; desc: string }[] = [
    { key: 'virtual', label: 'FUN',   icon: '🎮', desc: 'Free play money. No real value.' },
    { key: 'real',    label: 'KES',   icon: '💰', desc: 'Real money via M-Pesa. Withdrawable.' },
    { key: 'bonus',   label: 'BONUS', icon: '🎁', desc: 'Promo credits. Cannot withdraw.' },
  ];

  const menuItems = [
    {
      icon: '💰',
      label: 'Wallet & Deposit',
      sub: 'Manage your balances and deposit via M-Pesa',
      onPress: () => navigation.navigate('Wallet'),
    },
    {
      icon: '📜',
      label: 'Bet History',
      sub: 'View your past spins and results',
      onPress: () => navigation.navigate('History'),
    },
    {
      icon: '🎁',
      label: 'Free FUN Refill',
      sub: 'Get 1,000 free FUN credits to keep playing',
      onPress: topupVirtual,
    },
    {
      icon: '🔒',
      label: 'Responsible Gambling',
      sub: 'Set limits and protect your play',
      onPress: () => Alert.alert('Coming Soon', 'Responsible gambling tools will be available soon.'),
    },
    {
      icon: '📋',
      label: 'Provably Fair',
      sub: 'Verify every spin is genuinely random',
      onPress: () => Alert.alert('Provably Fair', 'Each spin uses HMAC-SHA256 with your client seed + our server seed. Results are verifiable.'),
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>⚙️ Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>⚽</Text>
        </View>
        <View>
          <Text style={styles.profilePhone}>{phoneNumber}</Text>
          <Text style={styles.profileSub}>Football Slots Player</Text>
        </View>
      </View>

      {/* Balance Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>💼 Balances</Text>
        <View style={styles.balanceGrid}>
          {currencies.map((c) => (
            <TouchableOpacity
              key={c.key}
              style={[styles.balanceCard, currency === c.key && styles.balanceCardActive]}
              onPress={() => setCurrency(c.key)}
            >
              <Text style={styles.balanceIcon}>{c.icon}</Text>
              <Text style={styles.balanceLabel}>{c.label}</Text>
              <Text style={styles.balanceAmount}>{formatBalance(balances[c.key])}</Text>
              <Text style={styles.balanceDesc}>{c.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Menu Items */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔧 Options</Text>
        {menuItems.map((item) => (
          <TouchableOpacity key={item.label} style={styles.menuItem} onPress={item.onPress}>
            <Text style={styles.menuItemIcon}>{item.icon}</Text>
            <View style={styles.menuItemText}>
              <Text style={styles.menuItemLabel}>{item.label}</Text>
              <Text style={styles.menuItemSub}>{item.sub}</Text>
            </View>
            <Text style={styles.menuItemChevron}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>🚪 Log Out</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Football Slots v1.0 · Powered by Provably Fair RNG</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a0d3d' },
  content: { paddingBottom: 40 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#250d50',
    borderBottomWidth: 1,
    borderBottomColor: '#3d1a6e',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  title: { color: '#FFD700', fontWeight: '900', fontSize: 18 },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#2d1b4e',
    margin: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3d2b5e',
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4a1a7e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileAvatarText: { fontSize: 28 },
  profilePhone: { color: '#FFD700', fontWeight: '800', fontSize: 16 },
  profileSub: { color: '#aaa', fontSize: 12, marginTop: 2 },

  section: { marginHorizontal: 16, marginBottom: 16 },
  sectionTitle: {
    color: '#FFD700',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  balanceGrid: { gap: 8 },
  balanceCard: {
    backgroundColor: '#2d1b4e',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#3d2b5e',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  balanceCardActive: { borderColor: '#FFD700', backgroundColor: '#3a2260' },
  balanceIcon: { fontSize: 22 },
  balanceLabel: { color: '#fff', fontWeight: '700', fontSize: 14, width: 50 },
  balanceAmount: { color: '#FFD700', fontWeight: '900', fontSize: 16, flex: 1, textAlign: 'right' },
  balanceDesc: { color: '#777', fontSize: 10, position: 'absolute', bottom: 5, right: 12 },

  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2d1b4e',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#3d2b5e',
    gap: 12,
  },
  menuItemIcon: { fontSize: 22, width: 32, textAlign: 'center' },
  menuItemText: { flex: 1 },
  menuItemLabel: { color: '#fff', fontWeight: '700', fontSize: 14 },
  menuItemSub: { color: '#888', fontSize: 11, marginTop: 2 },
  menuItemChevron: { color: '#FFD700', fontSize: 22, fontWeight: 'bold' },

  logoutBtn: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: 'rgba(255,77,77,0.12)',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,77,77,0.3)',
  },
  logoutText: { color: '#ff4d4d', fontWeight: '800', fontSize: 15 },
  version: { textAlign: 'center', color: '#444', fontSize: 10, marginTop: 4 },
});
