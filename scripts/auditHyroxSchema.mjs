import { validateWorkoutSystemSchema } from '../src/data/workoutSystemSchema.js';
import { auditHyroxWorkoutLibrary } from '../src/data/hyroxWorkoutLibrary.js';
import { pathToFileURL } from 'node:url';

export function runHyroxSchemaAudit() {
  const schemaResult = validateWorkoutSystemSchema();
  const libraryResult = auditHyroxWorkoutLibrary();
  const issues = [
    ...(schemaResult?.issues || schemaResult?.errors || []),
    ...(libraryResult?.issues || libraryResult?.errors || []),
  ];
  const ok = Boolean(schemaResult?.ok ?? schemaResult?.valid) && Boolean(libraryResult?.ok ?? libraryResult?.valid) && issues.length === 0;
  return {
    ok,
    issues,
    workoutCount: libraryResult?.workoutCount ?? 0,
    warmupCount: libraryResult?.warmupCount ?? 0,
    cooldownCount: libraryResult?.cooldownCount ?? 0,
    raw: { schemaResult, libraryResult },
  };
}

function isDirectExecution() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectExecution()) {
  const result = runHyroxSchemaAudit();
  if (result.ok) {
    console.log('HYROX schema audit passed.');
    console.log(`Checked ${result.workoutCount} workouts, ${result.warmupCount} warm-ups, and ${result.cooldownCount} cooldown templates.`);
    process.exit(0);
  }

  console.error('HYROX schema audit failed with the following issues:');
  for (const issue of result.issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}
