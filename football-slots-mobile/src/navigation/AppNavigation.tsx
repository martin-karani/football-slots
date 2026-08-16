import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { LoginScreen } from '../screens/LoginScreen';
import { GameScreen } from '../screens/GameScreen';
import { WalletScreen } from '../screens/WalletScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { TransactionsScreen } from '../screens/TransactionsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { PaytableScreen } from '../screens/PaytableScreen';
import { useGameStore } from '../store/GameProvider';
import { authApi, authStorage } from '../api/client';
import { ToastProvider } from '../components/Toast';
import { theme } from '../components/theme';

const Stack = createStackNavigator();

export function AppNavigation() {
  const [isInitializing, setIsInitializing] = useState(true);
  const isAuthenticated = useGameStore((state) => state.isAuthenticated);
  const setAuth = useGameStore((state) => state.setAuth);
  const clearAuth = useGameStore((state) => state.clearAuth);

  useEffect(() => {
    async function restoreSession() {
      try {
        const token = await authStorage.getToken();
        if (token) {
          const res = await authApi.me();
          setAuth(res.data.phone_number, res.data.kyc_status);
        }
      } catch (e: any) {
        await authStorage.clearToken();
        clearAuth();
      } finally {
        setIsInitializing(false);
      }
    }
    restoreSession();
  }, [setAuth, clearAuth]);

  if (isInitializing) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={theme.colors.gold} />
      </View>
    );
  }

  return (
    <ToastProvider>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <>
            {/* Game is the root / default screen */}
            <Stack.Screen name="Game" component={GameScreen} />
            {/* Profile hub — accessed from game menu */}
            <Stack.Screen
              name="Profile"
              component={SettingsScreen}
              options={{ animation: 'slide_from_right' }}
            />
            {/* Wallet — accessible from Profile */}
            <Stack.Screen
              name="Wallet"
              component={WalletScreen}
              options={{ animation: 'slide_from_right' }}
            />
            {/* Transactions — accessible from Wallet */}
            <Stack.Screen
              name="Transactions"
              component={TransactionsScreen}
              options={{ animation: 'slide_from_right' }}
            />
            {/* Bet History — accessible from Profile */}
            <Stack.Screen
              name="History"
              component={HistoryScreen}
              options={{ animation: 'slide_from_right' }}
            />
            {/* Paytable & Rules — accessible from Game menu & Profile */}
            <Stack.Screen
              name="Paytable"
              component={PaytableScreen}
              options={{ animation: 'slide_from_right' }}
            />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </ToastProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#2a0048',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
