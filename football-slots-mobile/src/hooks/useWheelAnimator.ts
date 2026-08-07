import { useCallback, useRef } from 'react';
import { useSharedValue, withTiming, withSequence, Easing } from 'react-native-reanimated';

const POSITION_COUNT = 24;
const FULL_LAPS_BEFORE_LAND = 2;

export function useWheelAnimator() {
  const step = useSharedValue(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Track the last final position on the JS side so we always know
  // where the wheel stopped, even though the animation runs on the UI thread.
  const lastFinalStep = useRef(0);

  const startSpin = useCallback(() => {
    // No-op: we keep the wheel at its last stopped position.
    // The animation in stopOnIndex picks up from lastFinalStep.
  }, []);

  const stopOnIndex = useCallback(
    (targetIndex: number) => {
      return new Promise<void>((resolve) => {
        // Use our JS-side ref — this is always correct.
        const currentStep = lastFinalStep.current;

        // Which cell (0–23) is currently highlighted?
        const currentVisualPos = ((currentStep % POSITION_COUNT) + POSITION_COUNT) % POSITION_COUNT;

        // How many clockwise steps from current position to the target?
        let stepsToTarget = (targetIndex - currentVisualPos + POSITION_COUNT) % POSITION_COUNT;
        if (stepsToTarget === 0) stepsToTarget = POSITION_COUNT; // don't skip if already on target

        // Phase targets — all relative to currentStep
        const phase1End = currentStep + POSITION_COUNT;                           // 1st lap (accel)
        const phase2End = currentStep + POSITION_COUNT * FULL_LAPS_BEFORE_LAND;   // 2nd lap (full speed)
        const finalEnd  = phase2End + stepsToTarget;                              // land on winner

        // Durations
        const phase1Duration = 2000;
        const phase2Duration = 1000;
        const phase3Duration = 1200 + stepsToTarget * 60;
        const totalDuration  = phase1Duration + phase2Duration + phase3Duration;

        // Snap the shared value to the current known position first,
        // cancelling any lingering animation, then run the new sequence.
        step.value = currentStep;

        // Kick off the 3-phase animation from the current position
        step.value = withSequence(
          withTiming(phase1End, {
            duration: phase1Duration,
            easing: Easing.in(Easing.cubic),
          }),
          withTiming(phase2End, {
            duration: phase2Duration,
            easing: Easing.linear,
          }),
          withTiming(finalEnd, {
            duration: phase3Duration,
            easing: Easing.out(Easing.cubic),
          }),
        );

        // After the animation finishes, record where we landed.
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          lastFinalStep.current = finalEnd;
          // Also snap the shared value to the exact final number
          // so the UI thread and JS thread are in sync.
          step.value = finalEnd;
          resolve();
        }, totalDuration + 200);
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
