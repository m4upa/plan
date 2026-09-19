/**
 * app.js
 * Main controller. Wires together CameraManager, PoseDetector,
 * PushUpDetector, WorkoutSession, StorageManager-based managers, and
 * UIManager. Owns the requestAnimationFrame analysis loop.
 *
 * Flow: pose data -> calculate angles -> detect body position ->
 * state machine -> valid repetition -> increment counter -> update UI
 * -> save session.
 */
(function () {
  let pushUpDetector = null;
  let workoutSession = null;

  let analysisLoopId = null;
  let lastAnalysisTime = 0;
  const analysisIntervalMs = 1000 / PUSHUP_CONFIG.targetAnalysisFps;

  let timerIntervalId = null;

  let cameraCheckLoopId = null;
  let cameraCheckStableFrames = 0;
  const CAMERA_CHECK_STABLE_FRAMES_NEEDED = 10;

  let poseDetectorReady = false;
  let poseDetectorSupported = false;

  // ---------------- Boot ----------------
  async function boot() {
    UIManager.init();
    UIManager.renderHome();
    bindEvents();
    runEnvironmentDiagnostics();

    // Try to initialize the pose model early (in background) so the
    // camera-check screen doesn't stall later. If it fails, we don't
    // show an error yet — only when the user actually tries to start,
    // per spec (don't block home screen on this).
    poseDetectorReady = await PoseDetector.init().catch(() => false);
    poseDetectorSupported = PoseDetector.isSupported();

    UIManager.showScreen('home');
  }

  /**
   * Logs a clear, one-time diagnostic to the console on every launch so
   * that when the camera doesn't work, the cause is visible immediately
   * via remote debugging (chrome://inspect) instead of requiring trial
   * and error. This never blocks or alters the UI — home screen always
   * renders regardless of what this finds.
   */
  function runEnvironmentDiagnostics() {
    const hasMediaDevices = !!navigator.mediaDevices;
    const hasGetUserMedia = hasMediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
    const secure = window.isSecureContext;

    console.log('%c[Push-Up Counter] Environment check', 'font-weight:bold');
    console.log('  location:', location.href);
    console.log('  protocol:', location.protocol);
    console.log('  isSecureContext:', secure);
    console.log('  navigator.mediaDevices present:', hasMediaDevices);
    console.log('  getUserMedia function present:', hasGetUserMedia);
    console.log('  userAgent:', navigator.userAgent);

    if (!hasGetUserMedia || !secure) {
      console.warn(
        '[Push-Up Counter] Camera API is NOT available in this WebView build. ' +
        'The Android permission dialog will never appear because the call ' +
        'never reaches the OS — the WebView wrapper is blocking or omitting ' +
        'getUserMedia support (missing WebChromeClient.onPermissionRequest ' +
        'handling and/or the android.permission.CAMERA manifest entry, or ' +
        'the page is not treated as a secure origin). This must be fixed in ' +
        'the app-packaging tool (e.g. html2app.dev), not in this JS/HTML code.'
      );
    }
  }

  function bindEvents() {
    const els = UIManager.els();

    els.startBtn.addEventListener('click', onStartPressed);
    els.startCountingBtn.addEventListener('click', onStartCountingPressed);
    els.cameraCheckBack.addEventListener('click', () => {
      CameraManager.stop();
      UIManager.showScreen('home');
    });

    els.pauseBtn.addEventListener('click', onPausePressed);
    els.resumeBtn.addEventListener('click', onResumePressed);
    els.stopBtn.addEventListener('click', onStopPressed);
    els.doneBtn.addEventListener('click', onDonePressed);

    els.settingSound.addEventListener('change', (e) => {
      SettingsManager.set({ soundOn: e.target.checked });
    });
    els.settingVibration.addEventListener('change', (e) => {
      SettingsManager.set({ vibrationOn: e.target.checked });
    });
    els.settingMirror.addEventListener('change', (e) => {
      SettingsManager.set({ cameraMirror: e.target.checked });
      UIManager.setVideoMirrored(UIManager.getWorkoutVideo(), e.target.checked);
      UIManager.setVideoMirrored(UIManager.getCameraCheckVideo(), e.target.checked);
    });
    els.resetDataBtn.addEventListener('click', onResetData);

    els.navButtons.forEach(btn => {
      btn.addEventListener('click', () => onNavClick(btn.dataset.nav));
    });
  }

  function onNavClick(screenName) {
    if (screenName === 'home') UIManager.renderHome();
    if (screenName === 'history') UIManager.renderHistory();
    if (screenName === 'progress') UIManager.renderProgress();
    if (screenName === 'settings') UIManager.renderSettings();
    UIManager.showScreen(screenName);
  }

  // ---------------- Start flow ----------------
  async function onStartPressed() {
    if (!poseDetectorSupported) {
      UIManager.showErrorScreen(
        'Automatic detection is not supported on this device.',
        'Please use a compatible Android device/browser.'
      );
      return;
    }

    UIManager.showScreen('cameraCheck');
    UIManager.setNavVisible(false);
    UIManager.setCameraCheck({ cameraConnected: false, personDetected: false, bodyVisible: false, sideView: false });

    const videoEl = UIManager.getCameraCheckVideo();
    const mirrored = SettingsManager.get().cameraMirror;
    UIManager.setVideoMirrored(videoEl, mirrored);

    try {
      await CameraManager.start(videoEl, { facingMode: 'environment' });
    } catch (err) {
      handleCameraError(err);
      return;
    }

    UIManager.setCameraCheck({ cameraConnected: true, personDetected: false, bodyVisible: false, sideView: false });
    startCameraCheckLoop(videoEl);
  }

  function handleCameraError(err) {
    const msg = err && err.message ? err.message : 'UNKNOWN';
    if (msg === 'PERMISSION_DENIED') {
      UIManager.showErrorScreen(
        'CAMERA ACCESS REQUIRED',
        'Allow camera access in Android settings to count push-ups automatically.'
      );
    } else if (msg === 'NO_CAMERA') {
      UIManager.showErrorScreen(
        'No camera found.',
        'This device does not have a usable camera.'
      );
    } else if (msg === 'CAMERA_IN_USE') {
      UIManager.showErrorScreen(
        'Camera is in use by another app.',
        'Close other apps that might be using the camera, then try again.'
      );
    } else if (msg === 'INSECURE_CONTEXT') {
      UIManager.showErrorScreen(
        'Camera access is blocked in this app build.',
        'The camera API only works over a secure page (https or a WebView trusted origin). Check the packaging settings in html2app.dev.'
      );
    } else if (msg === 'UNSUPPORTED') {
      UIManager.showErrorScreen(
        'Automatic detection is not supported on this device.',
        'Please use a compatible Android device/browser.'
      );
    } else {
      UIManager.showErrorScreen(
        'Could not access the camera.',
        'Please check camera permissions and try again.'
      );
    }
  }

  function startCameraCheckLoop(videoEl) {
    cameraCheckStableFrames = 0;
    let lastCheckTime = 0;

    function loop(ts) {
      if (!CameraManager.isActive()) return;

      if (ts - lastCheckTime >= analysisIntervalMs) {
        lastCheckTime = ts;
        const landmarks = PoseDetector.detect(videoEl, Math.floor(ts));
        evaluateCameraCheck(landmarks);
      }
      cameraCheckLoopId = requestAnimationFrame(loop);
    }
    cameraCheckLoopId = requestAnimationFrame(loop);
  }

  function stopCameraCheckLoop() {
    if (cameraCheckLoopId) {
      cancelAnimationFrame(cameraCheckLoopId);
      cameraCheckLoopId = null;
    }
  }

  function evaluateCameraCheck(landmarks) {
    const personDetected = !!landmarks;
    let bodyVisible = false;
    let sideView = false;

    if (landmarks) {
      const requiredPoints = PUSHUP_CONFIG.requiredLandmarks;
      const leftOk = ['leftShoulder', 'leftElbow', 'leftWrist', 'leftHip']
        .every(k => landmarks[k] && landmarks[k].visibility >= PUSHUP_CONFIG.confidenceThreshold);
      const rightOk = ['rightShoulder', 'rightElbow', 'rightWrist', 'rightHip']
        .every(k => landmarks[k] && landmarks[k].visibility >= PUSHUP_CONFIG.confidenceThreshold);
      bodyVisible = leftOk || rightOk;
      sideView = bodyVisible; // simplified: treat one-side visibility as side-view achieved
    }

    if (bodyVisible) {
      cameraCheckStableFrames++;
    } else {
      cameraCheckStableFrames = 0;
    }

    const stable = cameraCheckStableFrames >= CAMERA_CHECK_STABLE_FRAMES_NEEDED;

    UIManager.setCameraCheck({
      cameraConnected: true,
      personDetected,
      bodyVisible: stable,
      sideView: stable,
    });
  }

  function onStartCountingPressed() {
    stopCameraCheckLoop();
    runCountdownThenStart();
  }

  function runCountdownThenStart() {
    UIManager.showScreen('countdown');
    const sequence = ['3', '2', '1', 'GO'];
    let i = 0;

    UIManager.showCountdownValue(sequence[i]);
    const interval = setInterval(() => {
      i++;
      if (i >= sequence.length) {
        clearInterval(interval);
        beginWorkout();
        return;
      }
      UIManager.showCountdownValue(sequence[i]);
    }, 800);
  }

  // ---------------- Workout ----------------
  async function beginWorkout() {
    const videoEl = UIManager.getWorkoutVideo();
    const mirrored = SettingsManager.get().cameraMirror;
    UIManager.setVideoMirrored(videoEl, mirrored);

    try {
      const dims = await CameraManager.start(videoEl, { facingMode: 'environment' });
      const canvas = UIManager.getOverlayCanvas();
      canvas.width = dims.width || videoEl.videoWidth || 640;
      canvas.height = dims.height || videoEl.videoHeight || 480;
    } catch (err) {
      handleCameraError(err);
      return;
    }

    pushUpDetector = createPushUpDetector(PUSHUP_CONFIG);
    pushUpDetector.reset();

    workoutSession = createWorkoutSession();
    workoutSession.start();

    UIManager.setRepCount(0, false);
    UIManager.setFormFeedback('GOOD FORM');
    UIManager.setPauseOverlayVisible(false);
    UIManager.showScreen('workout');
    UIManager.setNavVisible(false);

    startAnalysisLoop(videoEl);
    startTimerDisplay();
  }

  function startAnalysisLoop(videoEl) {
    lastAnalysisTime = 0;

    function loop(ts) {
      if (!CameraManager.isActive() || !workoutSession || !workoutSession.isActive) {
        return;
      }

      if (!workoutSession.isPaused && ts - lastAnalysisTime >= analysisIntervalMs) {
        lastAnalysisTime = ts;
        analyzeFrame(videoEl, ts);
      }

      analysisLoopId = requestAnimationFrame(loop);
    }
    analysisLoopId = requestAnimationFrame(loop);
  }

  function stopAnalysisLoop() {
    if (analysisLoopId) {
      cancelAnimationFrame(analysisLoopId);
      analysisLoopId = null;
    }
  }

  function analyzeFrame(videoEl, ts) {
    const landmarks = PoseDetector.detect(videoEl, Math.floor(ts));
    const canvas = UIManager.getOverlayCanvas();
    UIManager.drawSkeleton(canvas, landmarks, PUSHUP_CONFIG.confidenceThreshold);

    const result = pushUpDetector.update(landmarks, ts);

    UIManager.setFormFeedback(result.feedback);

    if (result.repJustCompleted) {
      UIManager.setRepCount(result.repCount, true);
      SettingsManager.playRepSound();
      SettingsManager.vibrateRep();
    }
  }

  function startTimerDisplay() {
    if (timerIntervalId) clearInterval(timerIntervalId);
    timerIntervalId = setInterval(() => {
      if (!workoutSession || !workoutSession.isActive) return;
      const ms = workoutSession.elapsedMs();
      UIManager.setWorkoutTimer(workoutSession.formatTime(ms));
    }, 250);
  }

  function stopTimerDisplay() {
    if (timerIntervalId) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
  }

  function onPausePressed() {
    if (!workoutSession || !workoutSession.isActive) return;
    workoutSession.pause();
    UIManager.setPauseOverlayVisible(true);
  }

  function onResumePressed() {
    if (!workoutSession || !workoutSession.isActive) return;
    workoutSession.resume();
    UIManager.setPauseOverlayVisible(false);
  }

  function onStopPressed() {
    finishWorkout();
  }

  function finishWorkout() {
    if (!workoutSession) return;

    const reps = pushUpDetector ? pushUpDetector.getRepCount() : 0;
    const durationMs = workoutSession.elapsedMs();

    workoutSession.stop();
    stopAnalysisLoop();
    stopTimerDisplay();
    CameraManager.stop();

    const bestResult = StorageManager.setPersonalBestIfHigher(reps);

    if (reps > 0) {
      HistoryManager.recordSession({ reps, durationMs, isNewRecord: bestResult.updated });
      StorageManager.addToTotalReps(reps);
      StorageManager.registerStreakForToday();

      if (bestResult.updated) {
        SettingsManager.playRecordSound();
        SettingsManager.vibrateRecord();
      }
    }

    UIManager.renderResult({
      reps,
      timeFormatted: workoutSession.formatTime(durationMs),
      personalBest: StorageManager.getPersonalBest(),
      isNewRecord: bestResult.updated && reps > 0,
    });

    UIManager.showScreen('result');
  }

  function onDonePressed() {
    UIManager.setNavVisible(true);
    UIManager.renderHome();
    UIManager.showScreen('home');
  }

  function onResetData() {
    const confirmed = window.confirm('This will erase all history, records, and settings. Continue?');
    if (!confirmed) return;
    StorageManager.resetAll();
    UIManager.renderHome();
    UIManager.renderSettings();
    UIManager.showScreen('home');
    UIManager.setNavVisible(true);
  }

  // ---------------- Go ----------------
  document.addEventListener('DOMContentLoaded', boot);
})();
