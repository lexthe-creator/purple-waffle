import React, { useState } from 'react';
import { createPortal } from 'react-dom';

const STEP_TYPE_LABELS = {
  task: 'Task',
  habit: 'Habit',
  focus: 'Focus',
  custom: 'Step',
};

export default function RoutinePlayer({ routine, onClose, onComplete }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(new Set());

  const steps = routine?.steps || [];
  const totalSteps = steps.length;
  const currentStep = steps[stepIndex] || null;
  const isLast = stepIndex === totalSteps - 1;
  const allDone = completedSteps.size === totalSteps;

  function markStepDone() {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      next.add(stepIndex);
      return next;
    });
  }

  function goNext() {
    markStepDone();
    if (!isLast) {
      setStepIndex(i => i + 1);
    }
  }

  function goBack() {
    if (stepIndex > 0) setStepIndex(i => i - 1);
  }

  function handleFinish() {
    markStepDone();
    if (onComplete) onComplete(routine.id);
    onClose();
  }

  const progressPct = totalSteps > 0 ? Math.round((completedSteps.size / totalSteps) * 100) : 0;

  const content = (
    <div className="routine-player-overlay" role="dialog" aria-modal="true" aria-label={`Routine: ${routine?.name || 'Routine'}`}>
      <div className="routine-player">
        {/* Header */}
        <div className="routine-player__header">
          <div>
            <p className="eyebrow">{routine?.name || 'Routine'}</p>
            <p className="routine-player__progress-label">
              Step {Math.min(stepIndex + 1, totalSteps)} of {totalSteps}
            </p>
          </div>
          <button
            type="button"
            className="ghost-button compact-ghost"
            onClick={onClose}
            aria-label="Close routine"
          >
            Close
          </button>
        </div>

        {/* Progress bar */}
        <div className="routine-player__progress-track" aria-hidden="true">
          <div
            className="routine-player__progress-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Step content */}
        {currentStep ? (
          <div className="routine-player__step">
            <div className="routine-player__step-type">
              {STEP_TYPE_LABELS[currentStep.type] || 'Step'}
              {currentStep.durationMinutes != null && (
                <span className="routine-player__step-duration">
                  {' · '}
                  {currentStep.durationMinutes} min
                </span>
              )}
            </div>
            <h2 className="routine-player__step-label">{currentStep.label || 'Complete this step'}</h2>

            {completedSteps.has(stepIndex) && (
              <span className="status-pill status-done routine-player__done-badge">Done</span>
            )}
          </div>
        ) : (
          <div className="routine-player__step">
            <h2 className="routine-player__step-label">No steps defined</h2>
          </div>
        )}

        {/* Step list overview */}
        <div className="routine-player__step-list">
          {steps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              className={`routine-player__step-dot${index === stepIndex ? ' is-current' : ''}${completedSteps.has(index) ? ' is-done' : ''}`}
              onClick={() => setStepIndex(index)}
              aria-label={`Go to step ${index + 1}: ${step.label}`}
            />
          ))}
        </div>

        {/* Controls */}
        <div className="routine-player__controls">
          <button
            type="button"
            className="ghost-button"
            onClick={goBack}
            disabled={stepIndex === 0}
          >
            Back
          </button>

          {isLast ? (
            <button
              type="button"
              className="primary-button"
              onClick={handleFinish}
            >
              Finish routine
            </button>
          ) : (
            <button
              type="button"
              className="primary-button"
              onClick={goNext}
            >
              {completedSteps.has(stepIndex) ? 'Next →' : 'Done, next →'}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
