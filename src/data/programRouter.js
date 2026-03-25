import {
  generateHyroxWorkoutSchedule,
  generateHyroxWeeklyWorkoutSelection,
} from './hyroxWorkoutGenerator.js';
import {
  generate5kWorkoutSchedule,
  generate5kWeeklyWorkoutSelection,
} from './5kWorkoutGenerator.js';
import { supportedProgramTypes } from './workoutSystemSchema.js';

export const PROGRAM_TYPES = Object.freeze({
  HYROX: 'hyrox',
  RUN_5K: '5k',
  STRENGTH: 'strength_block',
});

function annotateProgramSessions(sessions, programType) {
  return sessions.map((session, index) => ({
    ...session,
    programType,
    id: session.id ?? session.workoutId ?? `${programType}-${index}`,
  }));
}

export function normalizeProgramType(programType) {
  if (!programType) return PROGRAM_TYPES.HYROX;

  const value = String(programType).toLowerCase().trim();

  if (['hyrox', 'hyrox_32_week', 'hyrox plan', 'hyrox 32-week plan'].includes(value)) {
    return PROGRAM_TYPES.HYROX;
  }

  if (['5k', '5k_run_builder', '5k run builder'].includes(value)) {
    return PROGRAM_TYPES.RUN_5K;
  }

  if (['strength', 'strength_block', 'strength block'].includes(value)) {
    return PROGRAM_TYPES.STRENGTH;
  }

  return supportedProgramTypes.includes(value) ? value : PROGRAM_TYPES.HYROX;
}

export function generateProgramWorkoutSchedule({
  programType,
  phaseType,
  schedulePhase,
  weekNumber,
  weekType,
  trainingDays,
  fitnessSettings,
  totalWeeks,
}) {
  const activeProgramType = normalizeProgramType(programType);

  switch (activeProgramType) {
    case PROGRAM_TYPES.RUN_5K:
      return annotateProgramSessions(generate5kWorkoutSchedule({
        phaseType,
        schedulePhase,
        weekNumber,
        weekType,
        trainingDays,
        fitnessSettings,
        totalWeeks,
      }), activeProgramType);
    case PROGRAM_TYPES.STRENGTH:
      return [];
    case PROGRAM_TYPES.HYROX:
    default:
      return annotateProgramSessions(generateHyroxWorkoutSchedule({
        phaseType,
        schedulePhase,
        weekNumber,
        weekType,
        trainingDays,
        fitnessSettings,
        totalWeeks,
      }), activeProgramType);
  }
}

export function generateProgramWeeklySelection({
  programType,
  phaseType,
  schedulePhase,
  weekNumber,
  weekType,
  trainingDays,
  fitnessSettings,
  totalWeeks,
}) {
  const activeProgramType = normalizeProgramType(programType);

  switch (activeProgramType) {
    case PROGRAM_TYPES.RUN_5K:
      return annotateProgramSessions(generate5kWeeklyWorkoutSelection({
        phaseType,
        schedulePhase,
        weekNumber,
        weekType,
        trainingDays,
        fitnessSettings,
        totalWeeks,
      }), activeProgramType);
    case PROGRAM_TYPES.STRENGTH:
      return [];
    case PROGRAM_TYPES.HYROX:
    default:
      return annotateProgramSessions(generateHyroxWeeklyWorkoutSelection({
        phaseType,
        schedulePhase,
        weekNumber,
        weekType,
        trainingDays,
        fitnessSettings,
        totalWeeks,
      }), activeProgramType);
  }
}
