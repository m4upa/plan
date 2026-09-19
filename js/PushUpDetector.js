/**
 * PushUpDetector.js
 * The heart of the app. Consumes named landmarks (from PoseDetector),
 * computes joint angles, and runs a state machine that only counts a
 * repetition once a full down-and-up motion has been completed.
 *
 * States: READY -> TOP -> MOVING_DOWN -> BOTTOM -> MOVING_UP -> REP_COMPLETE -> TOP ...
 * ERROR state is used when tracking is lost mid-rep.
 *
 * This module has NO knowledge of the camera, canvas, or UI. It is a
 * pure function of (landmarks, timestamp) -> state + events.
 */
function createPushUpDetector(config = PUSHUP_CONFIG) {
  const STATES = Object.freeze({
    READY: 'READY',
    TOP: 'TOP',
    MOVING_DOWN: 'MOVING_DOWN',
    BOTTOM: 'BOTTOM',
    MOVING_UP: 'MOVING_UP',
    REP_COMPLETE: 'REP_COMPLETE',
    ERROR: 'ERROR',
  });

  let state = STATES.READY;
  let repCount = 0;
  let lastRepTimestamp = 0;
  let currentRepStartTimestamp = 0;
  let angleHistory = []; // for smoothing
  let lastGoodSide = null; // 'left' | 'right'

  function reset() {
    state = STATES.READY;
    repCount = 0;
    lastRepTimestamp = 0;
    currentRepStartTimestamp = 0;
    angleHistory = [];
    lastGoodSide = null;
  }

  function angleBetween(a, b, c) {
    // Angle at point b, formed by segments b->a and b->c, in degrees.
    const abx = a.x - b.x, aby = a.y - b.y;
    const cbx = c.x - b.x, cby = c.y - b.y;
    const dot = abx * cbx + aby * cby;
    const magAB = Math.hypot(abx, aby);
    const magCB = Math.hypot(cbx, cby);
    if (magAB === 0 || magCB === 0) return null;
    let cos = dot / (magAB * magCB);
    cos = Math.max(-1, Math.min(1, cos));
    return (Math.acos(cos) * 180) / Math.PI;
  }

  function pickVisibleSide(landmarks) {
    const leftOk = ['leftShoulder', 'leftElbow', 'leftWrist', 'leftHip']
      .every(k => landmarks[k] && landmarks[k].visibility >= config.confidenceThreshold);
    const rightOk = ['rightShoulder', 'rightElbow', 'rightWrist', 'rightHip']
      .every(k => landmarks[k] && landmarks[k].visibility >= config.confidenceThreshold);

    if (leftOk && rightOk) {
      // Prefer whichever side was last reliable, else default left
      return lastGoodSide === 'right' ? 'right' : 'left';
    }
    if (leftOk) return 'left';
    if (rightOk) return 'right';
    return null;
  }

  function smooth(angle) {
    angleHistory.push(angle);
    if (angleHistory.length > config.angleSmoothingFrames) angleHistory.shift();
    const sum = angleHistory.reduce((a, b) => a + b, 0);
    return sum / angleHistory.length;
  }

  /**
   * Main update function. Call once per analyzed frame.
   * @param {object|null} landmarks - named landmark map from PoseDetector, or null if no pose
   * @param {number} timestampMs
   * @returns {{
   *   state: string,
   *   repCount: number,
   *   repJustCompleted: boolean,
   *   feedback: string,   // one of the fixed feedback strings for UI
   *   elbowAngle: number|null,
   *   bodyDetected: boolean
   * }}
   */
  function update(landmarks, timestampMs) {
    if (!landmarks) {
      angleHistory = [];
      if (state !== STATES.READY) state = STATES.ERROR;
      return {
        state,
        repCount,
        repJustCompleted: false,
        feedback: 'BODY NOT DETECTED',
        elbowAngle: null,
        bodyDetected: false,
      };
    }

    const side = pickVisibleSide(landmarks);
    if (!side) {
      angleHistory = [];
      if (state !== STATES.READY) state = STATES.ERROR;
      return {
        state,
        repCount,
        repJustCompleted: false,
        feedback: 'WHOLE BODY NOT VISIBLE',
        elbowAngle: null,
        bodyDetected: false,
      };
    }
    lastGoodSide = side;

    const shoulder = landmarks[`${side}Shoulder`];
    const elbow = landmarks[`${side}Elbow`];
    const wrist = landmarks[`${side}Wrist`];
    const hip = landmarks[`${side}Hip`];

    const rawElbowAngle = angleBetween(shoulder, elbow, wrist);
    if (rawElbowAngle === null) {
      return {
        state,
        repCount,
        repJustCompleted: false,
        feedback: 'UNSURE',
        elbowAngle: null,
        bodyDetected: true,
      };
    }
    const elbowAngle = smooth(rawElbowAngle);

    // Body-line check (shoulder-hip straightness) is informational only —
    // used for form feedback, never blocks counting on its own.
    const ankle = landmarks[`${side}Ankle`];
    const bodyLineAngle = ankle ? angleBetween(shoulder, hip, ankle) : null;

    let repJustCompleted = false;
    let feedback = 'GOOD FORM';

    switch (state) {
      case STATES.READY:
        if (elbowAngle >= config.topElbowAngle) {
          state = STATES.TOP;
        } else {
          feedback = 'MOVE INTO POSITION';
        }
        break;

      case STATES.TOP:
        if (elbowAngle <= config.bottomElbowAngle) {
          // Skipped straight to bottom (unlikely) — still accept as moving down
          state = STATES.BOTTOM;
          currentRepStartTimestamp = timestampMs;
        } else if (elbowAngle < config.topElbowAngle - 5) {
          state = STATES.MOVING_DOWN;
          currentRepStartTimestamp = timestampMs;
        }
        break;

      case STATES.MOVING_DOWN:
        feedback = 'GO LOWER';
        if (elbowAngle <= config.bottomElbowAngle) {
          state = STATES.BOTTOM;
        } else if (elbowAngle >= config.topElbowAngle) {
          // User went back up without reaching bottom — not a rep, just reset to TOP
          state = STATES.TOP;
        } else if (timestampMs - currentRepStartTimestamp > config.maximumRepDurationMs) {
          state = STATES.ERROR;
        }
        break;

      case STATES.BOTTOM:
        if (elbowAngle > config.bottomElbowAngle + 5) {
          state = STATES.MOVING_UP;
        } else if (timestampMs - currentRepStartTimestamp > config.maximumRepDurationMs) {
          state = STATES.ERROR;
        }
        break;

      case STATES.MOVING_UP:
        if (elbowAngle >= config.topElbowAngle) {
          const duration = timestampMs - currentRepStartTimestamp;
          const sinceLastRep = timestampMs - lastRepTimestamp;

          const durationOk = duration >= config.minimumRepDurationMs &&
                              duration <= config.maximumRepDurationMs;
          const debounceOk = sinceLastRep >= config.repDebounceMs;

          if (durationOk && debounceOk) {
            repCount += 1;
            repJustCompleted = true;
            lastRepTimestamp = timestampMs;
            state = STATES.REP_COMPLETE;
            feedback = 'GOOD FORM';
          } else {
            // Too fast to be real, or within debounce window — discard, back to TOP
            state = STATES.TOP;
            feedback = 'GOOD FORM';
          }
        } else if (timestampMs - currentRepStartTimestamp > config.maximumRepDurationMs) {
          state = STATES.ERROR;
        }
        break;

      case STATES.REP_COMPLETE:
        // Immediately transition back to TOP so the next rep's MOVING_DOWN
        // detection has a clean baseline. REP_COMPLETE is a one-frame pulse
        // for the UI/animation layer to react to.
        state = STATES.TOP;
        break;

      case STATES.ERROR:
        // Recover once we see a clear top position again.
        if (elbowAngle >= config.topElbowAngle) {
          state = STATES.TOP;
        } else {
          feedback = 'MOVE INTO POSITION';
        }
        break;

      default:
        state = STATES.READY;
    }

    // Loose form feedback layered on top of state, without blocking counting.
    if (feedback === 'GOOD FORM' && bodyLineAngle !== null && bodyLineAngle < config.minBodyLineAngle) {
      feedback = 'GOOD FORM'; // keep MVP simple: don't scold on body-line, spec says avoid advanced technique analysis
    }

    return {
      state,
      repCount,
      repJustCompleted,
      feedback,
      elbowAngle,
      bodyDetected: true,
    };
  }

  function getRepCount() {
    return repCount;
  }

  function getState() {
    return state;
  }

  return {
    STATES,
    update,
    reset,
    getRepCount,
    getState,
  };
}
