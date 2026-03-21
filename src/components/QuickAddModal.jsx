import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
  const titleRef = useRef(null);
  const contentRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setType(INITIAL_STATE.type);
      setTitle(INITIAL_STATE.title);
      setNotes(INITIAL_STATE.notes);
      setTags(INITIAL_STATE.tags);
      setDuration(INITIAL_STATE.duration);
      setContent(INITIAL_STATE.content);
      setNotesOpen(false);
      return undefined;
    }

    setTitle(INITIAL_STATE.title);
    setNotes(INITIAL_STATE.notes);
    setTags(INITIAL_STATE.tags);
    setDuration(INITIAL_STATE.duration);
    setContent(INITIAL_STATE.content);
    setNotesOpen(false);

    const frame = window.requestAnimationFrame(() => {
      const focusTarget = type === 'note' ? contentRef.current : titleRef.current;
      focusTarget?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, type]);

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
      return {
        title: 'Quick capture',
        label: 'Task name',
        placeholder: 'What needs attention?',
        submitLabel: 'Save task',
      };
    }

    if (type === 'meal') {
      return {
        title: 'Quick capture',
        label: 'Meal name',
        placeholder: 'What did you eat?',
        submitLabel: 'Save meal',
      };
    }

    if (type === 'workout') {
      return {
        title: 'Quick capture',
        label: 'Workout name',
        placeholder: 'Workout name',
        submitLabel: 'Save workout',
      };
    }

    return {
      title: 'Quick capture',
      label: 'Note',
      placeholder: 'Capture the thought',
      submitLabel: 'Save note',
    };
  }, [type]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  function handleSubmit(event) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();

    if (type !== 'note' && !trimmedTitle) return;
    if (type === 'note' && !trimmedContent) return;

    onSubmit({
      type,
      title: trimmedTitle,
      notes: notes.trim(),
      tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
      duration: Number.parseInt(duration, 10),
      content: trimmedContent,
    });
    onClose();
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">{config.title}</p>
            <h2>Capture without leaving the screen</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close quick add">
            ×
          </button>
        </div>

        <div className="segmented-control" role="tablist" aria-label="Capture type">
          {TYPES.map(item => (
            <button
              key={item}
              type="button"
              className={`segment-button ${item === type ? 'is-active' : ''}`}
              onClick={() => setType(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <form className="quick-add-form" onSubmit={handleSubmit}>
          {type === 'note' ? (
            <label className="field-stack">
              <span>{config.label}</span>
              <textarea
                ref={contentRef}
                className="brain-dump-input quick-add-textarea"
                value={content}
                onChange={event => setContent(event.target.value)}
                placeholder={config.placeholder}
              />
            </label>
          ) : (
            <label className="field-stack">
              <span>{config.label}</span>
              <input
                ref={titleRef}
                className="brain-dump-input"
                value={title}
                onChange={event => setTitle(event.target.value)}
                placeholder={config.placeholder}
              />
            </label>
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
            <label className="field-stack">
              <span>Quick tags</span>
              <input
                className="brain-dump-input"
                value={tags}
                onChange={event => setTags(event.target.value)}
                placeholder="protein, carbs, quick"
              />
            </label>
          )}

          {type === 'workout' && (
            <label className="field-stack">
              <span>Minutes</span>
              <input
                className="brain-dump-input"
                type="number"
                min="1"
                value={duration}
                onChange={event => setDuration(event.target.value)}
                placeholder="30"
              />
            </label>
          )}

          <button type="submit" className="primary-button full-width">
            {config.submitLabel}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
