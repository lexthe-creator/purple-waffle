import React, { useState } from 'react';

function Chevron() {
  return (
    <svg
      className="ui-expandable__chevron"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/**
 * ExpandablePanel — collapsible section with single shared interaction pattern.
 *
 * The header slot accepts any node (plain text, SectionHeader, a row with badges, etc.).
 * Open/close uses the CSS grid-template-rows trick — no JS height calculation.
 *
 * @param {React.Node}  header       — always-visible trigger content
 * @param {React.Node}  children     — collapsible body content
 * @param {boolean}     [defaultOpen] — initial open state (default: false)
 * @param {string}      [className]
 */
export default function ExpandablePanel({ header, children, defaultOpen = false, className = '' }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`ui-expandable ${className}`}>
      <button
        type="button"
        className="ui-expandable__trigger"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span className="ui-expandable__header-content">{header}</span>
        <Chevron />
      </button>
      <div className={`ui-expandable__body${open ? ' is-open' : ''}`}>
        <div className="ui-expandable__inner">
          {children}
        </div>
      </div>
    </div>
  );
}
