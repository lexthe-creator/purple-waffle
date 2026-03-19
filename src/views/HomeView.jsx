import React from 'react';
import CheckInGate from '../components/CheckInGate.jsx';
import GetToFirstValue from '../components/GetToFirstValue.jsx';
import DailyExecutionStrip from '../components/DailyExecutionStrip.jsx';
import Priorities from '../components/Priorities.jsx';
import MealCard from '../components/MealCard.jsx';
import WorkoutCard from '../components/WorkoutCard.jsx';
import WeeklyPreviewCard from '../components/WeeklyPreviewCard.jsx';
import WeekAheadCard from '../components/WeekAheadCard.jsx';
import SomedaySoonCard from '../components/SomedaySoonCard.jsx';
import TaskFlowCard from '../components/TaskFlowCard.jsx';

export default function HomeView({
  inboxTasks,
  plannedTasks,
  activeTasks,
  doneTasks,
  sharedHandlers,
  onCreateEmptyTask,
  onMoveToExecution,
  onMoveBackToPlanning,
  onOpenInbox,
  onOpenBrainDump,
  onOpenNutrition,
  onOpenWorkout,
  onMarkTaskDone,
}) {
  return (
    <div className="home-stack">
      <CheckInGate onOpenBrainDump={onOpenBrainDump} />
      <GetToFirstValue inboxCount={inboxTasks.length} plannedCount={plannedTasks.length} onOpenInbox={onOpenInbox} />
      <DailyExecutionStrip activeCount={activeTasks.length} doneCount={doneTasks.length} plannedCount={plannedTasks.length} />
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
      <div className="context-card-grid">
        <MealCard onOpenNutrition={onOpenNutrition} />
        <WorkoutCard onOpenWorkout={onOpenWorkout} />
        <WeeklyPreviewCard />
        <WeekAheadCard />
        <SomedaySoonCard />
        <TaskFlowCard plannedCount={plannedTasks.length} activeCount={activeTasks.length} doneCount={doneTasks.length} />
      </div>
    </div>
  );
}
