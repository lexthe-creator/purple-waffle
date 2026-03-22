import React from 'react';

/**
 * EmptyState — icon + title + description + optional action.
 *
 * @param {React.Node}  [icon]        — SVG or emoji illustration
 * @param {string}      title         — primary empty message
 * @param {string}      [description] — supporting hint text
 * @param {React.Node}  [action]      — optional CTA button/link
 */
export default function EmptyState({ icon, title, description, action }) {
  return (
    <div className="ui-empty">
      {icon        && <div className="ui-empty__icon">{icon}</div>}
      {title       && <h3 className="ui-empty__title">{title}</h3>}
      {description && <p  className="ui-empty__desc">{description}</p>}
      {action}
    </div>
  );
}
