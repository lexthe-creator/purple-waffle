const PRE_EVENT_WINDOW_MS = 20 * 60 * 1000; // 20 minutes

/**
 * Resolve the current flow mode given a list of calendar events and the current time.
 *
 * @param {Array<{startTime: number, endTime: number, title: string}>} events
 * @param {Date} now
 * @returns {{ mode: 'flow' | 'event' | 'pre-event', event: object | null }}
 */
export function resolveMode(events = [], now = new Date()) {
  const nowMs = now.getTime();

  for (const event of events) {
    const start = event.startTime;
    const end = event.endTime;
    if (nowMs >= start && nowMs < end) {
      return { mode: 'event', event };
    }
  }

  for (const event of events) {
    const start = event.startTime;
    if (start > nowMs && start - nowMs <= PRE_EVENT_WINDOW_MS) {
      return { mode: 'pre-event', event };
    }
  }

  return { mode: 'flow', event: null };
}

/**
 * Find the next upcoming event after now.
 *
 * @param {Array<{startTime: number, endTime: number, title: string}>} events
 * @param {Date} now
 * @returns {object | null}
 */
export function getNextEvent(events = [], now = new Date()) {
  const nowMs = now.getTime();
  const upcoming = events
    .filter(e => e.startTime > nowMs)
    .sort((a, b) => a.startTime - b.startTime);
  return upcoming[0] ?? null;
}

/**
 * Convert calendarCache entries (existing app format) to the flow engine event format.
 * Each cache entry has { startHour, startMin, endHour, endMin, title, id }.
 *
 * @param {Array} cacheEvents  - events from calendarCache[dateKey]
 * @param {string} dateKey     - "YYYY-MM-DD"
 * @returns {Array<{startTime, endTime, title, id}>}
 */
export function normalizeCalendarEvents(cacheEvents = [], dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return cacheEvents
    .filter(e => e.startHour != null)
    .map(e => {
      const start = new Date(year, month - 1, day, e.startHour, e.startMin ?? 0).getTime();
      const endHour = e.endHour ?? e.startHour + 1;
      const end = new Date(year, month - 1, day, endHour, e.endMin ?? 0).getTime();
      return { id: e.id, title: e.title ?? 'Event', startTime: start, endTime: end };
    });
}
