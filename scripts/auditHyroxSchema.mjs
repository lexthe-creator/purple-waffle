import { auditHyroxWorkoutLibrary } from '../src/data/hyroxWorkoutLibrary.js';
import { pathToFileURL } from 'node:url';

export function runHyroxSchemaAudit() {
  const result = auditHyroxWorkoutLibrary();
  const ok = Boolean(result?.ok ?? result?.valid);
  return {
    ok,
    issues: [...(result?.issues || result?.errors || [])],
    workoutCount: result?.workoutCount ?? 0,
    warmupCount: result?.warmupCount ?? 0,
    cooldownCount: result?.cooldownCount ?? 0,
    raw: result,
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
