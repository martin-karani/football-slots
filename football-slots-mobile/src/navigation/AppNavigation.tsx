import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { LoginScreen } from '../screens/LoginScreen';
import { GameScreen } from '../screens/GameScreen';
import { WalletScreen } from '../screens/WalletScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { useGameStore } from '../store/GameProvider';
import { authApi, authStorage } from '../api/client';

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
        console.log('[AUTH] Restore session – token exists:', !!token);
        if (token) {
          const res = await authApi.me();
          console.log('[AUTH] /auth/me succeeded:', res.data.phone_number);
          setAuth(res.data.phone_number, res.data.kyc_status);
        }
      } catch (e: any) {
        console.log('[AUTH] Session restore failed, clearing:', e?.response?.status);
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
        <ActivityIndicator size="large" color="#FFD700" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <>
          {/* Full-screen Game — no tab bar */}
          <Stack.Screen name="Game" component={GameScreen} />
          {/* Settings hub */}
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ presentation: 'modal' }}
          />
          {/* Wallet pushed from Settings */}
          <Stack.Screen
            name="Wallet"
            component={WalletScreen}
            options={{
              headerShown: true,
              headerStyle: { backgroundColor: '#1a0d3d' },
              headerTintColor: '#FFD700',
              headerTitle: '💰 Wallet',
            }}
          />
          {/* History pushed from Settings */}
          <Stack.Screen
            name="History"
            component={HistoryScreen}
            options={{
              headerShown: true,
              headerStyle: { backgroundColor: '#1a0d3d' },
              headerTintColor: '#FFD700',
              headerTitle: '📜 Bet History',
            }}
          />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#1a0d3d',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
