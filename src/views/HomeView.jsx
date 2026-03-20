import React, { useState } from 'react';
import GetToFirstValue from '../components/GetToFirstValue.jsx';
import Priorities from '../components/Priorities.jsx';
import MealCard from '../components/MealCard.jsx';
import WorkoutCard from '../components/WorkoutCard.jsx';
import TaskFlowCard from '../components/TaskFlowCard.jsx';

export default function HomeView({
  inboxCount,
  plannedTasks,
  activeTasks,
  doneTasks,
  sharedHandlers,
  onCreateEmptyTask,
  onMoveToExecution,
  onMoveBackToPlanning,
  onOpenInbox,
  onOpenNutrition,
  onOpenWorkout,
  onMarkTaskDone,
  meal,
  workout,
}) {
  const [setupVisible, setSetupVisible] = useState(true);
  const [setupCollapsed, setSetupCollapsed] = useState(false);
  const [collapsedCards, setCollapsedCards] = useState({
    meal: false,
    workout: false,
    flow: false,
  });

  const plannedCount = plannedTasks.length;
  const activeCount = activeTasks.length;
  const doneCount = doneTasks.length;

  function toggleCard(key) {
    setCollapsedCards(current => ({ ...current, [key]: !current[key] }));
  }

  function openWorkout() {
    onOpenWorkout(workout);
  }

  return (
    <div className="home-stack dashboard-home">
      {setupVisible ? (
        <GetToFirstValue
          inboxCount={inboxCount}
          plannedCount={plannedCount}
          onOpenInbox={onOpenInbox}
          onDismiss={() => setSetupVisible(false)}
          collapsed={setupCollapsed}
          onToggleCollapse={() => setSetupCollapsed(current => !current)}
        />
      ) : (
        <button
          type="button"
          className="ghost-button setup-reveal-button"
          onClick={() => {
            setSetupVisible(true);
            setSetupCollapsed(false);
          }}
        >
          Show setup
        </button>
      )}

      <section className="daily-execution-shell">
        <Priorities
          plannedTasks={plannedTasks}
          activeTasks={activeTasks}
          doneTasks={doneTasks}
          sharedHandlers={sharedHandlers}
          onCreateEmptyTask={onCreateEmptyTask}
          onMoveToExecution={onMoveToExecution}
          onMoveBackToPlanning={onMoveBackToPlanning}
          onMarkDone={onMarkTaskDone}
        />
      </section>

      <div className="supporting-card-stack">
        <MealCard
          meal={meal}
          onOpenNutrition={onOpenNutrition}
          collapsed={collapsedCards.meal}
          onToggleCollapse={() => toggleCard('meal')}
          toggleLabel={collapsedCards.meal ? 'Expand' : 'Collapse'}
        />
        <WorkoutCard
          workout={workout}
          onOpenWorkout={openWorkout}
          collapsed={collapsedCards.workout}
          onToggleCollapse={() => toggleCard('workout')}
          toggleLabel={collapsedCards.workout ? 'Expand' : 'Collapse'}
        />
        <TaskFlowCard
          plannedCount={plannedCount}
          activeCount={activeCount}
          doneCount={doneCount}
          collapsed={collapsedCards.flow}
          onToggleCollapse={() => toggleCard('flow')}
          toggleLabel={collapsedCards.flow ? 'Expand' : 'Collapse'}
        />
      </div>
    </div>
  );
}
