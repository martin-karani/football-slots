import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigation } from './src/navigation/AppNavigation';
import { GameProvider } from './src/store/GameProvider';

export default function App() {
  return (
    <SafeAreaProvider>
      <GameProvider>
        <NavigationContainer>
          <AppNavigation />
        </NavigationContainer>
        <StatusBar style="light" />
      </GameProvider>
    </SafeAreaProvider>
  );
}
