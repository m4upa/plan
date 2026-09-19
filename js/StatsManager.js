/**
 * StatsManager.js
 * Computes aggregate stats for the Home and Progress screens.
 */
const StatsManager = (() => {
  function getTodayReps() {
    const today = StorageManager.todayStr();
    return StorageManager.getSessions()
      .filter(s => s.date === today)
      .reduce((sum, s) => sum + s.reps, 0);
  }

  function getSummary() {
    const sessions = StorageManager.getSessions();
    const streak = StorageManager.getStreak();
    const totalReps = StorageManager.getTotalReps();
    const sessionCount = sessions.length;
    const average = sessionCount > 0 ? Math.round(totalReps / sessionCount) : 0;

    return {
      personalBest: StorageManager.getPersonalBest(),
      todayReps: getTodayReps(),
      totalReps,
      sessionCount,
      currentStreak: streak.current,
      longestStreak: streak.longest,
      average,
    };
  }

  /**
   * Returns up to `count` most recent sessions' rep numbers, oldest to
   * newest, for a simple bar chart. Pads nothing — chart renderer handles
   * fewer-than-count data points.
   */
  function getRecentRepsForChart(count = 7) {
    const sessions = StorageManager.getRecentSessions(count);
    return sessions.map(s => s.reps).reverse(); // oldest -> newest for left-to-right chart
  }

  return { getSummary, getRecentRepsForChart, getTodayReps };
})();
