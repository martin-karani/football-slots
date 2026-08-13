import { useCallback, useRef } from 'react';
import { useSharedValue, withSequence, withTiming, Easing } from 'react-native-reanimated';

const POSITION_COUNT = 24;

// Exact time gaps (in milliseconds) between every consecutive click in wheel_spin.mp3 (79 gaps total, 9.00s total duration).
// Extracted via audio peak detection directly from wheel_spin.mp3:
// 1. Initial spin-up (0.0s -> 1.0s): ~110ms -> ~70ms
// 2. Maximum speed spin (1.0s -> 3.5s): 60ms - 70ms per click
// 3. Early deceleration (3.5s -> 5.8s): 90ms -> 170ms
// 4. Slow spin & dramatic landing (5.8s -> 9.03s): 170ms -> 600ms landing
const AUDIO_CLICK_GAPS = [
  110, 120, 110, 100, 110, 90, 100, 90, 80, 80, 70, 70, 60, 60, 70, 60, 70, 60, 60, 70,
  60, 70, 60, 70, 60, 60, 70, 60, 70, 60, 60, 70, 60, 70, 60, 70, 60, 60, 70, 60,
  70, 60, 60, 70, 60, 70, 70, 70, 90, 90, 90, 90, 100, 100, 110, 100, 110, 100, 110, 110,
  130, 140, 140, 130, 140, 150, 150, 160, 170, 170, 180, 210, 230, 260, 260, 290, 370, 470, 600
];

export function useWheelAnimator() {
  const step = useSharedValue(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track the last final position on the JS side
  const lastFinalStep = useRef(0);

  const startSpin = useCallback(() => {
    // Kept for interface compatibility; animation sequence is launched when result arrives in stopOnIndex
  }, []);

  const stopOnIndex = useCallback(
    (targetIndex: number, elapsedSinceSpinStart: number = 0) => {
      return new Promise<void>((resolve) => {
        const currentStep = lastFinalStep.current;

        // Current visual cell (0..23)
        const currentVisualPos = ((currentStep % POSITION_COUNT) + POSITION_COUNT) % POSITION_COUNT;

        // Total clicks in full audio clip
        const totalAudioClicks = AUDIO_CLICK_GAPS.length; // 79 clicks

        // Find total steps so that (currentStep + totalSteps) % 24 === targetIndex
        const rawRem = (targetIndex - currentVisualPos + POSITION_COUNT) % POSITION_COUNT;
        
        // We want totalSteps to be as close to totalAudioClicks (79) as possible while landing exactly on targetIndex
        // 79 % 24 = 7. Adjust totalSteps so (currentStep + totalSteps) % 24 === targetIndex:
        let totalSteps = Math.floor((totalAudioClicks - rawRem) / POSITION_COUNT) * POSITION_COUNT + rawRem;
        if (totalSteps < POSITION_COUNT * 2) {
          totalSteps += POSITION_COUNT * 2;
        }

        // Calculate click index offset based on elapsed time if spin API call took noticeable time
        let startIndex = 0;
        if (elapsedSinceSpinStart > 50) {
          let accumulated = 0;
          for (let i = 0; i < AUDIO_CLICK_GAPS.length; i++) {
            accumulated += AUDIO_CLICK_GAPS[i];
            if (accumulated >= elapsedSinceSpinStart) {
              startIndex = i;
              break;
            }
          }
        }

        // Slice remaining audio click gaps
        const activeGaps = AUDIO_CLICK_GAPS.slice(startIndex);
        const activeClickCount = activeGaps.length;

        // Map each step 1:1 to an audio click duration!
        const stepAnimations = [];
        let runningStep = currentStep;
        let totalMs = 0;

        for (let k = 0; k < activeClickCount; k++) {
          const stepAmount = totalSteps / activeClickCount;
          runningStep += stepAmount;
          const gapMs = activeGaps[k];
          totalMs += gapMs;

          stepAnimations.push(
            withTiming(runningStep, {
              duration: gapMs,
              easing: Easing.linear,
            })
          );
        }

        // Snap shared value to current visual position first
        step.value = currentStep;

        // Execute 1-to-1 audio click animation sequence
        step.value = withSequence(...stepAnimations);

        const finalStepValue = currentStep + totalSteps;

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          lastFinalStep.current = finalStepValue;
          step.value = finalStepValue;
          resolve();
        }, totalMs);
      });
    },
    [step],
  );

  const stopAnimation = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return { step, startSpin, stopOnIndex, stopAnimation };
}
