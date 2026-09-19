/**
 * WorkoutSession.js
 * Represents one workout session: start time, elapsed time (pausable),
 * and the rep count for that session. Delegates rep detection logic to
 * PushUpDetector; this module just tracks session-level bookkeeping.
 */
function createWorkoutSession() {
  let startTime = null;
  let elapsedBeforePause = 0;
  let pausedAt = null;
  let isPaused = false;
  let isActive = false;
  let reps = 0;

  function start() {
    startTime = performance.now();
    elapsedBeforePause = 0;
    pausedAt = null;
    isPaused = false;
    isActive = true;
    reps = 0;
  }

  function pause() {
    if (!isActive || isPaused) return;
    isPaused = true;
    pausedAt = performance.now();
  }

  function resume() {
    if (!isActive || !isPaused) return;
    elapsedBeforePause += performance.now() - pausedAt;
    pausedAt = null;
    isPaused = false;
  }

  function stop() {
    isActive = false;
    isPaused = false;
  }

  function elapsedMs() {
    if (!startTime) return 0;
    if (isPaused) {
      return pausedAt - startTime - elapsedBeforePause;
    }
    return performance.now() - startTime - elapsedBeforePause;
  }

  function setReps(count) {
    reps = count;
  }

  function getReps() {
    return reps;
  }

  function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return {
    start,
    pause,
    resume,
    stop,
    setReps,
    getReps,
    elapsedMs,
    formatTime,
    get isActive() { return isActive; },
    get isPaused() { return isPaused; },
  };
}
