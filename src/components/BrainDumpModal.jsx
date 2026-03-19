import React, { useEffect, useRef, useState } from 'react';

export default function BrainDumpModal({ C, S, onClose, onSave }) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit() {
    const value = text.trim();
    if (!value) return;
    onSave(value);
    setText('');
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: C.scrim, zIndex: 700, display: 'flex', alignItems: 'flex-end' }}
      onClick={onClose}
    >
      <div
        style={{ background: C.card, borderRadius: '20px 20px 0 0', padding: '20px 16px 32px', width: '100%', maxWidth: 430, margin: '0 auto' }}
        onClick={event => event.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.tx }}>Brain Dump</div>
            <div style={{ fontSize: 11, color: C.muted }}>Capture it fast. Sort it later.</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close brain dump"
            style={{ width: 32, height: 32, borderRadius: 10, border: `1.5px solid ${C.bd}`, background: 'transparent', color: C.tx, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ×
          </button>
        </div>

        <input
          ref={inputRef}
          value={text}
          onChange={event => setText(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Dump it…"
          style={{ ...S.inp, margin: 0 }}
        />
      </div>
    </div>
  );
}
