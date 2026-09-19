/**
 * HistoryManager.js
 * Builds display-ready history entries from stored sessions.
 */
const HistoryManager = (() => {
  function relativeDayLabel(dateStr) {
    const today = StorageManager.todayStr();
    const yesterday = StorageManager.todayStr(new Date(Date.now() - 86400000));

    if (dateStr === today) return 'Today';
    if (dateStr === yesterday) return 'Yesterday';

    // e.g. "Sep 16"
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function getFormattedHistory(limit = 50) {
    const sessions = StorageManager.getRecentSessions(limit);
    return sessions.map(s => ({
      label: relativeDayLabel(s.date),
      reps: s.reps,
      timeFormatted: formatDuration(s.durationMs),
      isNewRecord: !!s.isNewRecord,
      timestamp: s.timestamp,
    }));
  }

  function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function recordSession({ reps, durationMs, isNewRecord }) {
    const session = {
      date: StorageManager.todayStr(),
      timestamp: Date.now(),
      reps,
      durationMs,
      isNewRecord,
    };
    return StorageManager.addSession(session);
  }

  return { getFormattedHistory, recordSession, formatDuration };
})();
