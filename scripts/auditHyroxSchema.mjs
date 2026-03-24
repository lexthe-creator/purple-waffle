import { auditHyroxWorkoutLibrary } from '../src/data/hyroxWorkoutLibrary.js';

const result = auditHyroxWorkoutLibrary();

if (!result.ok) {
  console.error('HYROX schema audit failed.');
  for (const issue of result.issues) {
    console.error(`- ${issue}`);
  }
  process.exitCode = 1;
} else {
  console.log('HYROX schema audit passed.');
  console.log(`Validated ${Object.values(result.counts).reduce((sum, count) => sum + count, 0)} workouts across ${Object.keys(result.counts).length} phases.`);
}
