import { cooldownTemplates, warmupTemplates } from '../data/workoutSystemSchema.js';
import { HYROX_COOLDOWN_TEMPLATES, HYROX_WARMUP_TEMPLATES } from '../data/hyroxWorkoutLibrary.js';
import { normalizeProgramType } from '../data/programRouter.js';

const DEFAULT_COACHING_NOTES = {
  run: 'Conversational pace throughout',
  hyrox: 'Smooth transitions and clean station work',
  strength: 'Controlled reps and steady setup',
  strength_block: 'Controlled reps and steady setup',
  recovery: 'Keep it easy and breathe through the work',
};

const INTENSITY_LABELS = {
  high: 'Hard effort',
  moderate: 'Moderate recovery',
  low: 'Easy recovery',
};

function stripParentheticalSuffix(value) {
  return String(value || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function formatValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value} min`;
  }

  const text = String(value || '').trim();
  if (!text) return '';
  if (/^(?:\d+(?:\.\d+)?)\s*$/.test(text)) return `${text} min`;
  return text;
}

function parseInstructionStep(instruction, fallbackLabel = '') {
  const text = String(instruction || '').trim();
  if (!text) {
    return {
      label: fallbackLabel || 'Step',
      value: '',
    };
  }

  const match = text.match(/^((?:\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes|sec|secs|second|seconds|reps?|rep|x|m|meters?))\s*(?:[·\-–:]\s*)?(.*)$/i);
  if (!match) {
    return {
      label: fallbackLabel || text,
      value: '',
    };
  }

  const label = match[2]?.trim() || fallbackLabel || text;
  return {
    label,
    value: formatValue(match[1]),
  };
}

function normalizeStep(step, fallbackLabel) {
  if (typeof step === 'string') {
    return parseInstructionStep(step, fallbackLabel);
  }

  if (!step || typeof step !== 'object') {
    return {
      label: fallbackLabel || 'Step',
      value: '',
    };
  }

  const label = step.label || step.name || step.title || step.n || fallbackLabel || 'Step';
  const value = step.value || step.duration || step.reps || step.r || step.s || step.detail || '';
  return {
    label,
    value: formatValue(value),
  };
}

function buildTemplateSteps(template, kind) {
  if (!template) return [];

  const blocks = Array.isArray(template.blocks) ? template.blocks : [];
  const defaultFallback = kind === 'warmup' ? 'Warm-up' : 'Cooldown';

  if (blocks.length === 0) {
    return [{
      label: template.displayName || defaultFallback,
      value: formatValue(template.durationMinutes),
    }];
  }

  return blocks.map((block, index) => {
    const parsed = parseInstructionStep(block?.instruction || block?.details || '', block?.name || `${defaultFallback} ${index + 1}`);
    return {
      label: block?.name || parsed.label,
      value: formatValue(block?.durationMinutes || parsed.value || template.durationMinutes),
    };
  });
}

function getTemplateRegistry(kind) {
  return kind === 'warmup'
    ? { ...warmupTemplates, ...HYROX_WARMUP_TEMPLATES }
    : { ...cooldownTemplates, ...HYROX_COOLDOWN_TEMPLATES };
}

function getFallbackTemplateId(workout, kind) {
  const type = normalizeProgramType(workout?.programType || workout?.programId);
  if (kind === 'warmup') {
    if (typeof workout?.warmupTemplateId === 'string') return workout.warmupTemplateId;
    if (type === '5k') return 'run_standard_v1';
    if (type === 'strength_block' || workout?.type === 'strength') return 'strength_standard_v1';
    if (type === 'hyrox') return 'hyrox_functional_warmup';
  }

  if (kind === 'cooldown') {
    if (typeof workout?.cooldownTemplateId === 'string') return workout.cooldownTemplateId;
    if (type === '5k') return 'run_standard_v1';
    if (type === 'strength_block' || workout?.type === 'strength') return 'strength_standard_v1';
    if (type === 'hyrox') return 'hyrox_functional_cooldown';
  }

  return null;
}

function getWorkoutTypeLabel(workout) {
  const title = stripParentheticalSuffix(workout?.title || workout?.label || workout?.name || 'Workout');
  if (title && title !== 'Workout') return title;

  const type = normalizeProgramType(workout?.programType || workout?.programId);
  if (type === '5k' || workout?.type === 'run') return 'Run workout';
  if (type === 'strength_block' || workout?.type === 'strength') return 'Strength workout';
  if (type === 'hyrox' || workout?.type === 'hyrox') return 'HYROX session';
  return 'Workout';
}

function getCompleteLabel(workout) {
  const type = normalizeProgramType(workout?.programType || workout?.programId);
  if (type === '5k' || workout?.type === 'run') return 'Complete Run';
  if (type === 'hyrox' || workout?.type === 'hyrox') return 'Complete Session';
  return 'Complete Workout';
}

function getCoachingNote(workout) {
  const type = normalizeProgramType(workout?.programType || workout?.programId);
  return workout?.coachingNote
    || DEFAULT_COACHING_NOTES[type]
    || DEFAULT_COACHING_NOTES[workout?.type]
    || 'Follow the plan and keep the work steady.';
}

function extractDistanceSummary(workout) {
  const source = [
    workout?.summaryLine1,
    workout?.summaryLine2,
    workout?.prescription,
    workout?.detail,
    workout?.title,
    workout?.label,
    workout?.name,
  ].filter(Boolean).join(' · ');
  const match = source.match(/\b(\d+(?:-\d+)?)\s*(mi|mile|miles|km)\b/i);
  if (!match) return null;

  const unit = match[2].toLowerCase();
  return `${match[1]} ${unit === 'km' ? 'km' : 'mi'}`;
}

function getSummaryLineOne(workout) {
  if (typeof workout?.summaryLine1 === 'string' && workout.summaryLine1.trim()) {
    return workout.summaryLine1.trim();
  }

  const distance = extractDistanceSummary(workout);
  if (distance) {
    return `Distance: ${distance}`;
  }

  if (Number.isFinite(workout?.duration) && workout.duration > 0) {
    return `Duration: ${workout.duration} min`;
  }

  return null;
}

function getSummaryLineTwo(workout) {
  if (typeof workout?.summaryLine2 === 'string' && workout.summaryLine2.trim()) {
    return workout.summaryLine2.trim();
  }

  const pieces = [];
  if (typeof workout?.shortVersionRule === 'string' && workout.shortVersionRule.trim()) {
    pieces.push('Reduced Volume');
  }

  const intensity = typeof workout?.intensity === 'string' ? workout.intensity.toLowerCase() : '';
  if (INTENSITY_LABELS[intensity]) {
    pieces.push(INTENSITY_LABELS[intensity]);
  }

  if (pieces.length > 0) {
    return pieces.join(' · ');
  }

  const phase = workout?.phase || workout?.schedulePhaseType || workout?.phaseType || '';
  const week = Number.isFinite(workout?.week) ? `Week ${workout.week}` : '';
  return [week, phase].filter(Boolean).join(' · ') || null;
}

function resolveDirectSteps(workout, kind) {
  const explicitKey = kind === 'warmup' ? 'warmupSteps' : 'cooldownSteps';
  const explicitBlocksKey = kind === 'warmup' ? 'warmupBlocks' : 'cooldownBlocks';
  const explicitTextKey = kind === 'warmup' ? 'warmup' : 'cooldown';
  const explicitSteps = Array.isArray(workout?.[explicitKey]) ? workout[explicitKey] : null;
  if (explicitSteps && explicitSteps.length > 0) {
    return explicitSteps.map((step, index) => normalizeStep(step, `${kind === 'warmup' ? 'Warm-up' : 'Cooldown'} ${index + 1}`));
  }

  const explicitBlocks = Array.isArray(workout?.[explicitBlocksKey]) ? workout[explicitBlocksKey] : null;
  if (explicitBlocks && explicitBlocks.length > 0) {
    return explicitBlocks.map((block, index) => normalizeStep(block, `${kind === 'warmup' ? 'Warm-up' : 'Cooldown'} ${index + 1}`));
  }

  const explicitText = workout?.[explicitTextKey];
  if (typeof explicitText === 'string' && explicitText.trim()) {
    return [parseInstructionStep(explicitText, kind === 'warmup' ? 'Warm-up' : 'Cooldown')];
  }

  return [];
}

function resolveFallbackExerciseStep(workout, kind) {
  const exercises = Array.isArray(workout?.exercises) ? workout.exercises : [];
  if (exercises.length === 0) return [];

  const exercise = kind === 'warmup' ? exercises[0] : exercises[exercises.length - 1];
  if (!exercise) return [];

  return [normalizeStep({
    label: exercise.name || exercise.n || (kind === 'warmup' ? 'Warm-up' : 'Cooldown'),
    value: exercise.detail || exercise.reps || exercise.duration || '',
  }, kind === 'warmup' ? 'Warm-up' : 'Cooldown')];
}

function resolveTemplateSteps(workout, kind) {
  const templateId = getFallbackTemplateId(workout, kind);
  const registry = getTemplateRegistry(kind);
  const template = templateId ? registry[templateId] : null;
  if (template) {
    return buildTemplateSteps(template, kind);
  }

  return [];
}

export function resolveWorkoutPlayerSteps(workout, kind) {
  const directSteps = resolveDirectSteps(workout, kind);
  if (directSteps.length > 0) {
    return directSteps.slice(0, 8);
  }

  const templateSteps = resolveTemplateSteps(workout, kind);
  if (templateSteps.length > 0) {
    return templateSteps.slice(0, 8);
  }

  return resolveFallbackExerciseStep(workout, kind).slice(0, 8);
}

export function getWorkoutPlayerModel(workout) {
  return {
    title: workout?.title || workout?.label || workout?.name || 'Workout',
    typeLabel: getWorkoutTypeLabel(workout),
    coachingNote: getCoachingNote(workout),
    summaryLine1: getSummaryLineOne(workout),
    summaryLine2: getSummaryLineTwo(workout),
    warmupSteps: resolveWorkoutPlayerSteps(workout, 'warmup'),
    cooldownSteps: resolveWorkoutPlayerSteps(workout, 'cooldown'),
    completeLabel: getCompleteLabel(workout),
  };
}
