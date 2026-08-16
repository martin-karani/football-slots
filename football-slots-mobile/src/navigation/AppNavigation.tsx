import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { LoginScreen } from '../screens/LoginScreen';
import { GameScreen } from '../screens/GameScreen';
import { WalletScreen } from '../screens/WalletScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { useGameStore } from '../store/GameProvider';
import { authApi, authStorage } from '../api/client';
import { ToastProvider } from '../components/Toast';
import { BottomNavigation } from '../components/BottomNavigation';
import { theme } from '../components/theme';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

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
            <Stack.Screen name="Main" component={MainTabNavigator} />
            {/* Stack screens for GameScreen dropdown navigation */}
            <Stack.Screen name="Wallet" component={WalletScreen} options={{ headerShown: false }} />
            <Stack.Screen name="History" component={HistoryScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ presentation: 'modal' }} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </ToastProvider>
  );
}

/**
 * Main tab navigator with custom bottom navigation bar.
 */
function MainTabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        lazy: true,
      }}
      tabBar={(props) => <BottomNavigation tabBarProps={props} />}
    >
      <Tab.Screen name="Home" component={SettingsScreen} />
      <Tab.Screen name="WalletTab" component={WalletScreen} />
      <Tab.Screen name="Game" component={GameScreen} />
      <Tab.Screen name="Activity" component={HistoryScreen} />
      <Tab.Screen name="SettingsTab" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
