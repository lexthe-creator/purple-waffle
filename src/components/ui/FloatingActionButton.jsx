import React from 'react';

/**
 * FloatingActionButton — anchored above the bottom nav.
 *
 * Renders icon-only when no `label` is provided, extended pill when label exists.
 *
 * @param {React.Node}  icon       — icon element or character (e.g. "+")
 * @param {string}      [label]    — optional text label (extended FAB)
 * @param {function}    onClick
 * @param {string}      [className]
 */
export default function FloatingActionButton({ icon, label, onClick, className = '' }) {
  return (
    <button
      type="button"
      className={['ui-fab', !label && 'ui-fab--icon-only', className].filter(Boolean).join(' ')}
      onClick={onClick}
      aria-label={label || undefined}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}
