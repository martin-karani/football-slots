import { useCallback, useRef } from 'react';
import { Platform, Vibration } from 'react-native';

// ============================================================
// Sound types
// ============================================================

export type SoundEvent =
  | 'spin_start'
  | 'spin_tick'
  | 'win_small'
  | 'win_big'
  | 'win_jackpot'
  | 'loss'
  | 'bet_place'
  | 'bet_remove';

// ============================================================
// Haptic helper
// ============================================================

function haptic(type: 'light' | 'medium' | 'heavy' | 'selection') {
  if (Platform.OS === 'ios') {
    Vibration.vibrate(10);
  } else {
    Vibration.vibrate(type === 'heavy' ? 50 : 20);
  }
}

// ============================================================
// Sound hook — haptic feedback for game events
// ============================================================

export function useSound() {
  const enabled = useRef(true);

  /**
   * Play a sound effect for a game event.
   * Uses haptic feedback patterns for different events.
   */
  const play = useCallback(async (event: SoundEvent) => {
    if (!enabled.current) return;
    switch (event) {
      case 'spin_start':
        haptic('medium');
        break;
      case 'spin_tick':
        haptic('light');
        break;
      case 'win_small':
        haptic('medium');
        Vibration.vibrate([0, 50, 30, 50]);
        break;
      case 'win_big':
        haptic('heavy');
        Vibration.vibrate([0, 50, 30, 50, 30, 100]);
        break;
      case 'win_jackpot':
        haptic('heavy');
        Vibration.vibrate([0, 50, 30, 50, 30, 50, 30, 200]);
        break;
      case 'loss':
        haptic('light');
        break;
      case 'bet_place':
        haptic('selection');
        break;
      case 'bet_remove':
        haptic('light');
        break;
    }
  }, []);

  const toggle = useCallback(() => {
    enabled.current = !enabled.current;
  }, []);

  return { play, toggle, isEnabled: enabled.current };
}
