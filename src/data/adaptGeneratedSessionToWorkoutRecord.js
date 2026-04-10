import {
  buildWorkoutContentFromSession,
  normalizeWorkoutRecord,
} from './workoutSystemState.js';
import { normalizeProgramType } from './programRouter.js';

function getProgramDisplayName(programType) {
  const normalized = normalizeProgramType(programType);
  if (normalized === '5k') return '5K run builder';
  if (normalized === 'strength_block') return 'Strength Block plan';
  return 'HYROX 32-week plan';
}

function generateWorkoutId() {
  return `workout-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function inferWorkoutType(sessionType) {
  const t = String(sessionType || '').toLowerCase();
  if (t.includes('run')) return 'run';
  if (t.includes('hyrox')) return 'hyrox';
  if (t.includes('recovery')) return 'recovery';
  return 'strength';
}

/**
 * Pure adapter: converts a generator session object into a normalized workout
 * record ready for persistence. No React or factory-function dependencies.
 *
 * @param {object} session  - Output from hyroxWorkoutGenerator, 5kWorkoutGenerator,
 *                            or programRouter (or any session-shaped object).
 * @param {object} [options]
 * @param {string|null}  [options.scheduledDate]  - YYYY-MM-DD override
 * @param {string|null}  [options.plannedDate]    - YYYY-MM-DD override
 * @param {string}       [options.status]         - 'planned' | 'active' | 'completed' | 'skipped'
 * @param {object}       [options.settings]       - fitnessSettings for program/trainingDays defaults
 * @param {number|null}  [options.programWeek]    - explicit program week override
 * @param {string|null}  [options.id]             - provide a stable ID (otherwise generated)
 * @returns {object} Normalized workout record (same shape as normalizeWorkoutRecord output)
 */
export function adaptGeneratedSessionToWorkoutRecord(session, options = {}) {
  const src = session && typeof session === 'object' ? session : {};
  const {
    scheduledDate: scheduledDateOpt = null,
    plannedDate: plannedDateOpt = null,
    status = 'planned',
    settings = {},
    programWeek: programWeekOpt = null,
    id: idOpt = null,
  } = options;

  const normalizedProgramType = normalizeProgramType(src.programType || settings.programType || 'hyrox');
  const workoutType = inferWorkoutType(src.type || src.sessionType);

  const content = buildWorkoutContentFromSession(src);

  // Flat exercises array derived from content blocks (for the top-level exercises field)
  const exercises = Array.isArray(content.blocks) && content.blocks.length > 0
    ? content.blocks.flatMap(block =>
        Array.isArray(block.exercises) && block.exercises.length > 0
          ? block.exercises
          : [],
      )
    : [];

  const resolvedScheduledDate = scheduledDateOpt || src.dateKey || null;
  const resolvedPlannedDate = plannedDateOpt || src.dateKey || resolvedScheduledDate;

  const plannedDurationMinutes = Number.isFinite(src.plannedDurationMinutes)
    ? src.plannedDurationMinutes
    : Number.isFinite(src.duration)
      ? src.duration
      : null;

  const programWeek = Number.isFinite(programWeekOpt)
    ? programWeekOpt
    : Number.isFinite(src.programWeek)
      ? src.programWeek
      : Number.isFinite(src.week)
        ? src.week
        : null;

  const sessionName = src.label || src.title || 'Training Session';

  const raw = {
    id: typeof idOpt === 'string' && idOpt.length > 0 ? idOpt : generateWorkoutId(),
    name: sessionName,
    title: sessionName,
    label: sessionName,
    detail: src.detail || null,
    objective: src.objective || src.shortVersionRule || null,
    programId: normalizedProgramType,
    programType: normalizedProgramType,
    programName: getProgramDisplayName(normalizedProgramType),
    type: workoutType,
    status,
    scheduledDate: resolvedScheduledDate,
    plannedDate: resolvedPlannedDate,
    date: resolvedScheduledDate,
    sessionOffset: src.offset != null ? src.offset : null,
    trainingDays: settings.trainingDays || '4-day',
    phase: src.phase || '',
    week: programWeek,
    programWeek,
    duration: plannedDurationMinutes || 45,
    plannedDurationMinutes: plannedDurationMinutes || 45,
    plannedTime: src.plannedTime || null,
    sessionType: src.sessionType || null,
    sessionTypeCanonical: src.sessionTypeCanonical || null,
    warmupTemplateId: src.warmupTemplateId || null,
    cooldownTemplateId: src.cooldownTemplateId || null,
    shortVersionRule: src.shortVersionRule || null,
    prescription: src.prescription || null,
    coachingNote: src.coachingNotes || src.coachingNote || null,
    exercises,
    content,
    source: {
      origin: 'program',
      importKey: src.id || src.workoutKey || src.workoutId || null,
      templateId: src.warmupTemplateId || src.cooldownTemplateId || null,
      libraryId: src.workoutId || src.workoutKey || src.id || null,
      sessionType: src.sessionType || src.sessionTypeCanonical || src.type || null,
    },
    createdAt: Date.now(),
  };

  return normalizeWorkoutRecord(raw, 0);
}
