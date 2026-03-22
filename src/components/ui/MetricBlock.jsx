import React from 'react';

/**
 * MetricBlock — a single metric tile: value + label + optional trend.
 *
 * Use inside a `.ui-metrics-row` div to lay out multiple metrics in a row.
 *
 * @param {string|number} value     — the primary number/value
 * @param {string}        label     — small description below value
 * @param {string|number} [trend]   — optional trend text (e.g. "+2 vs last week")
 * @param {'up'|'down'}   [trendDir] — controls trend colour (up = green, down = red)
 */
export default function MetricBlock({ value, label, trend, trendDir }) {
  return (
    <div className="ui-metric">
      <p className="ui-metric__label">{label}</p>
      <p className="ui-metric__value">{value ?? '—'}</p>
      {trend !== undefined && (
        <p className={`ui-metric__trend${trendDir === 'down' ? ' ui-metric__trend--down' : ''}`}>
          {trend}
        </p>
      )}
    </div>
  );
}
