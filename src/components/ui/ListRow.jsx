import React from 'react';

/**
 * ListRow — icon/leading + label + sub-label + trailing slot.
 *
 * Renders as a `<button>` when `onClick` is provided, otherwise a `<div>`.
 * Add `variant="card"` for the feed-card look (surface bg, border-radius).
 *
 * @param {React.Node}  [leading]   — left slot (icon, avatar, indicator)
 * @param {string}      label       — primary text
 * @param {string}      [sub]       — secondary/meta text
 * @param {React.Node}  [trailing]  — right slot (badge, chevron, action)
 * @param {'default'|'card'} [variant]
 * @param {function}    [onClick]   — makes row interactive
 */
export default function ListRow({ leading, label, sub, trailing, onClick, variant = 'default', className = '' }) {
  const Tag = onClick ? 'button' : 'div';
  const cls = [
    'ui-list-row',
    variant === 'card' && 'ui-list-row--card',
    onClick && 'ui-list-row--interactive',
    className,
  ].filter(Boolean).join(' ');

  return (
    <Tag
      className={cls}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
    >
      {leading  && <div className="ui-list-row__leading">{leading}</div>}
      <div className="ui-list-row__body">
        <p className="ui-list-row__label">{label}</p>
        {sub && <p className="ui-list-row__sub">{sub}</p>}
      </div>
      {trailing && <div className="ui-list-row__trailing">{trailing}</div>}
    </Tag>
  );
}
