import { normalizeProgramType } from './programRouter.js';
import {
  buildWorkoutContentFromSession,
  normalizeWorkoutExercise,
} from './workoutSystemState.js';

function getProgramDisplayName(programType) {
  const normalized = normalizeProgramType(programType);
  if (normalized === '5k') return '5K run builder';
  if (normalized === 'strength_block') return 'Strength Block plan';
  return 'HYROX plan';
}

function humanizeSessionType(value) {
  const text = String(value || '').trim();
  if (!text) return 'Workout';
  return text
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function normalizeType(session, programType) {
  const rawType = String(session?.type || '').toLowerCase();
  const rawCategory = String(session?.category || '').toLowerCase();
  const rawSessionType = String(session?.sessionTypeCanonical || session?.sessionType || '').toLowerCase();

  if (rawType === 'run' || rawCategory === 'run' || rawSessionType.includes('run')) return 'run';
  if (rawType === 'recovery' || rawCategory === 'recovery' || rawSessionType.includes('recovery')) return 'recovery';
  if (rawType === 'strength' || rawCategory === 'strength' || rawSessionType.includes('strength')) return 'strength';
  if (normalizeProgramType(programType) === 'hyrox') return 'hyrox';
  return 'strength';
}

function normalizeDateLike(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return null;
}

function summarizeContent(content) {
  const blocks = Array.isArray(content?.blocks) ? content.blocks : [];
  const exercises = blocks.flatMap(block => (Array.isArray(block.exercises) ? block.exercises : []));

  return {
    blockCount: blocks.length,
    exerciseCount: exercises.length,
    hasIntervals: exercises.some(exercise => Boolean(exercise.interval)),
    hasTimedEfforts: exercises.some(exercise => Boolean(exercise.timedEffort || exercise.duration)),
    hasNotes: Boolean(
      (Array.isArray(content?.notes) && content.notes.length > 0)
      || exercises.some(exercise => Boolean(exercise.note || exercise.cue || exercise.detail))
    ),
  };
}

function flattenExercises(content, session) {
  const blockExercises = Array.isArray(content?.blocks)
    ? content.blocks.flatMap(block => (
      Array.isArray(block.exercises)
        ? block.exercises.map((exercise, index) => normalizeWorkoutExercise(exercise, index))
        : []
    ))
    : [];

  if (blockExercises.length > 0) return blockExercises;

  const fallbackExercises = Array.isArray(session?.exercises)
    ? session.exercises
    : Array.isArray(session?.ex)
      ? session.ex
      : [];
  return fallbackExercises.map((exercise, index) => normalizeWorkoutExercise(exercise, index));
}

function buildSafeGeneratedSessionMeta(session, programType, scheduledDate) {
  return session?.generatedSessionMeta && typeof session.generatedSessionMeta === 'object'
    ? {
        ...session.generatedSessionMeta,
        generationSource: session.generatedSessionMeta.generationSource
          ? { ...session.generatedSessionMeta.generationSource }
          : null,
        lifecycle: session.generatedSessionMeta.lifecycle
          ? { ...session.generatedSessionMeta.lifecycle }
          : null,
      }
    : {
        originalScheduledDate: scheduledDate,
        currentScheduledDate: scheduledDate,
        movedFrom: null,
        movedTo: null,
        skipStatus: 'not_skipped',
        skipReason: null,
        wasSkipped: false,
        generationSource: {
          kind: 'program',
          programType,
          templateId: session?.librarySessionId || session?.workoutId || null,
          sessionType: session?.sessionTypeCanonical || session?.sessionType || null,
        },
        lifecycle: {
          status: 'planned',
          isMoved: false,
          isRescheduled: false,
          isSkipped: false,
        },
      };
}

function maybeWarnForMissingFields(session, payload) {
  const isDev = typeof process === 'undefined' || process.env?.NODE_ENV !== 'production';
  if (!isDev) return;

  const missing = [];
  if (!payload.id) missing.push('id');
  if (!payload.programType) missing.push('programType');
  if (!Number.isFinite(payload.duration)) missing.push('duration');
  if (!payload.title) missing.push('title');

  if (missing.length > 0) {
    console.warn('[adaptGeneratedSessionToWorkoutRecord] Missing required fields:', missing.join(', '), session);
  }
}

export function adaptGeneratedSessionToWorkoutRecord(session, options = {}) {
  const safeSession = session && typeof session === 'object' ? session : {};
  const programType = normalizeProgramType(safeSession.programType);
  const durationMinutes = Number.isFinite(safeSession.durationMinutes)
    ? safeSession.durationMinutes
    : (Number.isFinite(safeSession.duration) ? safeSession.duration : 30);
  const scheduledDate = normalizeDateLike(options.scheduledDate)
    || normalizeDateLike(safeSession.dateKey)
    || normalizeDateLike(safeSession.date)
    || null;
  const plannedDate = normalizeDateLike(options.plannedDate)
    || scheduledDate;
  const content = buildWorkoutContentFromSession(safeSession);
  const exercises = flattenExercises(content, safeSession);
  const title = safeSession.title
    || safeSession.label
    || humanizeSessionType(safeSession.sessionTypeCanonical || safeSession.sessionType);

  const payload = {
    id: options.id || safeSession.id || safeSession.workoutId || `generated-${programType}-${safeSession.sessionTypeCanonical || 'workout'}`,
    name: safeSession.label || safeSession.title || title,
    title,
    label: safeSession.label || safeSession.title || title,
    detail: safeSession.detail || null,
    objective: safeSession.objective || safeSession.shortVersionRule || null,

    type: normalizeType(safeSession, programType),
    programId: programType,
    programType,
    programName: getProgramDisplayName(programType),
    sessionType: safeSession.sessionType || null,
    sessionTypeCanonical: safeSession.sessionTypeCanonical || safeSession.sessionType || null,

    status: options.status || 'planned',

    scheduledDate,
    plannedDate,
    date: scheduledDate,
    plannedTime: safeSession.plannedTime || null,

    duration: durationMinutes,
    plannedDurationMinutes: durationMinutes,

    phase: safeSession.phase || safeSession.schedulePhaseType || null,
    week: Number.isFinite(safeSession.week) ? safeSession.week : null,
    programWeek: Number.isFinite(safeSession.programWeek)
      ? safeSession.programWeek
      : (Number.isFinite(safeSession.week) ? safeSession.week : null),
    sessionOffset: Number.isFinite(safeSession.offset) ? safeSession.offset : null,
    trainingDays: safeSession.trainingDays || null,

    content: {
      version: 1,
      source: 'program',
      blocks: Array.isArray(content?.blocks) ? content.blocks : [],
      notes: Array.isArray(content?.notes) ? content.notes : [],
    },
    exercises,
    contentSummary: summarizeContent(content),
    notes: Array.isArray(content?.notes) ? content.notes : [],

    warmupTemplateId: safeSession.warmupTemplateId || null,
    cooldownTemplateId: safeSession.cooldownTemplateId || null,
    shortVersionRule: safeSession.shortVersionRule || null,
    prescription: safeSession.prescription || null,
    coachingNote: safeSession.coachingNote || safeSession.coachingNotes || null,

    source: {
      origin: 'program',
      importKey: safeSession.id || safeSession.workoutKey || safeSession.workoutId || null,
      templateId: safeSession.librarySessionId || safeSession.warmupTemplateId || safeSession.cooldownTemplateId || null,
      libraryId: safeSession.librarySessionId || safeSession.workoutId || safeSession.workoutKey || safeSession.id || null,
      sessionType: safeSession.sessionTypeCanonical || safeSession.sessionType || null,
    },

    generatedSessionMeta: buildSafeGeneratedSessionMeta(safeSession, programType, scheduledDate),

    workoutLog: null,
    startedAt: null,
    completedAt: null,
    createdAt: Number.isFinite(options.createdAt)
      ? options.createdAt
      : (Number.isFinite(safeSession.createdAt) ? safeSession.createdAt : 0),
  };

  maybeWarnForMissingFields(safeSession, payload);
  return payload;
}
