import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

// ── Screen names (single source of truth) ──────────────────────────
export type RootStackParamList = {
  Login: undefined;
  Game: undefined;
  Profile: undefined;
  Wallet: undefined;
  Transactions: undefined;
  History: undefined;
  Paytable: undefined;
};
export type ScreenName = keyof RootStackParamList;

// ── Typed hooks ────────────────────────────────────────────────────
export type Navigation = NativeStackNavigationProp<RootStackParamList>;
export type Route<T extends ScreenName> = RouteProp<RootStackParamList, T>;

/**
 * Drop-in replacement for `useNavigation<any>()`.
 * Returns a properly typed navigation object so `goBack` / `navigate`
 * are checked at compile time and the IDE gives autocomplete.
 */
export function useAppNavigation(): Navigation {
  return useNavigation<Navigation>();
}

/**
 * Reliable back button handler.
 * Tries `goBack()` first (pops the current screen off the stack).
 * Falls back to `replace("Game")` so the user never gets stuck on a
 * dead-end screen when the stack is empty (e.g. after a cold start
 * or session restore).
 */
export function useGoBack(fallback: ScreenName = "Game") {
  const navigation = useAppNavigation();

  return () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // replace() swaps the current screen for the fallback instead of
      // pushing a new one on top — avoids an ever-growing stack.
      navigation.replace(fallback);
    }
  };
}
