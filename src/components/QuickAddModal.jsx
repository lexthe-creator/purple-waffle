import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { routeCapture } from '../utils/routeCapture.js';

const TYPES = ['task', 'meal', 'workout', 'note'];

const INITIAL_STATE = {
  type: 'task',
  title: '',
  notes: '',
  tags: '',
  duration: '',
  content: '',
};

export default function QuickAddModal({ isOpen, onClose, onSubmit }) {
  const [type, setType] = useState(INITIAL_STATE.type);
  const [title, setTitle] = useState(INITIAL_STATE.title);
  const [notes, setNotes] = useState(INITIAL_STATE.notes);
  const [tags, setTags] = useState(INITIAL_STATE.tags);
  const [duration, setDuration] = useState(INITIAL_STATE.duration);
  const [content, setContent] = useState(INITIAL_STATE.content);
  const [notesOpen, setNotesOpen] = useState(false);

  // Command bar state
  const [commandText, setCommandText] = useState('');

  const commandRef = useRef(null);
  const titleRef = useRef(null);
  const contentRef = useRef(null);

  // Routing suggestion from command bar
  const routeSuggestion = useMemo(
    () => commandText.trim() ? routeCapture(commandText) : null,
    [commandText],
  );

  // Auto-select type from routing suggestion (only when user hasn't manually switched)
  const [manualType, setManualType] = useState(false);
  useEffect(() => {
    if (routeSuggestion && !manualType) {
      setType(routeSuggestion.type);
    }
  }, [routeSuggestion, manualType]);

  useEffect(() => {
    if (!isOpen) {
      setType(INITIAL_STATE.type);
      setTitle(INITIAL_STATE.title);
      setNotes(INITIAL_STATE.notes);
      setTags(INITIAL_STATE.tags);
      setDuration(INITIAL_STATE.duration);
      setContent(INITIAL_STATE.content);
      setNotesOpen(false);
      setCommandText('');
      setManualType(false);
      return undefined;
    }

    setTitle(INITIAL_STATE.title);
    setNotes(INITIAL_STATE.notes);
    setTags(INITIAL_STATE.tags);
    setDuration(INITIAL_STATE.duration);
    setContent(INITIAL_STATE.content);
    setNotesOpen(false);
    setCommandText('');
    setManualType(false);

    const frame = window.requestAnimationFrame(() => {
      commandRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const config = useMemo(() => {
    if (type === 'task') {
      return { placeholder: 'What needs attention?', submitLabel: 'Save task' };
    }
    if (type === 'meal') {
      return { placeholder: 'What did you eat?', submitLabel: 'Save meal' };
    }
    if (type === 'workout') {
      return { placeholder: 'Workout name', submitLabel: 'Save workout' };
    }
    return { placeholder: 'Capture the thought…', submitLabel: 'Save note' };
  }, [type]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  function handleSubmit(event) {
    event.preventDefault();

    // Use commandText as title/content if specific fields are empty
    const resolvedTitle = title.trim() || commandText.trim();
    const resolvedContent = content.trim() || (type === 'note' ? commandText.trim() : '');

    if (type !== 'note' && !resolvedTitle) return;
    if (type === 'note' && !resolvedContent) return;

    onSubmit({
      type,
      title: resolvedTitle,
      notes: notes.trim(),
      tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
      duration: Number.parseInt(duration, 10),
      content: resolvedContent,
    });
    onClose();
  }

  function handleMainKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && type !== 'note') {
      event.preventDefault();
      handleSubmit(event);
    }
  }

  function handleCommandKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  }

  function handleManualTypeSwitch(newType) {
    setType(newType);
    setManualType(true);
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card quick-capture-card" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 'var(--fs-md)' }}>Capture</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close quick add">
            ×
          </button>
        </div>

        {/* Command bar */}
        <div style={{ position: 'relative', marginBottom: '8px' }}>
          <input
            ref={commandRef}
            className="brain-dump-input quick-capture-input"
            value={commandText}
            onChange={event => setCommandText(event.target.value)}
            onKeyDown={handleCommandKeyDown}
            placeholder="Type anything to capture…"
          />
          {routeSuggestion && (
            <span
              className="status-chip is-active"
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', pointerEvents: 'none' }}
            >
              → {routeSuggestion.label}
            </span>
          )}
        </div>

        <form className="quick-add-form" onSubmit={handleSubmit}>
          {type === 'note' ? (
            <textarea
              ref={contentRef}
              className="brain-dump-input quick-add-textarea quick-capture-input"
              value={content}
              onChange={event => setContent(event.target.value)}
              placeholder={config.placeholder}
            />
          ) : (
            <input
              ref={titleRef}
              className="brain-dump-input quick-capture-input"
              value={title}
              onChange={event => setTitle(event.target.value)}
              onKeyDown={handleMainKeyDown}
              placeholder={config.placeholder}
            />
          )}

          {type === 'task' && (
            <div className="inline-collapse">
              <button type="button" className="ghost-button compact-ghost" onClick={() => setNotesOpen(current => !current)}>
                {notesOpen ? 'Hide notes' : 'Add notes'}
              </button>
              {notesOpen && (
                <textarea
                  className="notes-textarea"
                  value={notes}
                  onChange={event => setNotes(event.target.value)}
                  placeholder="Optional notes"
                />
              )}
            </div>
          )}

          {type === 'meal' && (
            <input
              className="brain-dump-input"
              value={tags}
              onChange={event => setTags(event.target.value)}
              placeholder="Tags: protein, carbs, quick…"
            />
          )}

          {type === 'workout' && (
            <input
              className="brain-dump-input"
              type="number"
              min="1"
              value={duration}
              onChange={event => setDuration(event.target.value)}
              placeholder="Duration in minutes"
            />
          )}

          <button type="submit" className="primary-button full-width">
            {config.submitLabel}
          </button>
        </form>

        {/* Type switcher — secondary, below the form */}
        <div className="segmented-control capture-type-switcher" role="tablist" aria-label="Capture type">
          {TYPES.map(item => (
            <button
              key={item}
              type="button"
              className={`segment-button ${item === type ? 'is-active' : ''}`}
              onClick={() => handleManualTypeSwitch(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
