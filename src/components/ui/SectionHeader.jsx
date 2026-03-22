import React from 'react';

/**
 * SectionHeader — eyebrow label + heading + optional trailing action.
 *
 * @param {string}      eyebrow  — small caps label above title
 * @param {string}      title    — main heading
 * @param {React.Node}  action   — optional trailing slot (button, badge, etc.)
 */
export default function SectionHeader({ eyebrow, title, action }) {
  return (
    <div className="ui-section-header">
      <div>
        {eyebrow && <p className="ui-section-header__eyebrow">{eyebrow}</p>}
        {title   && <h2 className="ui-section-header__title">{title}</h2>}
      </div>
      {action && <div className="ui-section-header__action">{action}</div>}
    </div>
  );
}
