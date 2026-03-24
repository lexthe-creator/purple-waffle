import { auditHyroxWorkoutLibrary } from '../src/data/hyroxWorkoutLibrary.js';

const result = auditHyroxWorkoutLibrary();

if (result.valid) {
  console.log(`HYROX schema audit passed.`);
  console.log(`Checked ${result.workoutCount} workouts, ${result.warmupCount} warm-ups, and ${result.cooldownCount} cooldown templates.`);
  process.exit(0);
}

console.error('HYROX schema audit failed with the following issues:');
for (const issue of result.errors) {
  console.error(`- ${issue}`);
}
process.exit(1);
