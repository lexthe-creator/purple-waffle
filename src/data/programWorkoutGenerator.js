import {
  generateHyroxWeeklyWorkoutSelection,
  generateHyroxWorkoutSchedule,
} from './hyroxWorkoutGenerator.js';
import {
  generate5kWeeklyWorkoutSelection,
  generate5kWorkoutSchedule,
} from './5kWorkoutGenerator.js';

function normalizeProgramType(programType) {
  return String(programType || 'hyrox').toLowerCase();
}

export function generateWeeklyWorkoutSelection({ programType = 'hyrox', ...rest }) {
  const normalizedProgramType = normalizeProgramType(programType);
  if (normalizedProgramType === '5k') {
    return generate5kWeeklyWorkoutSelection(rest);
  }
  return generateHyroxWeeklyWorkoutSelection(rest);
}

export function generateWorkoutSchedule({ programType = 'hyrox', ...rest }) {
  const normalizedProgramType = normalizeProgramType(programType);
  if (normalizedProgramType === '5k') {
    return generate5kWorkoutSchedule(rest);
  }
  return generateHyroxWorkoutSchedule(rest);
}
