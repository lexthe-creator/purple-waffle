import React, { useEffect, useRef, useState } from 'react';

export default function BrainDumpModal({ isOpen, initialValue = '', onChange, onClose, onSubmit }) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setValue(initialValue);
      return;
    }

    setValue(initialValue);

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [initialValue, isOpen]);

  if (!isOpen) return null;

  function handleChange(nextValue) {
    setValue(nextValue);
    onChange?.(nextValue);
  }

  function commit() {
    const nextValue = value.trim();
    if (!nextValue) return;
    onSubmit(nextValue);
    handleChange('');
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Brain Dump</p>
            <h2>Capture it fast</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close brain dump">
            ×
          </button>
        </div>
        <form
          onSubmit={event => {
            event.preventDefault();
            commit();
          }}
        >
          <input
            ref={inputRef}
            value={value}
            onChange={event => handleChange(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
              }
            }}
            placeholder="What needs capturing?"
            className="brain-dump-input"
            aria-label="Brain dump input"
          />
        </form>
        <p className="hint-text">Press Enter to send it to Inbox. Press Esc to close.</p>
      </div>
    </div>
  );
}
