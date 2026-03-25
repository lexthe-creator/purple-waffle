import { runHyroxSchemaAudit } from './auditHyroxSchema.mjs';
import { runHyroxGeneratorBehaviorAudit } from './auditHyroxGeneratorBehavior.mjs';
import { runWorkoutSystemStateAudit } from './auditWorkoutSystemState.mjs';

function validateAuditResult(result, label) {
  if (!result || typeof result.ok !== 'boolean' || !Array.isArray(result.issues)) {
    return {
      ok: false,
      issues: [`${label} returned an invalid result shape.`],
    };
  }
  return result;
}

function printAudit(label, result) {
  if (result.ok) {
    console.log(`${label}: PASS`);
    return;
  }

  console.log(`${label}: FAIL`);
  for (const issue of result.issues) {
    console.log(`- ${issue}`);
  }
}

function run() {
  console.log('HYROX TEST RUN');
  console.log('--------------');

  let schemaAudit;
  let generatorAudit;
  let stateAudit;

  try {
    schemaAudit = validateAuditResult(runHyroxSchemaAudit(), 'Schema Audit');
  } catch (error) {
    schemaAudit = {
      ok: false,
      issues: [`Schema Audit threw: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  try {
    generatorAudit = validateAuditResult(runHyroxGeneratorBehaviorAudit(), 'Generator Audit');
  } catch (error) {
    generatorAudit = {
      ok: false,
      issues: [`Generator Audit threw: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  try {
    stateAudit = validateAuditResult(runWorkoutSystemStateAudit(), 'State Audit');
  } catch (error) {
    stateAudit = {
      ok: false,
      issues: [`State Audit threw: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  printAudit('Schema Audit', schemaAudit);
  printAudit('Generator Audit', generatorAudit);
  printAudit('State Audit', stateAudit);

  const ok = schemaAudit.ok && generatorAudit.ok && stateAudit.ok;
  console.log('');
  console.log(`FINAL RESULT: ${ok ? 'PASSED' : 'FAILED'}`);
  process.exit(ok ? 0 : 1);
}

run();
