import React, { useEffect, useMemo, useRef, useState } from 'react';

const TYPES = ['task', 'meal', 'workout', 'note'];

export default function QuickAddModal({ isOpen, onClose, onSubmit }) {
  const [type, setType] = useState('task');
  const [value, setValue] = useState('');
  const [meta, setMeta] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setType('task');
      setValue('');
      setMeta('');
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  const config = useMemo(() => ({
    task: {
      title: 'Quick capture',
      label: 'Task',
      placeholder: 'What needs doing?',
      metaLabel: 'Notes',
      metaPlaceholder: 'Optional note',
    },
    meal: {
      title: 'Quick capture',
      label: 'Meal',
      placeholder: 'What did you eat?',
      metaLabel: 'Tags',
      metaPlaceholder: 'protein, carbs, quick',
    },
    workout: {
      title: 'Quick capture',
      label: 'Workout',
      placeholder: 'Workout name',
      metaLabel: 'Duration',
      metaPlaceholder: '30 min',
    },
    note: {
      title: 'Quick capture',
      label: 'Note',
      placeholder: 'Capture the thought',
      metaLabel: 'Context',
      metaPlaceholder: 'Optional context',
    },
  })[type], [type]);

  if (!isOpen) return null;

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit({ type, value: trimmed, meta: meta.trim() });
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">{config.title}</p>
            <h2>Add without leaving the flow</h2>
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
          <label className="field-stack">
            <span>{config.label}</span>
            <input
              ref={inputRef}
              className="brain-dump-input"
              value={value}
              onChange={event => setValue(event.target.value)}
              placeholder={config.placeholder}
            />
          </label>
          <label className="field-stack">
            <span>{config.metaLabel}</span>
            <input
              className="brain-dump-input"
              value={meta}
              onChange={event => setMeta(event.target.value)}
              placeholder={config.metaPlaceholder}
            />
          </label>
          <button type="submit" className="primary-button full-width">Save {type}</button>
        </form>
      </div>
    </div>
  );
}
