import React, { useEffect, useMemo, useState } from 'react';

export default function WorkoutPlayer({ workout, onCancel, onComplete }) {
  const [elapsed, setElapsed] = useState(0);
  const [completedExerciseIds, setCompletedExerciseIds] = useState([]);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(current => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const seconds = String(elapsed % 60).padStart(2, '0');
  const progress = useMemo(() => {
    if (!workout?.exercises?.length) return 0;
    return Math.round((completedExerciseIds.length / workout.exercises.length) * 100);
  }, [completedExerciseIds.length, workout?.exercises?.length]);

  function toggleExercise(exerciseId) {
    setCompletedExerciseIds(current => (
      current.includes(exerciseId)
        ? current.filter(item => item !== exerciseId)
        : [...current, exerciseId]
    ));
  }

  if (!workout) return null;

  return (
    <section className="task-card workout-player">
      <div className="task-card-header workout-player-header">
        <div>
          <p className="eyebrow">Workout player mode</p>
          <h2>{workout.name}</h2>
        </div>
        <div className="workout-meta-block">
          <strong>{minutes}:{seconds}</strong>
          <span>{progress}% complete</span>
        </div>
      </div>

      <div className="progress-bar">
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="workout-list">
        {workout.exercises.map(exercise => {
          const done = completedExerciseIds.includes(exercise.id);
          return (
            <button key={exercise.id} type="button" className={`workout-step ${done ? 'is-complete' : ''}`} onClick={() => toggleExercise(exercise.id)}>
              <div>
                <strong>{exercise.name}</strong>
                <p>{exercise.detail}</p>
              </div>
              <span>{done ? 'Done' : 'Tap to complete'}</span>
            </button>
          );
        })}
      </div>

      <div className="workout-controls">
        <button type="button" className="ghost-button" onClick={onCancel}>Cancel workout</button>
        <button type="button" className="primary-button" onClick={onComplete}>Complete workout</button>
      </div>
    </section>
  );
}
