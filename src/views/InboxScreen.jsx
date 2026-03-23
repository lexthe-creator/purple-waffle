import React, { useState } from 'react';
import { useTaskContext } from '../context/TaskContext.jsx';
import { EmptyState } from '../components/ui/index.js';

const MODULE_OPTIONS = [
  { value: 'task', label: 'Task' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'note', label: 'Note' },
];

function TriageMenu({ item, onAssign, onDelete, onClose }) {
  return (
    <div className="triage-menu" role="menu">
      <p className="triage-menu-heading">Move to</p>
      {MODULE_OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          className="triage-option"
          role="menuitem"
          onClick={() => { onAssign(item.id, opt.value); onClose(); }}
        >
          {opt.label}
        </button>
      ))}
      <hr className="triage-divider" />
      <button
        type="button"
        className="triage-option triage-option-danger"
        role="menuitem"
        onClick={() => { onDelete(item.id); onClose(); }}
      >
        Delete
      </button>
    </div>
  );
}

export default function InboxScreen({ onSwitchToTab }) {
  const { inboxItems, setInboxItems, createInboxItem, createTask, setTasks, createNote, setNotes } = useTaskContext();
  const [captureText, setCaptureText] = useState('');
  const [openMenuId, setOpenMenuId] = useState(null);

  function handleCapture(e) {
    e.preventDefault();
    const text = captureText.trim();
    if (!text) return;
    setInboxItems(current => [createInboxItem({ text }), ...current]);
    setCaptureText('');
  }

  function handleAssign(itemId, module) {
    const item = inboxItems.find(i => i.id === itemId);
    if (!item) return;

    // Promote item into the target module
    if (module === 'task') {
      setTasks(current => [createTask({ title: item.text, status: 'active' }), ...current]);
    } else if (module === 'note') {
      setNotes(current => [createNote({ content: item.text }), ...current]);
    }
    // For 'calendar' and 'fitness' we just remove from inbox and let user create there
    // Mark item as assigned so it's removed from inbox
    setInboxItems(current => current.filter(i => i.id !== itemId));

    // Navigate to target tab for calendar/fitness
    if (module === 'calendar' && onSwitchToTab) onSwitchToTab('calendar');
    if (module === 'fitness' && onSwitchToTab) onSwitchToTab('fitness');
  }

  function handleDelete(itemId) {
    setInboxItems(current => current.filter(i => i.id !== itemId));
  }

  function handleClearAll() {
    setInboxItems([]);
  }

  const pendingItems = inboxItems.filter(i => i.module === null);

  return (
    <div className="tab-stack">
      <section className="inbox-screen">
        <div className="inbox-header-row">
          <div>
            <p className="eyebrow">Inbox</p>
            <h2 className="inbox-title">
              {pendingItems.length === 0 ? 'All clear' : `${pendingItems.length} item${pendingItems.length === 1 ? '' : 's'}`}
            </h2>
          </div>
          {pendingItems.length > 0 && (
            <button type="button" className="ghost-button compact-ghost" onClick={handleClearAll}>
              Clear all
            </button>
          )}
        </div>

        {/* Quick capture */}
        <form className="inbox-capture-form" onSubmit={handleCapture}>
          <input
            className="inbox-capture-input"
            type="text"
            placeholder="Capture a thought, idea, or task…"
            value={captureText}
            onChange={e => setCaptureText(e.target.value)}
            aria-label="Quick capture"
          />
          <button type="submit" className="inbox-capture-submit" aria-label="Add to inbox">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </form>

        {/* Inbox list */}
        {pendingItems.length === 0 ? (
          <EmptyState
            title="Inbox is empty"
            description="Capture ideas, tasks, or anything on your mind. Triage them when ready."
          />
        ) : (
          <div className="inbox-list">
            {pendingItems.map(item => (
              <div key={item.id} className="inbox-item">
                <p className="inbox-item-text">{item.text}</p>
                <div className="inbox-item-actions">
                  <button
                    type="button"
                    className="ghost-button compact-ghost"
                    onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
                    aria-label="Triage options"
                    aria-expanded={openMenuId === item.id}
                  >
                    Move
                  </button>
                  <button
                    type="button"
                    className="ghost-button compact-ghost inbox-delete-btn"
                    onClick={() => handleDelete(item.id)}
                    aria-label="Delete item"
                  >
                    ✕
                  </button>
                </div>
                {openMenuId === item.id && (
                  <TriageMenu
                    item={item}
                    onAssign={handleAssign}
                    onDelete={handleDelete}
                    onClose={() => setOpenMenuId(null)}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Triage hint */}
        {pendingItems.length > 0 && (
          <p className="inbox-hint">Tap "Move" to assign an item to a module, or ✕ to delete.</p>
        )}
      </section>
    </div>
  );
}
