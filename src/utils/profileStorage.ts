import { CellMapProfile, PlanMetadata, InjectionMode, CustomCellMapping } from '../types/plan';
import { normalizeColLetter, normalizeCoordinate, isColumnDisabled } from './fileEngine';
import { computeSeducCellMetrics } from './seducCalendarMetrics';
import { FIXED_IMMUTABLE_CELLS } from '../config/version';

function sanitizeColForSave(val: any, defaultCol: string): string {
  if (isColumnDisabled(val)) {
    return 'NONE';
  }
  const norm = normalizeColLetter(val);
  return norm || defaultCol;
}

/**
 * Resolves injection mode for custom cell mappings, ensuring 100% backward compatibility
 * for existing profiles where mode is not explicitly specified.
 * - CÉLULAS FIXAS B13, B15 E B17: Bloqueadas com texto literal fixo estrito (mode: 'literal').
 * - CÉLULAS C21:C24 E J21:J24: Instrumentos e Pesos de Avaliação oficiais (mode: 'literal').
 */
export function resolveCustomMappingMode(cm: { address?: string; label?: string; mode?: InjectionMode }): InjectionMode {
  const address = (cm.address || '').toUpperCase().trim();
  const label = (cm.label || '').trim();
  const lower = label.toLowerCase();

  // CÉLULAS FIXAS IMUTÁVEIS: B13, B15 e B17
  // Bloqueadas estritamente contra geração dinâmica por IA
  if (['B13', 'B15', 'B17'].includes(address)) {
    return 'literal';
  }

  // CÉLULAS C21:C24 E J21:J24: Instrumentos e Pesos de Avaliação
  // Tratadas ESTRITAMENTE como valores fixos / literais de avaliação oficial
  if (['C21', 'C22', 'C23', 'C24', 'J21', 'J22', 'J23', 'J24'].includes(address)) {
    return 'literal';
  }

  if (cm.mode === 'literal' || cm.mode === 'ai_prompt') {
    return cm.mode;
  }

  // If label looks like percentage, grade, short code, or fixed assessment weight
  if (/^\d+(\.\d+)?%$/.test(label) || /^(30%|20%|10%|40%|50%|60%|70%|80%|90%|100%)$/.test(label)) {
    return 'literal';
  }
  if (label.length <= 15 && (label.includes('%') || /^\d+$/.test(label))) {
    return 'literal';
  }
  // Check known instruction cells or pedagogical prompt keywords
  if (
    lower.startsWith('descrever') || 
    lower.startsWith('orientar') || 
    lower.startsWith('detalhar') || 
    lower.startsWith('elaborar') ||
    lower.includes('proposta pedagógica') ||
    (label.length > 30 && !['B13', 'B15', 'B17'].includes(address))
  ) {
    return 'ai_prompt';
  }
  // Short labels without instructional verb default to literal
  return 'literal';
}

export const DEFAULT_PROFILES: CellMapProfile[] = [
  {
    id: 'ure-taubate',
    name: 'Perfil URE Taubaté - Planejamento de Aula',
    description: 'Matriz oficial do Planejamento de Aula URE Taubaté (Colunas B, D, E, F, G, H, I com início na Linha 28, com células fixas B13, B15, B17 e avaliação C21-C24/J21-J24).',
    targetSheet: 'Planejamento Preenchido',
    startRow: 28,
    rowCount: 11,
    skipRows: [],
    columns: {
      dateWeekCol: 'B',       // Data / Semana
      skillCol: 'D',          // Habilidade / AE / Aula
      objectivesCol: 'E',     // Objetivos de Aprendizagem
      methodologyCol: 'F',    // Metodologia
      developmentCol: 'G',    // Desenvolvimento da Aula
      assessmentCol: 'H',     // Avaliação
      recoveryCol: 'I',       // Ajustes / Recuperação
    },
    headerFields: {
      teacherCell: 'D5',      // Professor(a)
      subjectCell: 'D6',      // Disciplina
      gradeCell: 'H5',        // Turma / Série
      bimestreCell: 'H6',     // Bimestre
      schoolCell: 'D4',       // Escola / URE
      diasLetivosCell: 'J7',  // Célula J7: Dias Letivos do Bimestre
      plannedClassesCell: 'J8', // Célula J8: Total de Aulas Curriculares Previstas (12 a 18)
      diasEfetivosCell: 'J9', // Célula J9: Dias Letivos Efetivos com Desconto de Eventos
    },
    plannedClasses: 18,
    classDays: [4],
    classesPerDay: 2,
    teacherSchedule: {
      classDays: [4],
      classesPerDay: 2
    },
    customCellMappings: [
      // CÉLULAS FIXAS IMUTÁVEIS B13, B15 E B17
      {
        address: 'B13',
        label: FIXED_IMMUTABLE_CELLS.B13.text,
        expectedType: 'avaliacao',
        mode: 'literal',
        isMerged: true,
        mergeRange: 'B13:I13'
      },
      {
        address: 'B15',
        label: FIXED_IMMUTABLE_CELLS.B15.text,
        expectedType: 'avaliacao',
        mode: 'literal',
        isMerged: true,
        mergeRange: 'B15:I15'
      },
      {
        address: 'B17',
        label: FIXED_IMMUTABLE_CELLS.B17.text,
        expectedType: 'recuperacao_sei',
        mode: 'literal',
        isMerged: true,
        mergeRange: 'B17:J17'
      },
      // Instrumentos e Pesos de Avaliação Oficiais (C21:C24 e J21:J24)
      { address: 'C21', label: 'Prova Paulista', expectedType: 'avaliacao', mode: 'literal' },
      { address: 'J21', label: '30%', expectedType: 'avaliacao', mode: 'literal' },
      { address: 'C22', label: 'Atividades em Sala e Caderno', expectedType: 'avaliacao', mode: 'literal' },
      { address: 'J22', label: '30%', expectedType: 'avaliacao', mode: 'literal' },
      { address: 'C23', label: 'Trabalhos e Práticas em Grupo', expectedType: 'avaliacao', mode: 'literal' },
      { address: 'J23', label: '20%', expectedType: 'avaliacao', mode: 'literal' },
      { address: 'C24', label: 'Avaliação Formativa e SEI', expectedType: 'avaliacao', mode: 'literal' },
      { address: 'J24', label: '20%', expectedType: 'avaliacao', mode: 'literal' },
    ],
    isPreset: true,
  },
  {
    id: 'seduc-padrao',
    name: 'Perfil SEDUC-SP Oficial (Guia / Plano de Ensino)',
    description: 'Matriz clássica com 4 abas bimestrais e colunas A a G a partir da linha 8.',
    targetSheet: '1º Bimestre',
    startRow: 8,
    rowCount: 9,
    columns: {
      dateWeekCol: 'A',
      skillCol: 'C',
      objectivesCol: 'E',
      methodologyCol: 'F',
      developmentCol: 'D',
      assessmentCol: 'G',
      recoveryCol: 'G',
    },
    headerFields: {
      teacherCell: 'C5',
      subjectCell: 'F3',
      gradeCell: 'F4',
      bimestreCell: 'A2',
      schoolCell: 'C4',
      diasLetivosCell: 'J7',
      plannedClassesCell: 'J8',
      diasEfetivosCell: 'J9',
    },
    customCellMappings: [
      {
        address: 'B13',
        label: FIXED_IMMUTABLE_CELLS.B13.text,
        expectedType: 'avaliacao',
        mode: 'literal'
      },
      {
        address: 'B15',
        label: FIXED_IMMUTABLE_CELLS.B15.text,
        expectedType: 'avaliacao',
        mode: 'literal'
      },
      {
        address: 'B17',
        label: FIXED_IMMUTABLE_CELLS.B17.text,
        expectedType: 'recuperacao_sei',
        mode: 'literal'
      },
      { address: 'C21', label: 'Prova Paulista', expectedType: 'avaliacao', mode: 'literal' },
      { address: 'J21', label: '30%', expectedType: 'avaliacao', mode: 'literal' },
      { address: 'C22', label: 'Atividades em Sala e Caderno', expectedType: 'avaliacao', mode: 'literal' },
      { address: 'J22', label: '30%', expectedType: 'avaliacao', mode: 'literal' },
      { address: 'C23', label: 'Trabalhos e Práticas em Grupo', expectedType: 'avaliacao', mode: 'literal' },
      { address: 'J23', label: '20%', expectedType: 'avaliacao', mode: 'literal' },
      { address: 'C24', label: 'Avaliação Formativa e SEI', expectedType: 'avaliacao', mode: 'literal' },
      { address: 'J24', label: '20%', expectedType: 'avaliacao', mode: 'literal' },
    ],
    isPreset: true,
  }
];

const LOCAL_STORAGE_KEY = 'seduc_cell_map_profiles_v1';
const ACTIVE_PROFILE_KEY = 'seduc_active_profile_id_v1';

export function sanitizeProfile(profile: any): CellMapProfile {
  if (!profile || typeof profile !== 'object') {
    return DEFAULT_PROFILES[0];
  }

  // Células Fixas Imutáveis B13, B15 e B17 e Mapeamentos obrigatórios de avaliação oficial (C21:C24 e J21:J24)
  const defaultFixedAndEvalCells = [
    { address: 'B13', label: FIXED_IMMUTABLE_CELLS.B13.text, mode: 'literal' as const, expectedType: 'avaliacao' as const },
    { address: 'B15', label: FIXED_IMMUTABLE_CELLS.B15.text, mode: 'literal' as const, expectedType: 'avaliacao' as const },
    { address: 'B17', label: FIXED_IMMUTABLE_CELLS.B17.text, mode: 'literal' as const, expectedType: 'recuperacao_sei' as const },
    { address: 'C21', label: 'Prova Paulista', mode: 'literal' as const, expectedType: 'avaliacao' as const },
    { address: 'J21', label: '30%', mode: 'literal' as const, expectedType: 'avaliacao' as const },
    { address: 'C22', label: 'Atividades em Sala e Caderno', mode: 'literal' as const, expectedType: 'avaliacao' as const },
    { address: 'J22', label: '30%', mode: 'literal' as const, expectedType: 'avaliacao' as const },
    { address: 'C23', label: 'Trabalhos e Práticas em Grupo', mode: 'literal' as const, expectedType: 'avaliacao' as const },
    { address: 'J23', label: '20%', mode: 'literal' as const, expectedType: 'avaliacao' as const },
    { address: 'C24', label: 'Avaliação Formativa e SEI', mode: 'literal' as const, expectedType: 'avaliacao' as const },
    { address: 'J24', label: '20%', mode: 'literal' as const, expectedType: 'avaliacao' as const },
  ];

  const customMappings: CustomCellMapping[] = Array.isArray(profile.customCellMappings)
    ? profile.customCellMappings.map((cm: any) => {
        const address = normalizeCoordinate(cm.address);
        let label = String(cm.label || '').trim();
        let mode = resolveCustomMappingMode({ address, label, mode: cm.mode });

        // Células B13, B15 e B17 são ESTRITAMENTE literais fixas
        if (address === 'B13') {
          mode = 'literal';
          label = FIXED_IMMUTABLE_CELLS.B13.text;
        } else if (address === 'B15') {
          mode = 'literal';
          label = FIXED_IMMUTABLE_CELLS.B15.text;
        } else if (address === 'B17') {
          mode = 'literal';
          label = FIXED_IMMUTABLE_CELLS.B17.text;
        }

        if (['C21', 'C22', 'C23', 'C24', 'J21', 'J22', 'J23', 'J24'].includes(address)) {
          mode = 'literal';
        }
        return {
          address,
          label,
          expectedType: cm.expectedType || (['C21', 'C22', 'C23', 'C24', 'J21', 'J22', 'J23', 'J24'].includes(address) ? 'avaliacao' : 'habilidade'),
          mode,
          mergeRange: cm.mergeRange,
          isMerged: !!cm.isMerged
        };
      })
    : (profile.id === 'ure-taubate' ? [...DEFAULT_PROFILES[0].customCellMappings!] : []);

  // Garante que B13, B15, B17 e as 8 células obrigatórias de avaliação estejam cadastradas no perfil
  defaultFixedAndEvalCells.forEach(defCell => {
    const existing = customMappings.find(cm => cm.address === defCell.address);
    if (!existing) {
      customMappings.push({
        address: defCell.address,
        label: defCell.label,
        expectedType: defCell.expectedType,
        mode: defCell.mode
      });
    } else {
      if (['B13', 'B15', 'B17'].includes(defCell.address)) {
        existing.label = defCell.label;
        existing.mode = 'literal';
      } else if (!existing.label) {
        existing.label = defCell.label;
      }
    }
  });

  return {
    id: String(profile.id || `profile-${Date.now()}`),
    name: String(profile.name || 'Perfil Personalizado').trim(),
    description: String(profile.description || '').trim(),
    targetSheet: String(profile.targetSheet || 'Planejamento Preenchido').trim(),
    startRow: Number(profile.startRow) >= 20 ? Number(profile.startRow) : (profile.id === 'seduc-padrao' ? 8 : 28),
    rowCount: Number(profile.rowCount) || 10,
    skipRows: Array.isArray(profile.skipRows) ? profile.skipRows.map(Number) : [],
    columns: {
      dateWeekCol: sanitizeColForSave(profile.columns?.dateWeekCol, 'B'),
      skillCol: sanitizeColForSave(profile.columns?.skillCol, 'D'),
      objectivesCol: sanitizeColForSave(profile.columns?.objectivesCol, 'E'),
      methodologyCol: sanitizeColForSave(profile.columns?.methodologyCol, 'F'),
      developmentCol: sanitizeColForSave(profile.columns?.developmentCol, 'G'),
      assessmentCol: sanitizeColForSave(profile.columns?.assessmentCol, 'H'),
      recoveryCol: sanitizeColForSave(profile.columns?.recoveryCol, 'I'),
    },
    headerFields: {
      teacherCell: normalizeCoordinate(profile.headerFields?.teacherCell || 'D5'),
      subjectCell: normalizeCoordinate(profile.headerFields?.subjectCell || 'D6'),
      gradeCell: normalizeCoordinate(profile.headerFields?.gradeCell || 'H5'),
      bimestreCell: normalizeCoordinate(profile.headerFields?.bimestreCell || 'H6'),
      schoolCell: normalizeCoordinate(profile.headerFields?.schoolCell || 'D4'),
      diasLetivosCell: normalizeCoordinate(profile.headerFields?.diasLetivosCell || 'J7'),
      plannedClassesCell: normalizeCoordinate(profile.headerFields?.plannedClassesCell || 'J8'),
      diasEfetivosCell: normalizeCoordinate(profile.headerFields?.diasEfetivosCell || 'J9'),
    },
    plannedClasses: Number(profile.plannedClasses) >= 8 ? Number(profile.plannedClasses) : 14,
    classDays: Array.isArray(profile.classDays) && profile.classDays.length > 0
      ? profile.classDays.map(Number).filter((d: number) => d >= 1 && d <= 5)
      : (Array.isArray(profile.teacherSchedule?.classDays) && profile.teacherSchedule.classDays.length > 0
        ? profile.teacherSchedule.classDays.map(Number).filter((d: number) => d >= 1 && d <= 5)
        : [4]),
    classesPerDay: Number(profile.classesPerDay) >= 1 && Number(profile.classesPerDay) <= 4
      ? Number(profile.classesPerDay)
      : (Number(profile.teacherSchedule?.classesPerDay) >= 1 && Number(profile.teacherSchedule?.classesPerDay) <= 4
        ? Number(profile.teacherSchedule.classesPerDay)
        : 2),
    teacherSchedule: {
      classDays: Array.isArray(profile.classDays) && profile.classDays.length > 0
        ? profile.classDays.map(Number).filter((d: number) => d >= 1 && d <= 5)
        : (Array.isArray(profile.teacherSchedule?.classDays) && profile.teacherSchedule.classDays.length > 0
          ? profile.teacherSchedule.classDays.map(Number).filter((d: number) => d >= 1 && d <= 5)
          : [4]),
      classesPerDay: Number(profile.classesPerDay) >= 1 && Number(profile.classesPerDay) <= 4
        ? Number(profile.classesPerDay)
        : (Number(profile.teacherSchedule?.classesPerDay) >= 1 && Number(profile.teacherSchedule?.classesPerDay) <= 4
          ? Number(profile.teacherSchedule.classesPerDay)
          : 2)
    },
    isPreset: !!profile.isPreset,
    updatedAt: profile.updatedAt,
    allowMapAnyCell: profile.allowMapAnyCell !== false,
    customCellMappings: customMappings
  };
}

export function loadAllProfiles(): CellMapProfile[] {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return DEFAULT_PROFILES.map(sanitizeProfile);
    }
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      // Initialize with defaults
      saveAllProfiles(DEFAULT_PROFILES);
      return DEFAULT_PROFILES.map(sanitizeProfile);
    }
    const saved = JSON.parse(raw) as any[];
    // Ensure default profiles are always available and all profiles are sanitized
    const merged = DEFAULT_PROFILES.map(sanitizeProfile);
    saved.forEach(sp => {
      if (!merged.some(m => m.id === sp.id)) {
        merged.push(sanitizeProfile(sp));
      }
    });
    return merged;
  } catch (err) {
    return DEFAULT_PROFILES.map(sanitizeProfile);
  }
}

export function saveAllProfiles(profiles: CellMapProfile[]) {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(profiles));
  } catch (err) {
    // ignore
  }
}

export function saveProfile(profile: CellMapProfile): CellMapProfile[] {
  const current = loadAllProfiles();
  const cleanProfile = sanitizeProfile(profile);
  const index = current.findIndex(p => p.id === cleanProfile.id);
  let updated: CellMapProfile[];
  if (index >= 0) {
    updated = [...current];
    updated[index] = { ...cleanProfile, updatedAt: new Date().toISOString() };
  } else {
    updated = [...current, { ...cleanProfile, updatedAt: new Date().toISOString() }];
  }
  saveAllProfiles(updated);
  setActiveProfileId(cleanProfile.id);
  return updated;
}

export function deleteCustomProfile(id: string): CellMapProfile[] {
  const current = loadAllProfiles();
  const filtered = current.filter(p => p.id !== id || p.isPreset);
  saveAllProfiles(filtered);
  return filtered;
}

export function getActiveProfileId(): string {
  return localStorage.getItem(ACTIVE_PROFILE_KEY) || 'ure-taubate';
}

export function setActiveProfileId(id: string) {
  try {
    localStorage.setItem(ACTIVE_PROFILE_KEY, id);
  } catch (e) {}
}

export function getActiveProfile(): CellMapProfile {
  const activeId = getActiveProfileId();
  const all = loadAllProfiles();
  return all.find(p => p.id === activeId) || DEFAULT_PROFILES[0];
}

const PLAN_METADATA_STORAGE_KEY = 'seduc_plan_header_metadata_v1';

export const DEFAULT_PLAN_METADATA: PlanMetadata = {
  school: 'EE Prof. Álvaro Ortiz',
  teacherName: 'Professor(a) Titular',
  subject: 'Educação Financeira',
  grade: '1ª Série EM',
  bimestre: '4º Bimestre',
  plannedClasses: 16,
  diasLetivos: 51,
  diasEfetivos: 47,
  directorate: 'Diretoria de Ensino - Região de Taubaté',
  year: '2026',
  classDays: [4], // Padrão Quinta-feira (bloco geminado)
  classesPerDay: 2,
  teacherSchedule: {
    classDays: [4],
    classesPerDay: 2
  }
};

export function loadPlanMetadata(): PlanMetadata {
  try {
    const raw = localStorage.getItem(PLAN_METADATA_STORAGE_KEY);
    if (!raw) return DEFAULT_PLAN_METADATA;
    const parsed = JSON.parse(raw);
    const parsedClasses = parsed.plannedClasses !== undefined ? Number(String(parsed.plannedClasses).replace(/\D+/g, '')) : 16;
    const effectiveClasses = (!isNaN(parsedClasses) && parsedClasses >= 8 && parsedClasses <= 18) ? parsedClasses : 16;
    const metrics = computeSeducCellMetrics({
      bimestre: parsed.bimestre || DEFAULT_PLAN_METADATA.bimestre,
      subject: parsed.subject || DEFAULT_PLAN_METADATA.subject,
      grade: parsed.grade || DEFAULT_PLAN_METADATA.grade,
      plannedClassesInput: effectiveClasses,
    });

    const parsedDays = Array.isArray(parsed.classDays) && parsed.classDays.length > 0
      ? parsed.classDays.map(Number).filter((d: number) => d >= 1 && d <= 5)
      : (Array.isArray(parsed.teacherSchedule?.classDays) && parsed.teacherSchedule.classDays.length > 0
        ? parsed.teacherSchedule.classDays.map(Number).filter((d: number) => d >= 1 && d <= 5)
        : [4]);

    const parsedClassesPerDay = Number(parsed.classesPerDay) >= 1 && Number(parsed.classesPerDay) <= 4
      ? Number(parsed.classesPerDay)
      : (Number(parsed.teacherSchedule?.classesPerDay) >= 1 && Number(parsed.teacherSchedule?.classesPerDay) <= 4
        ? Number(parsed.teacherSchedule.classesPerDay)
        : 2);

    return {
      school: String(parsed.school || DEFAULT_PLAN_METADATA.school).trim(),
      teacherName: String(parsed.teacherName || DEFAULT_PLAN_METADATA.teacherName).trim(),
      subject: String(parsed.subject || DEFAULT_PLAN_METADATA.subject).trim(),
      grade: String(parsed.grade || DEFAULT_PLAN_METADATA.grade).trim(),
      bimestre: String(parsed.bimestre || DEFAULT_PLAN_METADATA.bimestre).trim(),
      plannedClasses: effectiveClasses,
      diasLetivos: parsed.diasLetivos !== undefined ? parsed.diasLetivos : metrics.j7DiasLetivos,
      diasEfetivos: parsed.diasEfetivos !== undefined ? parsed.diasEfetivos : metrics.j9DiasEfetivos,
      directorate: String(parsed.directorate || DEFAULT_PLAN_METADATA.directorate || '').trim(),
      year: String(parsed.year || DEFAULT_PLAN_METADATA.year || '2026').trim(),
      classDays: parsedDays,
      classesPerDay: parsedClassesPerDay,
      teacherSchedule: {
        classDays: parsedDays,
        classesPerDay: parsedClassesPerDay
      }
    };
  } catch (err) {
    console.warn('Erro ao carregar dados do cabeçalho do localStorage:', err);
    return DEFAULT_PLAN_METADATA;
  }
}

export function savePlanMetadata(metadata: PlanMetadata) {
  try {
    localStorage.setItem(PLAN_METADATA_STORAGE_KEY, JSON.stringify(metadata));
  } catch (err) {
    console.error('Falha ao salvar dados do cabeçalho no localStorage:', err);
  }
}

