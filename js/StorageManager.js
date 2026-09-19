/**
 * StorageManager.js
 * Single source of truth for reading/writing localStorage.
 * No other module should touch localStorage directly.
 */
const StorageManager = (() => {
  const KEYS = {
    SESSIONS: 'pushup_sessions',       // array of session records
    PERSONAL_BEST: 'pushup_personal_best',
    TOTAL_REPS: 'pushup_total_reps',
    STREAK_CURRENT: 'pushup_streak_current',
    STREAK_LONGEST: 'pushup_streak_longest',
    LAST_SESSION_DATE: 'pushup_last_session_date', // yyyy-mm-dd of last day a session happened
    SETTINGS: 'pushup_settings',
  };

  function safeGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('StorageManager: failed to read', key, e);
      return fallback;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('StorageManager: failed to write', key, e);
      return false;
    }
  }

  function todayStr(date = new Date()) {
    // Local date, not UTC, so streaks match the user's day.
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function daysBetween(dateStrA, dateStrB) {
    const a = new Date(dateStrA + 'T00:00:00');
    const b = new Date(dateStrB + 'T00:00:00');
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((b - a) / msPerDay);
  }

  // ---- Sessions ----
  function getSessions() {
    return safeGet(KEYS.SESSIONS, []);
  }

  function addSession(session) {
    // session: { date: 'yyyy-mm-dd', timestamp, reps, durationMs, isNewRecord }
    const sessions = getSessions();
    sessions.unshift(session); // newest first
    // Cap history to something reasonable so localStorage doesn't grow forever
    const capped = sessions.slice(0, 200);
    safeSet(KEYS.SESSIONS, capped);
    return capped;
  }

  function getRecentSessions(count) {
    return getSessions().slice(0, count);
  }

  // ---- Personal best ----
  function getPersonalBest() {
    return safeGet(KEYS.PERSONAL_BEST, 0);
  }

  function setPersonalBestIfHigher(reps) {
    const current = getPersonalBest();
    if (reps > current) {
      safeSet(KEYS.PERSONAL_BEST, reps);
      return { updated: true, previous: current, newBest: reps };
    }
    return { updated: false, previous: current, newBest: current };
  }

  // ---- Totals ----
  function getTotalReps() {
    return safeGet(KEYS.TOTAL_REPS, 0);
  }

  function addToTotalReps(reps) {
    const total = getTotalReps() + reps;
    safeSet(KEYS.TOTAL_REPS, total);
    return total;
  }

  function getSessionCount() {
    return getSessions().length;
  }

  // ---- Streak ----
  function getStreak() {
    return {
      current: safeGet(KEYS.STREAK_CURRENT, 0),
      longest: safeGet(KEYS.STREAK_LONGEST, 0),
    };
  }

  /**
   * Call once per completed session (with at least 1 rep).
   * Ensures multiple sessions in the same day do not multiply the streak.
   */
  function registerStreakForToday() {
    const today = todayStr();
    const lastDate = safeGet(KEYS.LAST_SESSION_DATE, null);
    let current = safeGet(KEYS.STREAK_CURRENT, 0);
    let longest = safeGet(KEYS.STREAK_LONGEST, 0);

    if (lastDate === today) {
      // Already counted today; no change.
    } else if (lastDate === null) {
      current = 1;
    } else {
      const gap = daysBetween(lastDate, today);
      if (gap === 1) {
        current += 1;
      } else {
        current = 1; // missed a day (or more) -> reset
      }
    }

    if (current > longest) longest = current;

    safeSet(KEYS.STREAK_CURRENT, current);
    safeSet(KEYS.STREAK_LONGEST, longest);
    safeSet(KEYS.LAST_SESSION_DATE, today);

    return { current, longest };
  }

  // ---- Settings ----
  function getSettings() {
    return safeGet(KEYS.SETTINGS, {
      soundOn: true,
      vibrationOn: true,
      cameraMirror: true,
    });
  }

  function saveSettings(settings) {
    safeSet(KEYS.SETTINGS, settings);
  }

  // ---- Reset ----
  function resetAll() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  }

  return {
    getSessions,
    addSession,
    getRecentSessions,
    getPersonalBest,
    setPersonalBestIfHigher,
    getTotalReps,
    addToTotalReps,
    getSessionCount,
    getStreak,
    registerStreakForToday,
    getSettings,
    saveSettings,
    resetAll,
    todayStr,
  };
})();
