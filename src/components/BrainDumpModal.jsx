import React, { useEffect, useRef, useState } from 'react';

export default function BrainDumpModal({ C, S, onClose, onSave }) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit() {
    const nextText = text.trim();
    if (!nextText) return;
    onSave(nextText);
    setText('');
    onClose();
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: C.scrim, zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ ...S.card, width: '100%', maxWidth: 420, padding: '18px 16px' }}
        onClick={event => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={text}
          onChange={event => setText(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Escape') onClose();
            if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Dump it..."
          style={{ ...S.inp, margin: 0, fontSize: 15 }}
          aria-label="Brain dump"
        />
      </div>
    </div>
  );
}
