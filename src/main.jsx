import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Header from './components/Header.jsx';
import BrainDumpModal from './components/BrainDumpModal.jsx';
import PlanningCard from './components/PlanningCard.jsx';
import ExecutionCard from './components/ExecutionCard.jsx';
import InboxView from './views/InboxView.jsx';
import { TaskProvider, useTaskContext } from './context/TaskContext.jsx';
import './styles.css';

function TaskApp() {
  const { tasks, setTasks, createTask, generateId, sortTasks } = useTaskContext();
  const [activeView, setActiveView] = useState('planning');
  const [brainDumpOpen, setBrainDumpOpen] = useState(false);

  const inboxTasks = useMemo(() => tasks.filter(task => task.status === 'inbox'), [tasks]);
  const plannedTasks = useMemo(() => tasks.filter(task => task.status === 'planned'), [tasks]);
  const activeTasks = useMemo(() => tasks.filter(task => task.status === 'active'), [tasks]);
  const doneTasks = useMemo(() => tasks.filter(task => task.status === 'done'), [tasks]);

  function updateTask(taskId, updater) {
    setTasks(current => sortTasks(current.map(task => (task.id === taskId ? updater(task) : task))));
  }

  function deleteTask(taskId) {
    setTasks(current => current.filter(task => task.id !== taskId));
  }

  function moveTask(taskId, direction) {
    setTasks(current => {
      const currentTask = current.find(task => task.id === taskId);
      if (!currentTask) return current;

      const sameStatusTasks = sortTasks(current.filter(task => task.status === currentTask.status));
      const index = sameStatusTasks.findIndex(task => task.id === taskId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= sameStatusTasks.length) return current;

      const reordered = [...sameStatusTasks];
      const [movedTask] = reordered.splice(index, 1);
      reordered.splice(nextIndex, 0, movedTask);

      const updatedById = new Map(
        reordered.map((task, orderIndex) => [task.id, { ...task, order: orderIndex + 1 }]),
      );

      return sortTasks(current.map(task => updatedById.get(task.id) || task));
    });
  }

  function commitTitle(taskId, title) {
    updateTask(taskId, task => ({ ...task, title, shouldFocusTitle: false }));
  }

  function toggleDone(taskId) {
    updateTask(taskId, task => ({
      ...task,
      status: task.status === 'done' ? 'active' : 'done',
      shouldFocusTitle: false,
    }));
  }

  function addSubtask(taskId) {
    updateTask(taskId, task => ({
      ...task,
      subtasks: [...task.subtasks, { id: generateId('subtask'), title: '', done: false }],
    }));
  }

  function commitSubtaskTitle(taskId, subtaskId, title) {
    updateTask(taskId, task => ({
      ...task,
      subtasks: task.subtasks.map(subtask => (subtask.id === subtaskId ? { ...subtask, title } : subtask)),
    }));
  }

  function toggleSubtask(taskId, subtaskId) {
    updateTask(taskId, task => ({
      ...task,
      subtasks: task.subtasks.map(subtask => (subtask.id === subtaskId ? { ...subtask, done: !subtask.done } : subtask)),
    }));
  }

  function commitNotes(taskId, notes) {
    updateTask(taskId, task => ({ ...task, notes }));
  }

  function createEmptyPlannedTask() {
    const emptyTask = createTask('planned', { shouldFocusTitle: true, order: plannedTasks.length + 1 });
    setTasks(current => sortTasks([...current, emptyTask]));
    setActiveView('planning');
  }

  function sendToInbox(title) {
    const task = createTask('inbox', { title, order: inboxTasks.length + 1 });
    setTasks(current => sortTasks([...current, task]));
    setBrainDumpOpen(false);
    setActiveView('inbox');
  }

  function moveToPlanning(taskId) {
    updateTask(taskId, task => ({ ...task, status: 'planned', shouldFocusTitle: false }));
    setActiveView('planning');
  }

  function moveToExecution(taskId) {
    updateTask(taskId, task => ({ ...task, status: 'active', shouldFocusTitle: false }));
    setActiveView('planning');
  }

  function moveBackToPlanning(taskId) {
    updateTask(taskId, task => ({ ...task, status: 'planned', shouldFocusTitle: false }));
  }

  const sharedHandlers = {
    onCommitTitle: commitTitle,
    onToggleDone: toggleDone,
    onDelete: deleteTask,
    onMove: moveTask,
    onAddSubtask: addSubtask,
    onCommitSubtaskTitle: commitSubtaskTitle,
    onToggleSubtask: toggleSubtask,
    onCommitNotes: commitNotes,
  };

  return (
    <div className="app-shell">
      <Header
        inboxCount={inboxTasks.length}
        onOpenBrainDump={() => setBrainDumpOpen(true)}
        onOpenInbox={() => setActiveView('inbox')}
        onOpenSettings={() => setActiveView('settings')}
      />

      <main className="app-content">
        {activeView === 'inbox' && (
          <InboxView
            tasks={inboxTasks}
            onCommitTitle={commitTitle}
            onMoveToPlanning={moveToPlanning}
            onDelete={deleteTask}
          />
        )}

        {activeView === 'settings' && (
          <section className="task-card">
            <div className="task-card-header">
              <div>
                <p className="eyebrow">Settings</p>
                <h2>Keep your existing settings space</h2>
              </div>
            </div>
            <p className="settings-copy">
              This refactor keeps task management centralized in one context. Add any existing settings controls here without duplicating task state.
            </p>
          </section>
        )}

        {activeView !== 'inbox' && activeView !== 'settings' && (
          <div className="home-stack">
            <section className="task-card">
              <div className="task-card-header">
                <div>
                  <p className="eyebrow">Brain Dump → Inbox</p>
                  <h2>Captured items waiting for triage</h2>
                </div>
              </div>
              <div className="summary-stack">
                <div className="summary-tile">
                  <span>Inbox</span>
                  <strong>{inboxTasks.length}</strong>
                </div>
                <button type="button" className="secondary-button full-width" onClick={() => setActiveView('inbox')}>
                  Open Inbox
                </button>
              </div>
            </section>

            <PlanningCard
              tasks={plannedTasks.map(task => ({ ...task, shouldFocusTitle: Boolean(task.shouldFocusTitle) }))}
              handlers={sharedHandlers}
              onCreateEmptyTask={createEmptyPlannedTask}
              onMoveToExecution={moveToExecution}
            />

            <ExecutionCard
              tasks={activeTasks}
              handlers={sharedHandlers}
              onMoveBackToPlanning={moveBackToPlanning}
            />

            <section className="task-card">
              <div className="task-card-header">
                <div>
                  <p className="eyebrow">Done</p>
                  <h2>Completed tasks</h2>
                </div>
              </div>
              <div className="task-list compact-list">
                {doneTasks.length === 0 ? (
                  <p className="empty-message">Completed work will appear here.</p>
                ) : (
                  doneTasks.map(task => (
                    <div key={task.id} className="transition-row done-row">
                      <span className="transition-title">{task.title || 'Untitled task'}</span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      <BrainDumpModal
        isOpen={brainDumpOpen}
        onClose={() => setBrainDumpOpen(false)}
        onSubmit={sendToInbox}
      />
    </div>
  );
}

function App() {
  return (
    <TaskProvider>
      <TaskApp />
    </TaskProvider>
  );
}

const rootElement = document.getElementById('root');
createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
