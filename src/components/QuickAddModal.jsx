import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const INITIAL_STATE = {
  title: '',
  note: '',
};

export default function QuickAddModal({ isOpen, onClose, onSubmit }) {
  const [title, setTitle] = useState(INITIAL_STATE.title);
  const [note, setNote] = useState(INITIAL_STATE.note);
  const titleRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setTitle(INITIAL_STATE.title);
      setNote(INITIAL_STATE.note);
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      titleRef.current?.focus();
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

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  function handleSubmit(event) {
    event.preventDefault();

    const resolvedTitle = title.trim();
    const resolvedNote = note.trim();
    if (!resolvedTitle && !resolvedNote) return;

    onSubmit({
      title: resolvedTitle,
      note: resolvedNote,
    });
    onClose();
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card quick-capture-card" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Quick Capture</p>
            <h2>Capture now, organize later</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close quick capture">
            ×
          </button>
        </div>

        <form className="quick-add-form" onSubmit={handleSubmit}>
          <label className="field-stack compact-field">
            <span>Title</span>
            <input
              ref={titleRef}
              className="brain-dump-input quick-capture-input"
              value={title}
              onChange={event => setTitle(event.target.value)}
              placeholder="Type anything to capture…"
            />
          </label>

          <label className="field-stack compact-field">
            <span>Short note</span>
            <textarea
              className="brain-dump-input quick-add-textarea quick-capture-input"
              value={note}
              onChange={event => setNote(event.target.value)}
              placeholder="Optional note"
            />
          </label>

          <button type="submit" className="primary-button full-width">
            Send to Inbox
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
