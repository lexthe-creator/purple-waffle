import { phaseRules, programProfiles, weeklyTemplates } from './workoutSystemSchema.js';

const FIVE_K_PROFILE = programProfiles['5k'];
const FIVE_K_DAY_SLOT_COUNTS = Object.fromEntries(
  (FIVE_K_PROFILE.supportedDaysPerWeek || [3, 4, 5]).map(days => [`${days}-day`, days]),
);
const FIVE_K_PHASE_SEQUENCE = [...(FIVE_K_PROFILE.phaseSequence || ['foundation', 'base', 'build', 'peak', 'recovery_deload'])];
const FIVE_K_HARD_SESSION_TYPES = new Set(['run_intervals', 'run_tempo']);

function normalizeTrainingDays(trainingDays) {
  if (trainingDays === 3 || trainingDays === '3-day') return '3-day';
  if (trainingDays === 5 || trainingDays === '5-day') return '5-day';
  return '4-day';
}

function normalizeWeekType(weekType, weekNumber) {
  if (weekType === 'A' || weekType === 'B') return weekType;
  return Number.isFinite(weekNumber) && weekNumber % 2 === 0 ? 'B' : 'A';
}

function clampWeeks(totalWeeks) {
  if (!Number.isFinite(totalWeeks)) return FIVE_K_PROFILE.durationWeeks?.default || 8;
  return Math.max(
    FIVE_K_PROFILE.minimumWeeks || 6,
    Math.min(FIVE_K_PROFILE.maximumWeeks || 12, Math.trunc(totalWeeks)),
  );
}

function buildPhaseWindows(totalWeeks) {
  const weeks = clampWeeks(totalWeeks);
  const proportions = [0.2, 0.25, 0.3, 0.15, 0.1];
  const allocated = proportions.map(value => Math.max(1, Math.floor(weeks * value)));
  const allocatedTotal = allocated.reduce((sum, value) => sum + value, 0);
  allocated[2] += weeks - allocatedTotal;

  let startWeek = 1;
  return FIVE_K_PHASE_SEQUENCE.reduce((acc, phaseType, index) => {
    const length = allocated[index];
    const endWeek = Math.min(weeks, startWeek + length - 1);
    acc[phaseType] = {
      ...(phaseRules[phaseType] || {}),
      phaseType,
      startWeek,
      endWeek,
    };
    startWeek = endWeek + 1;
    return acc;
  }, {});
}

export function get5kPhaseForWeek({ weekNumber = 1, totalWeeks = 8 }) {
  const windows = buildPhaseWindows(totalWeeks);
  const week = Math.max(1, Math.min(clampWeeks(totalWeeks), Math.trunc(weekNumber || 1)));
  return Object.values(windows).find(({ startWeek, endWeek }) => week >= startWeek && week <= endWeek) || windows.recovery_deload;
}

function find5kTemplate({ phaseType, daysPerWeek, weekType = 'A' }) {
  const candidates = weeklyTemplates
    .filter(template => template.programType === '5k' && template.phaseType === phaseType && template.daysPerWeek === daysPerWeek)
    .sort((a, b) => a.templatePriority - b.templatePriority);
  if (candidates.length === 0) return [];
  const index = weekType === 'B' && candidates.length > 1 ? 1 : 0;
  return candidates[index].dayPattern || [];
}

function hasBackToBackHardDays(dayPattern) {
  return dayPattern.some((sessionType, index) => index > 0
    && FIVE_K_HARD_SESSION_TYPES.has(sessionType)
    && FIVE_K_HARD_SESSION_TYPES.has(dayPattern[index - 1]));
}

function enforce5kIntensityGuards({ dayPattern, phaseType }) {
  const safePattern = [...dayPattern];
  const hardDayCount = safePattern.filter(sessionType => FIVE_K_HARD_SESSION_TYPES.has(sessionType)).length;
  const hardCap = safePattern.length <= 3 ? 2 : 3;

  if (hardDayCount > hardCap) {
    let hardSeen = 0;
    for (let index = 0; index < safePattern.length; index += 1) {
      if (!FIVE_K_HARD_SESSION_TYPES.has(safePattern[index])) continue;
      hardSeen += 1;
      if (hardSeen > hardCap) {
        safePattern[index] = 'run_easy';
      }
    }
  }

  if (phaseType !== 'peak' && hasBackToBackHardDays(safePattern)) {
    for (let index = 1; index < safePattern.length; index += 1) {
      if (FIVE_K_HARD_SESSION_TYPES.has(safePattern[index]) && FIVE_K_HARD_SESSION_TYPES.has(safePattern[index - 1])) {
        safePattern[index] = 'recovery_yoga';
      }
    }
  }

  return safePattern;
}

function buildPrescriptionForSession({ phaseType, sessionType, weekIndexInPhase }) {
  const n = weekIndexInPhase + 1;
  const runDurations = {
    foundation: { run_easy: '2-3 miles easy', run_intervals: `${4 + n} x 1 min steady / 2 min easy jog`, run_tempo: `${10 + (n * 2)} min controlled tempo`, run_long: `${3 + n} miles easy-long` },
    base: { run_easy: `${3 + n} miles easy`, run_intervals: `${4 + n} x 400m @ 5K effort`, run_tempo: `${15 + (n * 2)} min tempo`, run_long: `${4 + n} miles aerobic long run` },
    build: { run_easy: `${4 + n} miles easy`, run_intervals: `${5 + n} x 600m @ 5K effort`, run_tempo: `${18 + (n * 2)} min tempo or cruise intervals`, run_long: `${5 + n} miles with strong final mile` },
    peak: { run_easy: `${3 + n} miles easy`, run_intervals: `${4 + n} x 800m @ race pace`, run_tempo: `${12 + (n * 2)} min at race pace`, run_long: `${4 + n} miles with race-pace pickups` },
    recovery_deload: { run_easy: '2-3 miles relaxed', run_intervals: '4 x 200m race-pace strides (full recovery)', run_tempo: '10-12 min controlled tempo', run_long: '3-4 miles relaxed long run' },
  };

  if (sessionType === 'recovery_pilates') {
    return '25-30 min easy mobility + core control';
  }
  if (sessionType === 'recovery_yoga') {
    return '25-30 min down-regulation and mobility flow';
  }

  return runDurations[phaseType]?.[sessionType] || '30-45 min aerobic run';
}

function classifyIntensity(sessionType) {
  if (sessionType === 'run_intervals' || sessionType === 'run_tempo') return 'high';
  if (sessionType === 'run_long') return 'moderate';
  return 'low';
}

export function generate5kWeeklyWorkoutSelection({
  trainingDays,
  weekNumber = 1,
  weekType,
  totalWeeks = 8,
}) {
  const normalizedDays = normalizeTrainingDays(trainingDays);
  const normalizedWeekType = normalizeWeekType(weekType, weekNumber);
  const daysPerWeek = FIVE_K_DAY_SLOT_COUNTS[normalizedDays];
  const phase = get5kPhaseForWeek({ weekNumber, totalWeeks });
  const weekIndexInPhase = Math.max(0, weekNumber - phase.startWeek);
  const templatePattern = find5kTemplate({
    phaseType: phase.phaseType,
    daysPerWeek,
    weekType: normalizedWeekType,
  });
  const safePattern = enforce5kIntensityGuards({ dayPattern: templatePattern, phaseType: phase.phaseType });

  return safePattern.map((sessionType, slotIndex) => ({
    workoutId: `5k_${phase.phaseType}_${weekNumber}_${slotIndex + 1}`,
    programType: '5k',
    phaseType: phase.phaseType,
    schedulePhaseType: phase.phaseType,
    weekNumber,
    weekType: normalizedWeekType,
    slotIndex,
    sessionType,
    sessionTypeCanonical: sessionType,
    trainingDays: normalizedDays,
    durationMinutes: sessionType.startsWith('recovery_') ? 30 : (sessionType === 'run_long' ? 60 : 45),
    intensity: classifyIntensity(sessionType),
    shortVersionRule: sessionType.startsWith('recovery_') ? '15-20 min gentle movement only' : 'Trim volume by 25%, keep intent',
    warmupTemplateId: sessionType.startsWith('run_') ? 'run_standard_v1' : 'conditioning_standard_v1',
    cooldownTemplateId: sessionType.startsWith('run_') ? 'run_standard_v1' : 'conditioning_standard_v1',
    prescription: buildPrescriptionForSession({
      phaseType: phase.phaseType,
      sessionType,
      weekIndexInPhase,
    }),
    structure: [{
      blockId: 'main',
      name: 'Main Set',
      details: buildPrescriptionForSession({
        phaseType: phase.phaseType,
        sessionType,
        weekIndexInPhase,
      }),
      durationMinutes: sessionType.startsWith('recovery_') ? 20 : 30,
    }],
  }));
}

export function generate5kWorkoutSchedule(args) {
  return generate5kWeeklyWorkoutSelection(args).map((session, index) => ({
    ...session,
    slotIndex: index,
  }));
}

export {
  FIVE_K_DAY_SLOT_COUNTS,
  FIVE_K_PHASE_SEQUENCE,
};
