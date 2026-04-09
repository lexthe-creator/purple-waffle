import { generateHyroxWorkoutSchedule, generateHyroxWeeklyWorkoutSelection } from './hyroxWorkoutGenerator.js';
import {
  generatorProgramProfiles,
  generatorRules,
  normalizeLibraryProgramType,
  sessionLibrary,
  weeklyTemplates,
} from './generalWorkoutLibrary.js';

const DAY_KEY_TO_NUMBER = {
  '3-day': 3,
  '4-day': 4,
  '5-day': 5,
};

function buildGeneratedSessionMeta({
  templateId = null,
  programType,
  sessionType,
  generationKind = 'library',
}) {
  return {
    originalScheduledDate: null,
    currentScheduledDate: null,
    movedFrom: null,
    movedTo: null,
    skipStatus: 'not_skipped',
    skipReason: null,
    wasSkipped: false,
    generationSource: {
      kind: generationKind,
      programType,
      templateId,
      sessionType,
    },
    lifecycle: {
      status: 'scheduled',
      isMoved: false,
      isRescheduled: false,
      isSkipped: false,
    },
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function inferAgeGroup(age) {
  if (Number.isFinite(age) && age <= 17) return 'youth';
  if (Number.isFinite(age) && age >= 55) return 'masters';
  return 'adult';
}

function normalizeGoal(value) {
  const input = String(value || '').toLowerCase().trim();
  if (['fat loss', 'fat_loss', 'weight loss'].includes(input)) return 'fat_loss';
  if (['strength', 'strength_gain'].includes(input)) return 'strength';
  if (['endurance', 'running'].includes(input)) return 'endurance';
  if (['hyrox', 'hyrox prep', 'hyrox_prep'].includes(input)) return 'hyrox_prep';
  if (['recovery', 'mobility'].includes(input)) return 'recovery';
  return 'general_fitness';
}

function normalizeLevel(value) {
  const input = String(value || '').toLowerCase().trim();
  if (['advanced'].includes(input)) return 'advanced';
  if (['intermediate'].includes(input)) return 'intermediate';
  return 'beginner';
}

function normalizeEquipmentAccess(value) {
  const input = String(value || '').toLowerCase().trim();
  if (['bodyweight', 'bodyweight-only', 'bodyweight_only'].includes(input)) return 'bodyweight';
  if (['dumbbells', 'dumbbell'].includes(input)) return 'dumbbells';
  if (['gym', 'full-gym', 'full_gym'].includes(input)) return 'gym';
  if (['treadmill'].includes(input)) return 'treadmill';
  return 'mixed';
}

function normalizeDaysPerWeek(value, programType) {
  const profile = Object.values(generatorProgramProfiles).find(item => item.canonicalProgramType === programType)
    || generatorProgramProfiles.hyrox;
  const fallback = profile.defaultDaysPerWeek || 4;
  const numeric = Number.isFinite(value) ? value : DAY_KEY_TO_NUMBER[value] || fallback;
  const supported = profile.supportedDaysPerWeek || [fallback];
  if (supported.includes(numeric)) return numeric;
  return supported.includes(fallback) ? fallback : supported[0];
}

function normalizeDuration(value, programType) {
  const profile = Object.values(generatorProgramProfiles).find(item => item.canonicalProgramType === programType)
    || generatorProgramProfiles.hyrox;
  const fallback = generatorRules.fallbacks.preferredSessionDuration || profile.defaultDuration || 40;
  const numeric = Number.isFinite(value) ? value : Number.parseInt(value, 10);
  return Number.isFinite(numeric) ? clamp(numeric, 20, 90) : fallback;
}

function normalizeLimitations(value, lowImpact) {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',').map(item => item.trim()).filter(Boolean)
      : [];
  if (lowImpact) return [...new Set([...list, 'low_impact'])];
  return list;
}

export function normalizeGeneratorProfile(profile = {}) {
  const programType = normalizeLibraryProgramType(profile.programType);
  const ageGroup = profile.ageGroup || inferAgeGroup(profile.age);
  const lowImpact = profile.lowImpact === true
    || profile.lowImpactPreference === true
    || String(profile.limitations || '').toLowerCase().includes('impact');

  return {
    programType,
    level: normalizeLevel(profile.level || profile.fitnessLevel),
    ageGroup: ['youth', 'adult', 'masters'].includes(ageGroup) ? ageGroup : generatorRules.fallbacks.ageGroup,
    goal: normalizeGoal(profile.goal || profile.primaryGoal),
    equipmentAccess: normalizeEquipmentAccess(profile.equipmentAccess || profile.equipmentMode),
    daysPerWeek: normalizeDaysPerWeek(profile.daysPerWeek || profile.trainingDays, programType),
    preferredSessionDuration: normalizeDuration(profile.preferredSessionDuration || profile.sessionDuration, programType),
    limitations: normalizeLimitations(profile.limitations || profile.injuriesOrLimitations, lowImpact),
    lowImpact,
  };
}

function buildContentFromBlocks(blocks) {
  return {
    version: 1,
    source: 'program',
    blocks: blocks.map((currentBlock) => ({
      id: currentBlock.id,
      type: currentBlock.type,
      title: currentBlock.title,
      format: currentBlock.format || null,
      duration: currentBlock.duration || null,
      repeat: currentBlock.repeat ?? null,
      notes: Array.isArray(currentBlock.notes) ? currentBlock.notes : [],
      exercises: (currentBlock.exercises || []).map((exercise, index) => ({
        id: `${currentBlock.id}-exercise-${index + 1}`,
        name: exercise.name,
        sets: exercise.sets ?? null,
        reps: exercise.reps ?? null,
        detail: [
          exercise.loadHint ? `Load: ${exercise.loadHint}` : null,
          exercise.notes || null,
        ].filter(Boolean).join(' · ') || null,
        timedEffort: exercise.duration || null,
        duration: exercise.duration || null,
        distance: exercise.distance || null,
        effort: exercise.effort || null,
        note: exercise.paceTarget ? `Pace: ${exercise.paceTarget}` : null,
      })),
    })),
    notes: [],
  };
}

function getScalingProfile(profile) {
  const levelScaling = generatorRules.scaling[profile.level] || generatorRules.scaling.beginner;
  const ageScaling = generatorRules.scaling[profile.ageGroup] || {};
  return {
    volumeMultiplier: levelScaling.volumeMultiplier * (ageScaling.volumeMultiplier || 1),
    intensityCap: ageScaling.intensityCap || levelScaling.intensityCap,
    warmupBoostMinutes: ageScaling.warmupBoostMinutes || 0,
    emphasizeSkill: profile.ageGroup === 'youth',
    preferLowImpact: profile.lowImpact || ageScaling.preferLowImpact === true,
  };
}

function adjustDurationString(value, scale) {
  const match = String(value || '').match(/^(\d+)(?:-(\d+))?\s*min$/i);
  if (!match) return value || null;
  const start = Math.max(1, Math.round(Number(match[1]) * scale));
  const end = match[2] ? Math.max(start, Math.round(Number(match[2]) * scale)) : null;
  return end ? `${start}-${end} min` : `${start} min`;
}

function scaleExercise(exercise, scale, scalingProfile) {
  const nextExercise = { ...exercise };
  if (Number.isFinite(nextExercise.sets)) {
    nextExercise.sets = Math.max(1, Math.round(nextExercise.sets * scale));
  }
  if (nextExercise.duration) {
    nextExercise.duration = adjustDurationString(nextExercise.duration, scale);
  }
  if (scalingProfile.intensityCap) {
    nextExercise.effort = nextExercise.effort && nextExercise.effort > scalingProfile.intensityCap
      ? scalingProfile.intensityCap
      : (nextExercise.effort || scalingProfile.intensityCap);
  }
  if (scalingProfile.preferLowImpact && typeof nextExercise.notes === 'string') {
    nextExercise.notes = `${nextExercise.notes} Keep impact low and shorten the range if needed.`;
  }
  return nextExercise;
}

function scaleTemplate(template, profile) {
  const scalingProfile = getScalingProfile(profile);
  const baseScale = clamp(scalingProfile.volumeMultiplier, 0.7, 1.2);
  const blocks = deepClone(template.blocks).map((currentBlock) => {
    const nextBlock = {
      ...currentBlock,
      exercises: (currentBlock.exercises || []).map(exercise => scaleExercise(exercise, baseScale, scalingProfile)),
    };
    if (currentBlock.type === 'warmup' && scalingProfile.warmupBoostMinutes > 0 && currentBlock.duration) {
      nextBlock.duration = adjustDurationString(currentBlock.duration, 1 + (scalingProfile.warmupBoostMinutes / 10));
      nextBlock.notes = [...(nextBlock.notes || []), 'Extended warm-up emphasis for recovery and tissue prep.'];
    }
    if (Number.isFinite(nextBlock.repeat)) {
      nextBlock.repeat = Math.max(1, Math.round(nextBlock.repeat * baseScale));
    }
    return nextBlock;
  });

  const coachNotes = [
    template.coachNotes,
    profile.ageGroup === 'masters' ? 'Keep the first work set conservative and earn the pace.' : null,
    profile.ageGroup === 'youth' ? 'Prioritize movement quality and stop the set before form slips.' : null,
    profile.level === 'beginner' ? 'Leave a rep or two in reserve and keep the session simple.' : null,
    profile.lowImpact ? 'Use low-impact substitutions anytime impact feels sketchy.' : null,
  ].filter(Boolean).join(' ');

  return {
    ...template,
    coachNotes,
    blocks,
    content: buildContentFromBlocks(blocks),
  };
}

function templateSupportsGoal(template, goal) {
  return template.goalTags.includes(goal) || template.goalTags.includes('general_fitness');
}

function templateSupportsAge(template, ageGroup) {
  return template.ageTags.includes(ageGroup);
}

function templateSupportsLevel(template, level) {
  return template.levelTags.includes(level) || template.levelTags.includes('beginner');
}

function templateSupportsEquipment(template, equipmentAccess) {
  return template.equipmentTags.includes(equipmentAccess)
    || template.equipmentTags.includes('mixed')
    || (equipmentAccess === 'mixed' && template.equipmentTags.length > 0);
}

function templateViolatesLimitations(template, profile) {
  if (!profile.lowImpact) return false;
  return template.contraindications.includes('high_impact_sensitive');
}

function templateSupportsDuration(template, preferredSessionDuration) {
  return preferredSessionDuration >= template.minDuration && preferredSessionDuration <= template.maxDuration;
}

function getRecoverySpacingPenalty(candidate, priorSession) {
  if (!priorSession) return 0;
  if (priorSession.intensity === 'low') return 0;
  if (candidate.intensity === 'low') return 0;
  return 15;
}

function selectWeeklyTemplate(profile) {
  const matches = weeklyTemplates.filter(template => (
    template.programType === profile.programType
    && template.daysPerWeek === profile.daysPerWeek
    && (template.goalTags.includes(profile.goal) || template.goalTags.includes('general_fitness'))
  ));
  return matches[0]
    || weeklyTemplates.find(template => template.programType === profile.programType && template.daysPerWeek === profile.daysPerWeek)
    || null;
}

function buildPrescription(template) {
  const workBlocks = template.blocks.filter(block => block.type === 'main' || block.type === 'conditioning');
  return workBlocks.map((currentBlock) => {
    const pieces = currentBlock.exercises.map((exercise) => (
      [
        exercise.name,
        exercise.sets ? `${exercise.sets} sets` : null,
        exercise.reps || exercise.duration || exercise.distance || null,
      ].filter(Boolean).join(' ')
    ));
    return `${currentBlock.title}: ${pieces.join(', ')}`;
  }).join(' | ');
}

function candidateScore(template, profile, slot, priorSessionTypes, priorSession) {
  let score = 0;
  if (templateSupportsGoal(template, profile.goal)) score += 8;
  if (templateSupportsAge(template, profile.ageGroup)) score += 6;
  if (templateSupportsLevel(template, profile.level)) score += 6;
  if (templateSupportsEquipment(template, profile.equipmentAccess)) score += 6;
  if (templateSupportsDuration(template, profile.preferredSessionDuration)) score += 4;
  if (slot.sessionTypes.includes(template.sessionType)) score += 10;
  if (slot.categories.includes(template.category)) score += 6;
  if (profile.lowImpact && template.limitations.includes('low_impact_friendly')) score += 12;
  if (priorSessionTypes.has(template.sessionType)) score -= 12;
  score -= getRecoverySpacingPenalty(template, priorSession);
  score -= Math.abs(((template.minDuration + template.maxDuration) / 2) - profile.preferredSessionDuration) / 5;
  return score;
}

function buildScheduledSession(template, profile, index) {
  const scaled = scaleTemplate(template, profile);
  const durationMinutes = clamp(
    Math.round((scaled.minDuration + scaled.maxDuration) / 2),
    20,
    90,
  );

  return {
    workoutId: `${profile.programType}_${scaled.id}_${index + 1}`,
    librarySessionId: scaled.id,
    generatedSessionMeta: buildGeneratedSessionMeta({
      templateId: scaled.id,
      programType: profile.programType,
      sessionType: scaled.sessionType,
    }),
    programType: profile.programType,
    sessionType: scaled.sessionType,
    sessionTypeCanonical: scaled.sessionType,
    category: scaled.category,
    modality: scaled.modality,
    durationMinutes,
    intensity: scaled.intensity,
    shortVersionRule: profile.level === 'beginner'
      ? 'Cut one round or 20% of total work, keep technique clean.'
      : 'Reduce total work by 20% and keep the session intent.',
    warmupTemplateId: scaled.warmupTemplateId,
    cooldownTemplateId: scaled.cooldownTemplateId,
    prescription: buildPrescription(scaled),
    coachingNote: scaled.coachNotes,
    content: scaled.content,
    structure: scaled.content.blocks.map((currentBlock, blockIndex) => ({
      blockId: currentBlock.id || `block-${blockIndex + 1}`,
      name: currentBlock.title,
      blockType: currentBlock.type,
      details: (currentBlock.exercises || []).map((exercise) => (
        [
          exercise.name,
          exercise.sets ? `${exercise.sets} sets` : null,
          exercise.reps || exercise.timedEffort || exercise.duration || exercise.distance || null,
        ].filter(Boolean).join(' ')
      )).join(', '),
      durationMinutes: Number.parseInt(currentBlock.duration, 10) || null,
      rounds: currentBlock.repeat ?? null,
    })),
  };
}

function generateLibraryBackedWeek(profile) {
  const weeklyTemplate = selectWeeklyTemplate(profile);
  if (!weeklyTemplate) {
    const fallback = sessionLibrary.find(template => template.programTypes.includes(profile.programType));
    return fallback ? [buildScheduledSession(fallback, profile, 0)] : [];
  }

  const selectedSessionTypes = new Set();
  const scheduled = [];

  weeklyTemplate.sessionSlots.forEach((slot, index) => {
    const candidates = sessionLibrary
      .filter(template => template.programTypes.includes(profile.programType))
      .filter(template => !templateViolatesLimitations(template, profile))
      .map(template => ({
        template,
        score: candidateScore(template, profile, slot, selectedSessionTypes, scheduled[scheduled.length - 1] || null),
      }))
      .sort((left, right) => right.score - left.score);

    const chosen = candidates[0]?.template
      || sessionLibrary.find(template => template.programTypes.includes(profile.programType))
      || null;

    if (!chosen) return;

    selectedSessionTypes.add(chosen.sessionType);
    scheduled.push(buildScheduledSession(chosen, profile, index));
  });

  return scheduled;
}

function adjustHyroxSession(session, profile, index) {
  const scalingProfile = getScalingProfile(profile);
  const durationMinutes = Math.max(25, Math.round((session.durationMinutes || 45) * scalingProfile.volumeMultiplier));
  const content = session.content || buildContentFromBlocks(
    (session.structure || []).map((currentBlock, blockIndex) => ({
      id: currentBlock.blockId || `block-${blockIndex + 1}`,
      type: currentBlock.blockType || (blockIndex === 0 ? 'warmup' : 'main'),
      title: currentBlock.name || `Block ${blockIndex + 1}`,
      duration: currentBlock.durationMinutes ? `${currentBlock.durationMinutes} min` : null,
      repeat: currentBlock.rounds ?? null,
      notes: currentBlock.details ? [currentBlock.details] : [],
      exercises: [
        {
          name: currentBlock.selectedMovement?.displayName || currentBlock.name || `Block ${blockIndex + 1}`,
          sets: currentBlock.rounds ?? null,
          duration: currentBlock.durationMinutes ? `${currentBlock.durationMinutes} min` : null,
          effort: scalingProfile.intensityCap,
          notes: currentBlock.details || null,
        },
      ],
    })),
  );

  return {
    ...session,
    workoutId: session.workoutId || `hyrox_generated_${index + 1}`,
    generatedSessionMeta: buildGeneratedSessionMeta({
      templateId: session.workoutId || `hyrox_generated_${index + 1}`,
      programType: 'hyrox',
      sessionType: session.sessionType || session.sessionTypeCanonical,
      generationKind: 'hyrox_generator',
    }),
    programType: 'hyrox',
    durationMinutes,
    warmupTemplateId: session.warmupTemplateId || 'hyrox_standard_v1',
    cooldownTemplateId: session.cooldownTemplateId || 'hyrox_standard_v1',
    shortVersionRule: session.shortVersionRule || 'Trim one round and keep station quality high.',
    coachingNote: [
      session.coachingNote || session.coachingNotes || '',
      profile.ageGroup === 'masters' ? 'Take full control of transitions and stay below failure.' : null,
      profile.level === 'beginner' ? 'Keep the run pace conservative so stations stay clean.' : null,
    ].filter(Boolean).join(' '),
    content,
  };
}

function buildProfileFromSettings(args = {}) {
  const fitnessSettings = args.fitnessSettings || {};
  const athlete = args.athleteProfile || {};
  return normalizeGeneratorProfile({
    programType: args.programType || fitnessSettings.programType,
    level: athlete.fitnessLevel || fitnessSettings.fitnessLevel,
    age: athlete.age,
    ageGroup: athlete.ageGroup || fitnessSettings.ageGroup,
    goal: fitnessSettings.goal || fitnessSettings.primaryGoal,
    equipmentAccess: fitnessSettings.equipmentAccess || fitnessSettings.equipmentMode,
    daysPerWeek: args.trainingDays || fitnessSettings.trainingDays,
    preferredSessionDuration: fitnessSettings.preferredSessionDuration,
    limitations: fitnessSettings.injuriesOrLimitations,
    lowImpactPreference: fitnessSettings.lowImpactPreference,
  });
}

export function generateGeneralWeeklyWorkoutSelection(args = {}) {
  const profile = buildProfileFromSettings(args);

  if (profile.programType === 'hyrox') {
    return generateHyroxWeeklyWorkoutSelection({
      ...args,
      programType: 'hyrox',
      trainingDays: `${profile.daysPerWeek}-day`,
    }).map((session, index) => adjustHyroxSession(session, profile, index));
  }

  return generateLibraryBackedWeek(profile);
}

export function generateGeneralWorkoutSchedule(args = {}) {
  const profile = buildProfileFromSettings(args);

  if (profile.programType === 'hyrox') {
    return generateHyroxWorkoutSchedule({
      ...args,
      programType: 'hyrox',
      trainingDays: `${profile.daysPerWeek}-day`,
    }).map((session, index) => adjustHyroxSession(session, profile, index));
  }

  return generateLibraryBackedWeek(profile).map((session, index) => ({
    ...session,
    slotIndex: index,
  }));
}

export function generateWorkoutWeekFromProfile(profile = {}) {
  const normalized = normalizeGeneratorProfile(profile);
  if (normalized.programType === 'hyrox') {
    return generateGeneralWorkoutSchedule({
      programType: 'hyrox',
      trainingDays: `${normalized.daysPerWeek}-day`,
      fitnessSettings: {
        ...profile,
        preferredSessionDuration: normalized.preferredSessionDuration,
        goal: normalized.goal,
      },
      athleteProfile: profile,
    });
  }
  return generateLibraryBackedWeek(normalized);
}
