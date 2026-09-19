/**
 * config.js
 * Central place for every tunable threshold in the app.
 * Change values here to tune detection sensitivity — nothing else
 * in the codebase should hardcode a magic number for pose logic.
 */
const PUSHUP_CONFIG = {
  // --- Elbow angle thresholds (degrees) ---
  // Angle at the elbow: shoulder-elbow-wrist.
  // Large angle (arm straight) = TOP position.
  // Small angle (arm bent) = BOTTOM position.
  topElbowAngle: 155,        // elbow angle >= this => arm considered straight (TOP)
  bottomElbowAngle: 95,      // elbow angle <= this => arm considered bent (BOTTOM)

  // --- Body alignment sanity check ---
  // shoulder-hip-ankle should stay roughly a straight line during a real push-up.
  minBodyLineAngle: 140,     // degrees; below this we still count, but flag "GO LOWER"/form issues loosely

  // --- Confidence ---
  confidenceThreshold: 0.5,  // per-landmark visibility/presence score required to trust a point

  // --- Rep timing / debounce ---
  minimumRepDurationMs: 500,   // fastest a legit rep can be (guards against double counting)
  maximumRepDurationMs: 8000,  // slowest we still call one continuous rep (otherwise reset to READY)
  repDebounceMs: 350,          // minimum time after a completed rep before a new one can start

  // --- Analysis throttling ---
  targetAnalysisFps: 20,     // cap pose-detection inference rate

  // --- Smoothing ---
  angleSmoothingFrames: 3,   // simple moving average window for elbow angle to reduce jitter

  // --- Visibility requirements for a valid push-up frame ---
  requiredLandmarks: [
    'leftShoulder', 'rightShoulder',
    'leftElbow', 'rightElbow',
    'leftWrist', 'rightWrist',
    'leftHip', 'rightHip'
  ],

  // How many of the required landmark pairs must be visible (side view may only show one side well)
  minVisibleSide: 'either', // 'either' = left OR right side fully visible is enough
};

// Freeze so nothing accidentally mutates shared config at runtime
Object.freeze(PUSHUP_CONFIG);
