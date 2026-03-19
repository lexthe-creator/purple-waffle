import React, { useState } from 'react';

const TYPES = [
  { id: 'task', label: 'Task', icon: '✓' },
  { id: 'meal', label: 'Meal', icon: '◉' },
  { id: 'workout', label: 'Workout', icon: '⚡' },
  { id: 'note', label: 'Note', icon: '✏' },
];

const MEAL_TAGS = ['Protein', 'Carbs', 'Fat', 'Veg', 'Fruit', 'Snack'];
const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function QuickAddModal({ C, S, initialType = null, onClose, onSaveTask, onSaveMeal, onSaveNote }) {
  const [type, setType] = useState(initialType);
  // Task
  const [taskText, setTaskText] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [taskNotes, setTaskNotes] = useState('');
  const [subtasks, setSubtasks] = useState([]);
  // Meal
  const [mealName, setMealName] = useState('');
  const [mealSlot, setMealSlot] = useState('lunch');
  const [mealTags, setMealTags] = useState([]);
  // Note
  const [noteText, setNoteText] = useState('');

  function addSubtask() { setSubtasks(s => [...s, '']); }
  function removeSubtask(i) { setSubtasks(s => s.filter((_, j) => j !== i)); }
  function updateSubtask(i, val) { setSubtasks(s => { const next = [...s]; next[i] = val; return next; }); }

  function handleSave() {
    if (type === 'task') {
      if (!taskText.trim()) return;
      onSaveTask({
        text: taskText.trim(),
        notes: taskNotes.trim() || null,
        subtasks: subtasks.map(s => s.trim()).filter(Boolean),
      });
    } else if (type === 'meal') {
      if (!mealName.trim()) return;
      onSaveMeal({ meal: mealName.trim(), slot: mealSlot, tags: mealTags });
    } else if (type === 'note') {
      if (!noteText.trim()) return;
      onSaveNote({ text: noteText.trim() });
    }
    onClose();
  }

  const inp = { ...S.inp, margin: 0 };
  const lbl = { fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: C.muted, marginBottom: 6, display: 'block' };
  const canSave =
    (type === 'task' && taskText.trim()) ||
    (type === 'meal' && mealName.trim()) ||
    (type === 'note' && noteText.trim());

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: C.scrim, zIndex: 700, display: 'flex', alignItems: 'flex-end' }}
      onClick={onClose}
    >
      <div
        style={{ background: C.card, borderRadius: '20px 20px 0 0', padding: '20px 16px 32px', width: '100%', maxWidth: 430, margin: '0 auto', maxHeight: '85vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.tx }}>
            {type ? `Add ${TYPES.find(t => t.id === type)?.label || ''}` : 'Quick Add'}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ width: 32, height: 32, borderRadius: 10, border: `1.5px solid ${C.bd}`, background: 'transparent', color: C.tx, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >×</button>
        </div>

        {/* Type selector */}
        {!type && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {TYPES.map(t => (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                style={{ padding: '16px 8px', borderRadius: 14, border: `1.5px solid ${C.bd}`, background: C.bg, cursor: 'pointer', textAlign: 'center' }}
              >
                <div style={{ fontSize: 24, marginBottom: 8 }}>{t.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{t.label}</div>
              </button>
            ))}
          </div>
        )}

        {/* Task form */}
        {type === 'task' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <input
              value={taskText}
              onChange={e => setTaskText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="Task name"
              style={inp}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
            <button
              type="button"
              onClick={() => setNotesOpen(o => !o)}
              style={{ ...S.btnGhost, fontSize: 11, justifyContent: 'flex-start', padding: '7px 10px' }}
            >
              {notesOpen ? '▾ Hide notes' : '▸ Add notes'}
            </button>
            {notesOpen && (
              <textarea
                value={taskNotes}
                onChange={e => setTaskNotes(e.target.value)}
                placeholder="Notes…"
                rows={3}
                style={{ ...inp, resize: 'vertical' }}
              />
            )}
            {subtasks.length > 0 && (
              <div style={{ display: 'grid', gap: 6 }}>
                {subtasks.map((st, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, paddingLeft: 14, alignItems: 'center' }}>
                    <div style={{ width: 6, height: 6, borderRadius: 999, background: C.bd, flexShrink: 0, marginTop: 1 }} />
                    <input
                      value={st}
                      onChange={e => updateSubtask(i, e.target.value)}
                      placeholder={`Subtask ${i + 1}`}
                      style={{ ...inp, flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => removeSubtask(i)}
                      style={{ ...S.btnGhost, padding: '4px 8px', fontSize: 11, flexShrink: 0 }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={addSubtask}
              style={{ ...S.btnGhost, fontSize: 11, justifyContent: 'flex-start', padding: '7px 10px' }}
            >+ Add subtask</button>
            <button
              onClick={handleSave}
              disabled={!taskText.trim()}
              style={{ ...S.btnSolid(), opacity: taskText.trim() ? 1 : 0.45, pointerEvents: taskText.trim() ? 'auto' : 'none' }}
            >Save Task</button>
          </div>
        )}

        {/* Meal form */}
        {type === 'meal' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <input
              value={mealName}
              onChange={e => setMealName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="Meal name"
              style={inp}
              autoFocus
            />
            <div>
              <span style={lbl}>Slot</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {MEAL_SLOTS.map(slot => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setMealSlot(slot)}
                    style={{ padding: '6px 12px', borderRadius: 10, border: `1.5px solid ${mealSlot === slot ? C.navy : C.bd}`, background: mealSlot === slot ? C.navyL : C.bg, color: mealSlot === slot ? C.navyDk : C.tx, fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}
                  >{slot}</button>
                ))}
              </div>
            </div>
            <div>
              <span style={lbl}>Tags (optional)</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {MEAL_TAGS.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setMealTags(t => t.includes(tag) ? t.filter(x => x !== tag) : [...t, tag])}
                    style={{ padding: '6px 12px', borderRadius: 10, border: `1.5px solid ${mealTags.includes(tag) ? C.sage : C.bd}`, background: mealTags.includes(tag) ? C.sageL : C.bg, color: mealTags.includes(tag) ? C.sageDk : C.tx, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >{tag}</button>
                ))}
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={!mealName.trim()}
              style={{ ...S.btnSolid(), opacity: mealName.trim() ? 1 : 0.45, pointerEvents: mealName.trim() ? 'auto' : 'none' }}
            >Log Meal</button>
          </div>
        )}

        {/* Workout form */}
        {type === 'workout' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ background: C.surf, borderRadius: 12, padding: '14px 14px' }}>
              <div style={{ fontSize: 13, color: C.tx, lineHeight: 1.5 }}>
                Use the <strong>Start</strong> button on your workout card to begin a tracked session directly from the home screen.
              </div>
            </div>
            <button type="button" onClick={onClose} style={S.btnGhost}>Got it</button>
          </div>
        )}

        {/* Note form */}
        {type === 'note' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Write a note…"
              rows={5}
              style={{ ...inp, resize: 'vertical' }}
              autoFocus
            />
            <button
              onClick={handleSave}
              disabled={!noteText.trim()}
              style={{ ...S.btnSolid(), opacity: noteText.trim() ? 1 : 0.45, pointerEvents: noteText.trim() ? 'auto' : 'none' }}
            >Save Note</button>
          </div>
        )}

        {type && (
          <button
            type="button"
            onClick={() => setType(null)}
            style={{ ...S.btnGhost, width: '100%', marginTop: 10, fontSize: 12 }}
          >← Back</button>
        )}
      </div>
    </div>
  );
}
