import { generateHyroxWeeklyWorkoutSelection } from '../src/data/hyroxWorkoutGenerator.js';

const AUDIT_START_WEEK = 21;
const AUDIT_END_WEEK = 32;
const TRAINING_DAY_MODES = ['4-day', '5-day'];

function schedulePhaseForWeek(weekNumber) {
  if (weekNumber >= 1 && weekNumber <= 8) return 'Base';
  if (weekNumber >= 9 && weekNumber <= 16) return 'Build';
  if (weekNumber >= 17 && weekNumber <= 23) return 'Specificity';
  if (weekNumber >= 24 && weekNumber <= 28) return 'Peak';
  return 'Taper';
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ratioOverlap(previousItems, currentItems) {
  const previousSet = new Set(previousItems);
  const currentSet = new Set(currentItems);
  if (!previousSet.size || !currentSet.size) return 0;
  let overlap = 0;
  for (const id of currentSet) {
    if (previousSet.has(id)) overlap += 1;
  }
  return overlap / Math.min(previousSet.size, currentSet.size);
}

function auditMode(trainingDays) {
  const issues = [];
  const weeks = [];

  for (let weekNumber = AUDIT_START_WEEK; weekNumber <= AUDIT_END_WEEK; weekNumber += 1) {
    const schedulePhase = schedulePhaseForWeek(weekNumber);
    const selection = generateHyroxWeeklyWorkoutSelection({ weekNumber, schedulePhase, trainingDays });
    const ids = selection.map(workout => workout.workoutId);
    const expectedCount = trainingDays === '5-day' ? 5 : 4;

    if (selection.length !== expectedCount) {
      issues.push(`Week ${weekNumber}: expected ${expectedCount} workouts but got ${selection.length}.`);
    }

    if (selection.some(workout => workout.schedulePhaseType !== schedulePhase)) {
      issues.push(`Week ${weekNumber}: schedulePhaseType mismatch inside generated workouts.`);
    }

    const duplicateCount = ids.length - new Set(ids).size;
    if (duplicateCount > 0) {
      issues.push(`Week ${weekNumber}: contains ${duplicateCount} duplicate workoutId selections.`);
    }

    weeks.push({
      weekNumber,
      schedulePhase,
      libraryPhases: [...new Set(selection.map(workout => workout.libraryPhaseType))],
      sessionTypes: selection.map(workout => workout.sessionType),
      workoutIds: ids,
      avgDuration: average(selection.map(workout => workout.durationMinutes)),
      avgProgressionLevel: average(selection.map(workout => workout.progressionLevel || 0)),
      avgIntensityIndex: average(selection.map(workout => (workout.intensity === 'race' ? 4 : workout.intensity === 'hard' ? 3 : workout.intensity === 'moderate' ? 2 : 1))),
    });
  }

  // Rotation signal: high overlap with previous week indicates poor rotation.
  for (let i = 1; i < weeks.length; i += 1) {
    const prev = weeks[i - 1];
    const current = weeks[i];
    const overlap = ratioOverlap(prev.workoutIds, current.workoutIds);
    current.overlapWithPreviousWeek = overlap;

    if (overlap >= 0.9) {
      issues.push(`Weeks ${prev.weekNumber}-${current.weekNumber}: high ID overlap (${Math.round(overlap * 100)}%).`);
    }
  }

  const peakWeeks = weeks.filter(week => week.schedulePhase === 'Peak');
  const taperWeeks = weeks.filter(week => week.schedulePhase === 'Taper');
  const peakDuration = average(peakWeeks.map(week => week.avgDuration));
  const taperDuration = average(taperWeeks.map(week => week.avgDuration));
  const peakIntensity = average(peakWeeks.map(week => week.avgIntensityIndex));
  const taperIntensity = average(taperWeeks.map(week => week.avgIntensityIndex));

  if (taperDuration >= peakDuration) {
    issues.push(`Taper duration is not reduced (peak avg ${peakDuration.toFixed(1)} min vs taper avg ${taperDuration.toFixed(1)} min).`);
  }

  if (taperIntensity >= peakIntensity) {
    issues.push(`Taper intensity is not reduced (peak ${peakIntensity.toFixed(2)} vs taper ${taperIntensity.toFixed(2)}).`);
  }

  return {
    trainingDays,
    window: { startWeek: AUDIT_START_WEEK, endWeek: AUDIT_END_WEEK },
    issues,
    metrics: {
      peakDuration,
      taperDuration,
      peakIntensity,
      taperIntensity,
      maxOverlap: Math.max(0, ...weeks.map(week => week.overlapWithPreviousWeek || 0)),
      averageOverlap: average(weeks.map(week => week.overlapWithPreviousWeek || 0)),
    },
    weeks,
  };
}

const reports = TRAINING_DAY_MODES.map(auditMode);
const allIssues = reports.flatMap(report => report.issues.map(issue => `[${report.trainingDays}] ${issue}`));

for (const report of reports) {
  console.log(`\n=== HYROX generator audit (${report.trainingDays}) ===`);
  console.log(`Weeks ${report.window.startWeek}-${report.window.endWeek}`);
  console.log(`Rotation overlap avg/max: ${(report.metrics.averageOverlap * 100).toFixed(1)}% / ${(report.metrics.maxOverlap * 100).toFixed(1)}%`);
  console.log(`Peak duration avg: ${report.metrics.peakDuration.toFixed(1)} min`);
  console.log(`Taper duration avg: ${report.metrics.taperDuration.toFixed(1)} min`);
  console.log(`Peak intensity idx: ${report.metrics.peakIntensity.toFixed(2)}`);
  console.log(`Taper intensity idx: ${report.metrics.taperIntensity.toFixed(2)}`);
}

if (allIssues.length) {
  console.error('\nHYROX generator behavior audit found issues:');
  for (const issue of allIssues) {
    console.error(`- ${issue}`);
  }
  process.exitCode = 1;
} else {
  console.log('\nHYROX generator behavior audit passed with no issues.');
}
