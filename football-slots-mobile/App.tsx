import 'react-native-gesture-handler';
import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigation } from './src/navigation/AppNavigation';
import { GameProvider } from './src/store/GameProvider';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { theme } from './src/components/theme';

// Keep the splash screen visible while we load fonts
SplashScreen.preventAutoHideAsync();

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Pre-load fonts
        await Font.loadAsync({
          'RussoOne-Regular': require('./assets/fonts/RussoOne-Regular.ttf'),
          'ChakraPetch-Bold': require('./assets/fonts/ChakraPetch-Bold.ttf'),
          'ChakraPetch-BoldItalic': require('./assets/fonts/ChakraPetch-BoldItalic.ttf'),
          'ChakraPetch-Regular': require('./assets/fonts/ChakraPetch-Regular.ttf'),
          'Exo2-Regular': require('./assets/fonts/Exo2-Regular.ttf'),
          'Exo2-SemiBold': require('./assets/fonts/Exo2-SemiBold.ttf'),
          'Exo2-Bold': require('./assets/fonts/Exo2-Bold.ttf'),
        });
      } catch (e) {
        console.warn('Font loading warning:', e);
      } finally {
        setAppIsReady(true);
      }
    }
    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  if (!appIsReady) {
    return null;
  }

  return (
    <SafeAreaProvider onLayout={onLayoutRootView}>
      <GameProvider>
        <NavigationContainer>
          <AppNavigation />
        </NavigationContainer>
        <StatusBar style="light" backgroundColor={theme.colors.background} />
      </GameProvider>
    </SafeAreaProvider>
  );
}
