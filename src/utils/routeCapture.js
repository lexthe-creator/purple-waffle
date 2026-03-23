/**
 * Parses free-text input and returns a routing suggestion.
 * @param {string} text
 * @returns {{ type: 'task'|'meal'|'workout'|'note', label: string, preview: string }}
 */
export function routeCapture(text) {
  const lower = text.toLowerCase().trim();

  if (!lower) return { type: 'task', label: 'Task', preview: text };

  // note signals — starts with explicit prefix, or multi-line brain dump
  if (/^(note:|brain dump:|idea:|think about|remember|don't forget)/i.test(lower) || text.includes('\n')) {
    return { type: 'note', label: 'Note', preview: text };
  }

  // workout signals
  if (/\b(run|ran|workout|lift|gym|session|train|training|reps|sets|km|mile|miles|interval|intervals|tempo|jog|jogged|swim|swam|bike|biked|cycling|hiit|crossfit|hyrox|weights|deadlift|squat|bench|press|pull.up|push.up)\b/.test(lower)) {
    return { type: 'workout', label: 'Workout', preview: text };
  }

  // meal signals
  if (/\b(ate|eat|eating|lunch|dinner|breakfast|brunch|snack|meal|food|drink|coffee|tea|protein|carbs|calories|macros|smoothie|shake|bowl|salad|sandwich|wrap|burger|pizza|pasta|rice|chicken|fish|egg|eggs|oat|oats|yogurt|bar|fruit|nuts)\b/.test(lower)) {
    return { type: 'meal', label: 'Meal', preview: text };
  }

  return { type: 'task', label: 'Task', preview: text };
}
