import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Header from './components/Header.jsx';
import BrainDumpModal from './components/BrainDumpModal.jsx';
import PlanningCard from './components/PlanningCard.jsx';
import InboxView from './views/InboxView.jsx';
import './styles.css';

const APP_STATE_STORAGE_KEY = 'purple-waffle-app-state-v2';

function generateId(prefix = 'item') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createPriority(overrides = {}) {
  const createdAt = Date.now();

  return {
    id: generateId('priority'),
    title: '',
    notes: '',
    createdAt,
    order: createdAt,
    ...overrides,
  };
}

function createInboxItem(title, overrides = {}) {
  const createdAt = Date.now();

  return {
    id: generateId('inbox'),
    title,
    createdAt,
    order: createdAt,
    ...overrides,
  };
}

function sortItems(items) {
  return [...items].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

function normalizeOrderedItem(item, prefix, index = 0) {
  const createdAt = Number.isFinite(item?.createdAt) ? item.createdAt : Date.now() + index;

  return {
    id: item?.id || generateId(prefix),
    title: typeof item?.title === 'string' ? item.title : '',
    notes: typeof item?.notes === 'string' ? item.notes : '',
    createdAt,
    order: Number.isFinite(item?.order) ? item.order : createdAt,
  };
}

function normalizeInboxItem(item, index = 0) {
  const createdAt = Number.isFinite(item?.createdAt) ? item.createdAt : Date.now() + index;

  return {
    id: item?.id || generateId('inbox'),
    title: typeof item?.title === 'string' ? item.title : '',
    createdAt,
    order: Number.isFinite(item?.order) ? item.order : createdAt,
  };
}

function loadInitialState() {
  if (typeof window === 'undefined') {
    return {
      checkIn: '',
      priorities: [],
      inbox: [],
      brainDump: '',
      ui: { flowActive: false, activeView: 'planning' },
    };
  }

  try {
    const raw = window.localStorage.getItem(APP_STATE_STORAGE_KEY);
    if (!raw) {
      return {
        checkIn: '',
        priorities: [],
        inbox: [],
        brainDump: '',
        ui: { flowActive: false, activeView: 'planning' },
      };
    }

    const parsed = JSON.parse(raw);

    return {
      checkIn: typeof parsed?.checkIn === 'string' ? parsed.checkIn : '',
      priorities: Array.isArray(parsed?.priorities)
        ? sortItems(parsed.priorities.map((item, index) => normalizeOrderedItem(item, 'priority', index)))
        : [],
      inbox: Array.isArray(parsed?.inbox)
        ? sortItems(parsed.inbox.map((item, index) => normalizeInboxItem(item, index)))
        : [],
      brainDump: typeof parsed?.brainDump === 'string' ? parsed.brainDump : '',
      ui: {
        flowActive: parsed?.ui?.flowActive === true,
        activeView: parsed?.ui?.activeView === 'inbox' ? 'inbox' : 'planning',
      },
    };
  } catch {
    return {
      checkIn: '',
      priorities: [],
      inbox: [],
      brainDump: '',
      ui: { flowActive: false, activeView: 'planning' },
    };
  }
}

function App() {
  const [appState, setAppState] = useState(loadInitialState);
  const [brainDumpOpen, setBrainDumpOpen] = useState(false);

  React.useEffect(() => {
    window.localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(appState));
  }, [appState]);

  const flow = useMemo(
    () => ({
      hasPriorities: appState.priorities.length > 0,
      steps: appState.priorities.map(priority => priority.id),
    }),
    [appState.priorities],
  );

  function setActiveView(activeView) {
    setAppState(current => ({
      ...current,
      ui: {
        ...current.ui,
        activeView,
      },
    }));
  }

  function updatePriority(priorityId, updater) {
    setAppState(current => ({
      ...current,
      priorities: sortItems(
        current.priorities.map(priority => (priority.id === priorityId ? updater(priority) : priority)),
      ),
    }));
  }

  function deletePriority(priorityId) {
    setAppState(current => ({
      ...current,
      priorities: current.priorities.filter(priority => priority.id !== priorityId),
      ui: {
        ...current.ui,
        flowActive: current.priorities[0]?.id === priorityId ? false : current.ui.flowActive,
      },
    }));
  }

  function movePriority(priorityId, direction) {
    setAppState(current => {
      const index = current.priorities.findIndex(priority => priority.id === priorityId);
      const nextIndex = index + direction;

      if (index < 0 || nextIndex < 0 || nextIndex >= current.priorities.length) {
        return current;
      }

      const reordered = [...current.priorities];
      const [movedPriority] = reordered.splice(index, 1);
      reordered.splice(nextIndex, 0, movedPriority);

      return {
        ...current,
        priorities: reordered.map((priority, orderIndex) => ({
          ...priority,
          order: orderIndex + 1,
        })),
      };
    });
  }

  function commitPriorityTitle(priorityId, title) {
    updatePriority(priorityId, priority => ({ ...priority, title, shouldFocusTitle: false }));
  }

  function commitPriorityNotes(priorityId, notes) {
    updatePriority(priorityId, priority => ({ ...priority, notes }));
  }

  function createEmptyPriority() {
    setAppState(current => ({
      ...current,
      priorities: sortItems([
        ...current.priorities,
        createPriority({ shouldFocusTitle: true, order: current.priorities.length + 1 }),
      ]),
      ui: {
        ...current.ui,
        activeView: 'planning',
      },
    }));
  }

  function sendToInbox(title) {
    setAppState(current => ({
      ...current,
      brainDump: '',
      inbox: sortItems([...current.inbox, createInboxItem(title, { order: current.inbox.length + 1 })]),
      ui: {
        ...current.ui,
        activeView: 'inbox',
      },
    }));
    setBrainDumpOpen(false);
  }

  function commitInboxTitle(itemId, title) {
    setAppState(current => ({
      ...current,
      inbox: sortItems(current.inbox.map(item => (item.id === itemId ? { ...item, title } : item))),
    }));
  }

  function deleteInboxItem(itemId) {
    setAppState(current => ({
      ...current,
      inbox: current.inbox.filter(item => item.id !== itemId),
    }));
  }

  function moveInboxToPriorities(itemId) {
    setAppState(current => {
      const item = current.inbox.find(entry => entry.id === itemId);
      if (!item) return current;

      return {
        ...current,
        inbox: current.inbox.filter(entry => entry.id !== itemId),
        priorities: sortItems([
          ...current.priorities,
          createPriority({
            title: item.title,
            order: current.priorities.length + 1,
          }),
        ]),
        ui: {
          ...current.ui,
          activeView: 'planning',
        },
      };
    });
  }

  const priorityHandlers = {
    onCommitTitle: commitPriorityTitle,
    onDelete: deletePriority,
    onMove: movePriority,
    onCommitNotes: commitPriorityNotes,
  };

  return (
    <div className="app-shell">
      <Header
        inboxCount={appState.inbox.length}
        onOpenBrainDump={() => setBrainDumpOpen(true)}
        onOpenInbox={() => setActiveView('inbox')}
      />

      <main className="app-content">
        {appState.ui.activeView === 'inbox' ? (
          <InboxView
            tasks={appState.inbox}
            onCommitTitle={commitInboxTitle}
            onMoveToPlanning={moveInboxToPriorities}
            onDelete={deleteInboxItem}
          />
        ) : (
          <div className="board-grid">
            <section className="task-card">
              <div className="task-card-header">
                <div>
                  <p className="eyebrow">Check-in</p>
                  <h2>Start with what matters today</h2>
                </div>
              </div>
              <textarea
                className="notes-textarea"
                value={appState.checkIn}
                placeholder="What needs your attention today?"
                onChange={event => {
                  const nextValue = event.target.value;
                  setAppState(current => ({ ...current, checkIn: nextValue }));
                }}
              />
            </section>

            <section className="task-card">
              <div className="task-card-header">
                <div>
                  <p className="eyebrow">Inbox</p>
                  <h2>Captured items waiting for triage</h2>
                </div>
              </div>
              <div className="summary-stack">
                <div className="summary-tile">
                  <span>Inbox</span>
                  <strong>{appState.inbox.length}</strong>
                </div>
                <button type="button" className="secondary-button full-width" onClick={() => setActiveView('inbox')}>
                  Open Inbox
                </button>
              </div>
            </section>

            <PlanningCard
              tasks={appState.priorities.map(priority => ({ ...priority, shouldFocusTitle: Boolean(priority.shouldFocusTitle) }))}
              handlers={priorityHandlers}
              onCreateEmptyTask={createEmptyPriority}
            />

            <section className="task-card">
              <div className="task-card-header">
                <div>
                  <p className="eyebrow">Flow</p>
                  <h2>Derived from priorities</h2>
                </div>
              </div>
              {flow.hasPriorities ? (
                <div className="summary-stack">
                  <div className="summary-tile">
                    <span>Flow status</span>
                    <strong>{appState.ui.flowActive ? 'Active' : 'Inactive'}</strong>
                  </div>
                  <p className="settings-copy">
                    Flow stays derived from priority order ({flow.steps.length} item{flow.steps.length === 1 ? '' : 's'}) and does not store a separate task queue.
                  </p>
                </div>
              ) : (
                <p className="empty-message">Add priorities to define flow when you are ready.</p>
              )}
            </section>
          </div>
        )}
      </main>

      <BrainDumpModal
        isOpen={brainDumpOpen}
        initialValue={appState.brainDump}
        onChange={value => {
          setAppState(current => ({ ...current, brainDump: value }));
        }}
        onClose={() => setBrainDumpOpen(false)}
        onSubmit={sendToInbox}
      />
    </div>
  );
}

const rootElement = document.getElementById('root');
createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
