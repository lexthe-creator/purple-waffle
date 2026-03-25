import {
  generateHyroxWeeklyWorkoutSelection,
  generateHyroxWorkoutSchedule,
} from './hyroxWorkoutGenerator.js';
import {
  generate5kWeeklyWorkoutSelection,
  generate5kWorkoutSchedule,
} from './5kWorkoutGenerator.js';
import { supportedProgramTypes } from './workoutSystemSchema.js';

function normalizeProgramType(programType) {
  const normalized = String(programType || 'hyrox').toLowerCase();
  return supportedProgramTypes.includes(normalized) ? normalized : 'hyrox';
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
