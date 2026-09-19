/**
 * SettingsManager.js
 * Thin convenience layer over StorageManager for user settings, plus
 * helpers for sound and vibration that respect those settings.
 */
const SettingsManager = (() => {
  let cache = null;

  function get() {
    if (!cache) cache = StorageManager.getSettings();
    return cache;
  }

  function set(partial) {
    cache = { ...get(), ...partial };
    StorageManager.saveSettings(cache);
    return cache;
  }

  function vibrate(pattern) {
    if (!get().vibrationOn) return;
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) { /* not supported, ignore per spec */ }
    }
  }

  // --- Simple beep via Web Audio API, no external audio files ---
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    return audioCtx;
  }

  function playTone(frequency, durationMs, type = 'sine') {
    if (!get().soundOn) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + durationMs / 1000);
    } catch (e) {
      // Web Audio not available/allowed — silently skip, app still works.
    }
  }

  function playRepSound() {
    playTone(880, 90, 'sine');
  }

  function playRecordSound() {
    playTone(660, 120, 'sine');
    setTimeout(() => playTone(990, 180, 'sine'), 130);
  }

  function vibrateRep() {
    vibrate(20); // short, subtle
  }

  function vibrateRecord() {
    vibrate([0, 60, 40, 60]); // longer pattern for a new record
  }

  return {
    get,
    set,
    playRepSound,
    playRecordSound,
    vibrateRep,
    vibrateRecord,
  };
})();
