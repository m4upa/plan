/**
 * UIManager.js
 * Owns all DOM queries/updates and screen switching. app.js calls into
 * this module rather than touching the DOM directly, keeping the main
 * controller focused on orchestration.
 */
const UIManager = (() => {
  const screens = {}; // name -> element
  let els = {}; // cached element refs

  function init() {
    document.querySelectorAll('[data-screen]').forEach(el => {
      screens[el.dataset.screen] = el;
    });

    els = {
      // Home
      homePersonalBest: document.getElementById('home-personal-best'),
      homeTodayReps: document.getElementById('home-today-reps'),
      homeTotalReps: document.getElementById('home-total-reps'),
      homeSessions: document.getElementById('home-sessions'),
      homeStreak: document.getElementById('home-streak'),
      startBtn: document.getElementById('start-btn'),

      // Camera check
      checkCameraConnected: document.getElementById('check-camera-connected'),
      checkPersonDetected: document.getElementById('check-person-detected'),
      checkBodyVisible: document.getElementById('check-body-visible'),
      checkSideView: document.getElementById('check-side-view'),
      cameraCheckStatus: document.getElementById('camera-check-status'),
      cameraCheckVideo: document.getElementById('camera-check-video'),
      startCountingBtn: document.getElementById('start-counting-btn'),
      cameraCheckBack: document.getElementById('camera-check-back'),

      // Countdown
      countdownNumber: document.getElementById('countdown-number'),

      // Workout
      workoutVideo: document.getElementById('workout-video'),
      workoutOverlay: document.getElementById('workout-overlay'),
      repCount: document.getElementById('rep-count'),
      formFeedback: document.getElementById('form-feedback'),
      pauseBtn: document.getElementById('pause-btn'),
      stopBtn: document.getElementById('stop-btn'),
      workoutTimer: document.getElementById('workout-timer'),
      pauseOverlay: document.getElementById('pause-overlay'),
      resumeBtn: document.getElementById('resume-btn'),

      // Result
      resultReps: document.getElementById('result-reps'),
      resultTime: document.getElementById('result-time'),
      resultBest: document.getElementById('result-best'),
      resultRecordBadge: document.getElementById('result-record-badge'),
      doneBtn: document.getElementById('done-btn'),

      // History
      historyList: document.getElementById('history-list'),
      historyEmpty: document.getElementById('history-empty'),

      // Progress
      statPersonalBest: document.getElementById('stat-personal-best'),
      statTotalReps: document.getElementById('stat-total-reps'),
      statSessions: document.getElementById('stat-sessions'),
      statCurrentStreak: document.getElementById('stat-current-streak'),
      statLongestStreak: document.getElementById('stat-longest-streak'),
      statAverage: document.getElementById('stat-average'),
      progressChart: document.getElementById('progress-chart'),

      // Settings
      settingSound: document.getElementById('setting-sound'),
      settingVibration: document.getElementById('setting-vibration'),
      settingMirror: document.getElementById('setting-mirror'),
      resetDataBtn: document.getElementById('reset-data-btn'),

      // Error / fallback
      errorScreenMessage: document.getElementById('error-screen-message'),
      errorScreenSubtext: document.getElementById('error-screen-subtext'),

      // Nav
      navButtons: document.querySelectorAll('.nav-btn'),
    };
  }

  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
      el.classList.toggle('active', key === name);
    });
    // Update bottom nav active state if this screen has a nav entry
    els.navButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.nav === name);
    });
  }

  function setNavVisible(visible) {
    const nav = document.getElementById('bottom-nav');
    if (nav) nav.style.display = visible ? 'flex' : 'none';
  }

  // ---- Home ----
  function renderHome() {
    const s = StatsManager.getSummary();
    els.homePersonalBest.textContent = s.personalBest;
    els.homeTodayReps.textContent = s.todayReps;
    els.homeTotalReps.textContent = s.totalReps;
    els.homeSessions.textContent = s.sessionCount;
    els.homeStreak.textContent = s.currentStreak;
  }

  // ---- Camera check ----
  function setCameraCheck({ cameraConnected, personDetected, bodyVisible, sideView }) {
    setCheckItem(els.checkCameraConnected, cameraConnected);
    setCheckItem(els.checkPersonDetected, personDetected);
    setCheckItem(els.checkBodyVisible, bodyVisible);
    setCheckItem(els.checkSideView, sideView);

    const allGood = cameraConnected && personDetected && bodyVisible;
    els.startCountingBtn.disabled = !allGood;

    if (allGood) {
      setCameraCheckStatus('READY', 'good');
    } else if (!cameraConnected) {
      setCameraCheckStatus('Waiting for camera…', 'neutral');
    } else if (!personDetected) {
      setCameraCheckStatus('Move into camera view.', 'neutral');
    } else if (!bodyVisible) {
      setCameraCheckStatus('Make sure your whole body is visible.', 'warn');
    } else {
      setCameraCheckStatus('Move further away for a side view.', 'neutral');
    }
  }

  function setCheckItem(el, ok) {
    if (!el) return;
    el.textContent = ok ? '✓' : '○';
    el.classList.toggle('check-ok', !!ok);
  }

  function setCameraCheckStatus(text, mood) {
    if (!els.cameraCheckStatus) return;
    els.cameraCheckStatus.textContent = text;
    els.cameraCheckStatus.className = 'camera-check-status ' + mood;
  }

  // ---- Countdown ----
  function showCountdownValue(value) {
    els.countdownNumber.textContent = value;
    els.countdownNumber.classList.remove('pulse');
    void els.countdownNumber.offsetWidth; // restart animation
    els.countdownNumber.classList.add('pulse');
  }

  // ---- Workout screen ----
  function setRepCount(n, animate) {
    els.repCount.textContent = n;
    if (animate) {
      els.repCount.classList.remove('rep-pop');
      void els.repCount.offsetWidth;
      els.repCount.classList.add('rep-pop');
    }
  }

  function setFormFeedback(text) {
    els.formFeedback.textContent = text;
    els.formFeedback.classList.toggle('feedback-good', text === 'GOOD FORM');
    els.formFeedback.classList.toggle('feedback-warn', text !== 'GOOD FORM');
  }

  function setWorkoutTimer(text) {
    els.workoutTimer.textContent = text;
  }

  function setPauseOverlayVisible(visible) {
    els.pauseOverlay.classList.toggle('visible', visible);
  }

  function getOverlayCanvas() {
    return els.workoutOverlay;
  }

  function getWorkoutVideo() {
    return els.workoutVideo;
  }

  function getCameraCheckVideo() {
    return els.cameraCheckVideo;
  }

  function setVideoMirrored(videoEl, mirrored) {
    videoEl.style.transform = mirrored ? 'scaleX(-1)' : 'none';
  }

  // ---- Result screen ----
  function renderResult({ reps, timeFormatted, personalBest, isNewRecord }) {
    els.resultReps.textContent = reps;
    els.resultTime.textContent = timeFormatted;
    els.resultBest.textContent = personalBest;
    els.resultRecordBadge.style.display = isNewRecord ? 'block' : 'none';
  }

  // ---- History ----
  function renderHistory() {
    const entries = HistoryManager.getFormattedHistory(50);
    els.historyList.innerHTML = '';
    if (entries.length === 0) {
      els.historyEmpty.style.display = 'block';
      return;
    }
    els.historyEmpty.style.display = 'none';

    entries.forEach(e => {
      const row = document.createElement('div');
      row.className = 'history-row';
      row.innerHTML = `
        <div class="history-row-left">
          <div class="history-day">${e.label}${e.isNewRecord ? ' <span class="record-tag">PR</span>' : ''}</div>
          <div class="history-sub">${e.reps} push-ups · ${e.timeFormatted}</div>
        </div>
      `;
      els.historyList.appendChild(row);
    });
  }

  // ---- Progress ----
  function renderProgress() {
    const s = StatsManager.getSummary();
    els.statPersonalBest.textContent = s.personalBest;
    els.statTotalReps.textContent = s.totalReps;
    els.statSessions.textContent = s.sessionCount;
    els.statCurrentStreak.textContent = s.currentStreak;
    els.statLongestStreak.textContent = s.longestStreak;
    els.statAverage.textContent = s.average;

    drawChart(StatsManager.getRecentRepsForChart(7));
  }

  function drawChart(values) {
    const svg = els.progressChart;
    if (!svg) return;
    svg.innerHTML = '';

    const width = 300, height = 140, padding = 20;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    if (values.length === 0) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', width / 2);
      text.setAttribute('y', height / 2);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', '#666');
      text.setAttribute('font-size', '14');
      text.textContent = 'No sessions yet';
      svg.appendChild(text);
      return;
    }

    const max = Math.max(...values, 1);
    const barWidth = (width - padding * 2) / values.length * 0.6;
    const gap = (width - padding * 2) / values.length;

    values.forEach((v, i) => {
      const barHeight = (v / max) * (height - padding * 2);
      const x = padding + i * gap + (gap - barWidth) / 2;
      const y = height - padding - barHeight;

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', barWidth);
      rect.setAttribute('height', Math.max(barHeight, 2));
      rect.setAttribute('rx', 3);
      rect.setAttribute('fill', 'var(--accent)');
      svg.appendChild(rect);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', x + barWidth / 2);
      label.setAttribute('y', height - padding + 14);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', '#888');
      label.setAttribute('font-size', '10');
      label.textContent = v;
      svg.appendChild(label);
    });
  }

  // ---- Settings ----
  function renderSettings() {
    const s = SettingsManager.get();
    els.settingSound.checked = s.soundOn;
    els.settingVibration.checked = s.vibrationOn;
    els.settingMirror.checked = s.cameraMirror;
  }

  // ---- Error / fallback screen ----
  function showErrorScreen(message, subtext) {
    els.errorScreenMessage.textContent = message;
    els.errorScreenSubtext.textContent = subtext || '';
    showScreen('error');
    setNavVisible(false);
  }

  // ---- Skeleton overlay drawing ----
  const CONNECTIONS = [
    ['leftShoulder', 'rightShoulder'],
    ['leftShoulder', 'leftElbow'], ['leftElbow', 'leftWrist'],
    ['rightShoulder', 'rightElbow'], ['rightElbow', 'rightWrist'],
    ['leftShoulder', 'leftHip'], ['rightShoulder', 'rightHip'],
    ['leftHip', 'rightHip'],
    ['leftHip', 'leftKnee'], ['leftKnee', 'leftAnkle'],
    ['rightHip', 'rightKnee'], ['rightKnee', 'rightAnkle'],
  ];

  function drawSkeleton(canvas, landmarks, confidenceThreshold) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!landmarks) return;

    const w = canvas.width, h = canvas.height;

    ctx.strokeStyle = 'rgba(0, 230, 140, 0.85)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    CONNECTIONS.forEach(([a, b]) => {
      const pa = landmarks[a], pb = landmarks[b];
      if (!pa || !pb) return;
      if (pa.visibility < confidenceThreshold || pb.visibility < confidenceThreshold) return;
      ctx.beginPath();
      ctx.moveTo(pa.x * w, pa.y * h);
      ctx.lineTo(pb.x * w, pb.y * h);
      ctx.stroke();
    });

    ctx.fillStyle = 'rgba(0, 230, 140, 0.95)';
    Object.values(landmarks).forEach(p => {
      if (p.visibility < confidenceThreshold) return;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  return {
    init,
    showScreen,
    setNavVisible,
    renderHome,
    setCameraCheck,
    showCountdownValue,
    setRepCount,
    setFormFeedback,
    setWorkoutTimer,
    setPauseOverlayVisible,
    getOverlayCanvas,
    getWorkoutVideo,
    getCameraCheckVideo,
    setVideoMirrored,
    renderResult,
    renderHistory,
    renderProgress,
    renderSettings,
    showErrorScreen,
    drawSkeleton,
    els: () => els,
  };
})();
