import { useCallback, useEffect, useRef } from 'react';
import { Platform, Vibration } from 'react-native';

// ============================================================
// Sound types
// ============================================================

export type SoundEvent =
  | 'spin_start'
  | 'spin_click'
  | 'spin_tick'
  | 'reel_stop'
  | 'win_celebration'
  | 'win_small'
  | 'win_big'
  | 'win_jackpot'
  | 'loss'
  | 'bet_place'
  | 'bet_remove'
  | 'button_press'
  | 'chip_select';

// ============================================================
// Sound asset map — each event → local sound file
// ============================================================

const SOUND_FILES: Record<string, number> = {
  spin_start:      require('../../assets/sounds/wheel_spin.mp3'),
  spin_click:      require('../../assets/sounds/spin_click.mp3'),
  chip_select:     require('../../assets/sounds/chip_select.mp3'),
  reel_stop:       require('../../assets/sounds/reel_stop.wav'),
  win_celebration: require('../../assets/sounds/win_celebration.mp3'),
  win_small:       require('../../assets/sounds/win_celebration.mp3'),
  win_big:         require('../../assets/sounds/win_celebration.mp3'),
  win_jackpot:     require('../../assets/sounds/win_celebration.mp3'),
  loss:            require('../../assets/sounds/loss.wav'),
  bet_place:       require('../../assets/sounds/chip_select.mp3'),
  bet_remove:      require('../../assets/sounds/bet_remove.wav'),
  button_press:    require('../../assets/sounds/button_press.wav'),
};

// spin_tick reuses reel_stop for the ticking feel
SOUND_FILES.spin_tick = SOUND_FILES.reel_stop;

// ============================================================
// Haptic helper (always works — fallback when audio unavailable)
// ============================================================

function haptic(type: 'light' | 'medium' | 'heavy' | 'selection') {
  if (Platform.OS === 'ios') {
    Vibration.vibrate(10);
  } else {
    Vibration.vibrate(type === 'heavy' ? 50 : 20);
  }
}

// ============================================================
// Thin player type — union of expo-audio and fallback shapes
// ============================================================

type RawPlayer = {
  play: () => Promise<void> | void;
  stop: () => Promise<void> | void;
  seekTo?: (positionSecs: number) => Promise<void> | void;
  setPositionAsync?: (positionMs: number) => Promise<void> | void;
  currentTime?: number;
  volume: number;
};

function createRawPlayer(source: number): RawPlayer {
  try {
    const { createAudioPlayer } = require('expo-audio');
    const p = createAudioPlayer(source);
    p.volume = 0.85;
    return p;
  } catch {
    // Fallback no-op when expo-audio is unavailable
    return { play: () => {}, stop: () => {}, volume: 0 };
  }
}

/**
 * Rewind a player to position 0, then start playback.
 *
 * WHY NOT stop() then play()?
 * expo-audio stop() is async. Calling play() right after it fires
 * can catch the player mid-stop → silence. Instead we seek to 0
 * (which works on an already-playing player) then call play().
 * If the seek is async we chain play() in .then() so the order is guaranteed.
 */
function rewindAndPlay(p: RawPlayer): void {
  try {
    if (typeof p.seekTo === 'function') {
      // expo-audio ≥ 2.x API: seekTo(seconds)
      const r = p.seekTo(0);
      if (r && typeof (r as Promise<void>).then === 'function') {
        // Async seek — chain play after seek resolves
        (r as Promise<void>)
          .then(() => { try { p.play(); } catch {} })
          .catch(() => { try { p.play(); } catch {} }); // play anyway on failure
        return;
      }
      // Sync seek — fall through to play()
    } else if (typeof p.setPositionAsync === 'function') {
      // expo-av (older) style
      const r = p.setPositionAsync(0);
      if (r && typeof (r as Promise<void>).then === 'function') {
        (r as Promise<void>)
          .then(() => { try { p.play(); } catch {} })
          .catch(() => { try { p.play(); } catch {} });
        return;
      }
    } else if ('currentTime' in p) {
      // Web Audio / native direct property
      (p as any).currentTime = 0;
    }

    // Seek was synchronous (or unavailable) — play immediately
    p.play();
  } catch {
    try { p.play(); } catch {} // last resort
  }
}

// ============================================================
// SoundPool — round-robin pool of players per sound event
// Pool size 4 handles rapid-fire overlapping playbacks safely.
// ============================================================

const POOL_SIZE = 4;

class SoundPool {
  private players: RawPlayer[] = [];
  private index = 0;

  constructor(source: number, count = POOL_SIZE) {
    for (let i = 0; i < count; i++) {
      this.players.push(createRawPlayer(source));
    }
  }

  play(): void {
    if (!this.players.length) return;
    const player = this.players[this.index % this.players.length];
    this.index++;
    rewindAndPlay(player);
  }

  stopAll(): void {
    for (const p of this.players) {
      try {
        const r = p.stop();
        if (r && typeof (r as Promise<void>).catch === 'function') {
          (r as Promise<void>).catch(() => {});
        }
      } catch {}
    }
  }

  release(): void {
    this.stopAll();
    this.players = [];
  }
}

// ============================================================
// Module-level singleton pools — NEVER destroyed.
//
// Both useGame.ts and GameScreen.tsx call useSound(). If we destroyed
// pools in a hook cleanup, whichever component unmounts last would
// silently kill audio for the still-mounted one. Keeping pools as
// permanent module-level state avoids this entirely.
// ============================================================

let audioInitialized = false;
const pools: Map<string, SoundPool> = new Map();

function ensureInitialized(): void {
  if (audioInitialized && pools.size > 0) return;
  audioInitialized = true;
  for (const [event, source] of Object.entries(SOUND_FILES)) {
    if (!pools.has(event)) {
      pools.set(event, new SoundPool(source));
    }
  }
}

// Configure audio session at module load time (once, not per hook call)
(function initAudioSession() {
  try {
    const { setAudioModeAsync } = require('expo-audio');
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  } catch {}
})();

// ============================================================
// useSound hook
// ============================================================

export function useSound() {
  const enabled = useRef(true);

  useEffect(() => {
    ensureInitialized();
    // Intentionally NO cleanup — pools are permanent module-level singletons.
  }, []);

  /**
   * Play a sound effect.
   * Always triggers haptic feedback; audio is best-effort.
   */
  const play = useCallback((event: SoundEvent) => {
    if (!enabled.current) return;
    ensureInitialized(); // safety net

    switch (event) {
      case 'spin_start':
        haptic('medium');
        break;
      case 'spin_click':
        haptic('light');
        break;
      case 'spin_tick':
      case 'reel_stop':
        haptic('light');
        break;
      case 'win_celebration':
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
      case 'chip_select':
      case 'button_press':
        haptic('selection');
        break;
      case 'bet_remove':
        haptic('light');
        break;
    }

    try {
      pools.get(event)?.play();
    } catch {
      // Audio failure must never break gameplay.
    }
  }, []);

  const stop = useCallback((event?: SoundEvent) => {
    if (event) {
      pools.get(event)?.stopAll();
    } else {
      for (const pool of pools.values()) {
        pool.stopAll();
      }
    }
  }, []);

  const toggle = useCallback(() => {
    enabled.current = !enabled.current;
  }, []);

  return { play, stop, toggle, isEnabled: enabled.current };
}
