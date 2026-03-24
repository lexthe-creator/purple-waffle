export const HYROX_SCHEDULE_PHASE_TO_LIBRARY_PHASE = {
  Base: 'foundation',
  Build: 'base',
  Specificity: 'build',
  Peak: 'peak',
  Taper: 'peak',
};

export const HYROX_LIBRARY_PHASE_TO_SCHEDULE_PHASE = {
  foundation: 'Base',
  base: 'Build',
  build: 'Specificity',
  peak: 'Peak',
};

export const HYROX_PHASE_TO_LIBRARY_PHASE = {
  ...HYROX_SCHEDULE_PHASE_TO_LIBRARY_PHASE,
  foundation: 'foundation',
  base: 'base',
  build: 'build',
  peak: 'peak',
};

export const HYROX_SESSION_TYPE_COMPATIBILITY = {
  hyrox_functional: {
    canonical: 'functional',
    legacy: 'hyrox_functional',
    aliases: ['hyrox_functional', 'functional'],
  },
  hyrox_simulation: {
    canonical: 'simulation',
    legacy: 'hyrox_simulation',
    aliases: ['hyrox_simulation', 'simulation'],
  },
  functional: {
    canonical: 'functional',
    legacy: 'hyrox_functional',
    aliases: ['functional', 'hyrox_functional'],
  },
  simulation: {
    canonical: 'simulation',
    legacy: 'hyrox_simulation',
    aliases: ['simulation', 'hyrox_simulation'],
  },
};

export const HYROX_CANONICAL_SESSION_TYPES = ['functional', 'simulation'];
export const HYROX_LEGACY_SESSION_TYPES = ['hyrox_functional', 'hyrox_simulation'];

export function mapSchedulePhaseToLibraryPhase(phaseNameOrId) {
  return HYROX_PHASE_TO_LIBRARY_PHASE[phaseNameOrId] || HYROX_PHASE_TO_LIBRARY_PHASE[String(phaseNameOrId || '').trim()] || null;
}

export function mapLibraryPhaseToSchedulePhase(phaseType) {
  return HYROX_LIBRARY_PHASE_TO_SCHEDULE_PHASE[phaseType] || null;
}

export function normalizeHyroxSessionType(sessionType) {
  return HYROX_SESSION_TYPE_COMPATIBILITY[sessionType]?.canonical || null;
}

export function toLegacyHyroxSessionType(sessionType) {
  return HYROX_SESSION_TYPE_COMPATIBILITY[sessionType]?.legacy || null;
}

export function isCompatibleHyroxSessionType(sessionType) {
  return Boolean(HYROX_SESSION_TYPE_COMPATIBILITY[sessionType]);
}
