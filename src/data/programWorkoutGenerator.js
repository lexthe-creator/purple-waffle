import {
  generateProgramWeeklySelection,
  generateProgramWorkoutSchedule,
  normalizeProgramType,
} from './programRouter.js';

export function generateWeeklyWorkoutSelection({ programType = 'hyrox', ...rest }) {
  return generateProgramWeeklySelection({ programType, ...rest });
}

export function generateWorkoutSchedule({ programType = 'hyrox', ...rest }) {
  return generateProgramWorkoutSchedule({ programType, ...rest });
}

export { normalizeProgramType };
