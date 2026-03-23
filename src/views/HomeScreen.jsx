import React, { useState } from 'react';
import { useProfileContext } from '../context/ProfileContext.jsx';

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function daysUntilDue(lastDone, intervalDays) {
  if (!lastDone) return -intervalDays; // overdue by the full interval if never done
  const last = new Date(lastDone);
  const due = new Date(last.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  const now = new Date();
  return Math.round((due - now) / (24 * 60 * 60 * 1000));
}

export default function HomeScreen() {
  const { profile, setProfile } = useProfileContext();
  const { groceryList, maintenanceHistory } = profile;

  // Grocery state
  const [groceryInput, setGroceryInput] = useState('');

  // Maintenance form state
  const [maintOpen, setMaintOpen] = useState(false);
  const [maintLabel, setMaintLabel] = useState('');
  const [maintInterval, setMaintInterval] = useState('30');

  function addGroceryItem() {
    const label = groceryInput.trim();
    if (!label) return;
    const newItem = { id: `gr-${Date.now()}`, label, done: false };
    setProfile(p => ({ ...p, groceryList: [...p.groceryList, newItem] }));
    setGroceryInput('');
  }

  function toggleGroceryItem(id) {
    setProfile(p => ({
      ...p,
      groceryList: p.groceryList.map(item => item.id === id ? { ...item, done: !item.done } : item),
    }));
  }

  function removeGroceryItem(id) {
    setProfile(p => ({ ...p, groceryList: p.groceryList.filter(item => item.id !== id) }));
  }

  function clearChecked() {
    setProfile(p => ({ ...p, groceryList: p.groceryList.filter(item => !item.done) }));
  }

  function addMaintenanceItem() {
    const label = maintLabel.trim();
    const intervalDays = Number.parseInt(maintInterval, 10);
    if (!label || !Number.isFinite(intervalDays) || intervalDays <= 0) return;

    const key = `mt-${Date.now()}`;
    setProfile(p => ({
      ...p,
      maintenanceHistory: {
        ...p.maintenanceHistory,
        [key]: { id: key, label, intervalDays, lastDone: null },
      },
    }));
    setMaintLabel('');
    setMaintInterval('30');
    setMaintOpen(false);
  }

  function markMaintenanceDone(key) {
    setProfile(p => ({
      ...p,
      maintenanceHistory: {
        ...p.maintenanceHistory,
        [key]: { ...p.maintenanceHistory[key], lastDone: getTodayDateKey() },
      },
    }));
  }

  function removeMaintenanceItem(key) {
    setProfile(p => {
      const next = { ...p.maintenanceHistory };
      delete next[key];
      return { ...p, maintenanceHistory: next };
    });
  }

  const maintItems = Object.values(maintenanceHistory).sort((a, b) => {
    return daysUntilDue(a.lastDone, a.intervalDays) - daysUntilDue(b.lastDone, b.intervalDays);
  });

  const checkedCount = groceryList.filter(i => i.done).length;

  return (
    <div className="screen-content">
      {/* Grocery list */}
      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Shopping</p>
            <h2>Grocery list</h2>
          </div>
          {checkedCount > 0 && (
            <button type="button" className="ghost-button compact-ghost" onClick={clearChecked}>
              Clear checked
            </button>
          )}
        </div>

        <div className="quick-entry-row" style={{ marginBottom: '12px' }}>
          <input
            className="brain-dump-input"
            placeholder="Add item…"
            value={groceryInput}
            onChange={e => setGroceryInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGroceryItem(); } }}
            style={{ flex: 1 }}
          />
          <button type="button" className="secondary-button" onClick={addGroceryItem}>
            Add
          </button>
        </div>

        {groceryList.length === 0 ? (
          <p className="empty-hint">Your grocery list is empty.</p>
        ) : (
          <ul className="plain-list">
            {groceryList.map(item => (
              <li key={item.id} className="list-row" style={{ alignItems: 'center' }}>
                <button
                  type="button"
                  className={`status-chip ${item.done ? 'is-active' : ''}`}
                  style={{ minWidth: '20px', height: '20px', borderRadius: '4px', padding: '0 6px', fontSize: '12px' }}
                  onClick={() => toggleGroceryItem(item.id)}
                  aria-label={item.done ? `Uncheck ${item.label}` : `Check ${item.label}`}
                >
                  {item.done ? '✓' : ''}
                </button>
                <span
                  className="list-row-label"
                  style={{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--muted)' : 'inherit' }}
                >
                  {item.label}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--muted)' }}
                  onClick={() => removeGroceryItem(item.id)}
                  aria-label={`Remove ${item.label}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Maintenance tracker */}
      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Upkeep</p>
            <h2>Maintenance tracker</h2>
          </div>
          <button type="button" className="ghost-button compact-ghost" onClick={() => setMaintOpen(o => !o)}>
            {maintOpen ? 'Cancel' : '+ Add'}
          </button>
        </div>

        {maintOpen && (
          <div className="inline-collapse" style={{ marginBottom: '12px' }}>
            <input
              className="brain-dump-input"
              placeholder="Task (e.g. Change air filter)"
              value={maintLabel}
              onChange={e => setMaintLabel(e.target.value)}
            />
            <input
              className="brain-dump-input"
              type="number"
              min="1"
              placeholder="Repeat every N days"
              value={maintInterval}
              onChange={e => setMaintInterval(e.target.value)}
            />
            <button type="button" className="primary-button full-width" onClick={addMaintenanceItem}>
              Save task
            </button>
          </div>
        )}

        {maintItems.length === 0 ? (
          <p className="empty-hint">No maintenance tasks yet. Add recurring home tasks above.</p>
        ) : (
          <ul className="plain-list">
            {maintItems.map(item => {
              const days = daysUntilDue(item.lastDone, item.intervalDays);
              const isOverdue = days < 0;
              const isDueSoon = days >= 0 && days <= 7;

              return (
                <li key={item.id} className="list-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '4px' }}>
                  <div style={{ flex: 1 }}>
                    <span className="list-row-label">{item.label}</span>
                    <span className="list-row-meta" style={{ display: 'block', fontSize: '12px', color: 'var(--muted)' }}>
                      Every {item.intervalDays} days
                      {item.lastDone ? ` · last done ${item.lastDone}` : ' · never done'}
                    </span>
                  </div>
                  <span
                    className={`status-pill ${isOverdue ? 'pill-danger' : isDueSoon ? 'pill-warning' : 'pill-ok'}`}
                  >
                    {isOverdue ? `${Math.abs(days)}d overdue` : days === 0 ? 'due today' : `${days}d`}
                  </span>
                  <button type="button" className="ghost-button compact-ghost" onClick={() => markMaintenanceDone(item.id)}>
                    Done
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    style={{ fontSize: '12px', color: 'var(--muted)' }}
                    onClick={() => removeMaintenanceItem(item.id)}
                    aria-label={`Remove ${item.label}`}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
