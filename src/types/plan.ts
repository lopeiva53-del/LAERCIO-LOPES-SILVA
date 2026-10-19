export type ExpectedFieldType = 
  | 'periodo' 
  | 'habilidade' 
  | 'objeto_conhecimento' 
  | 'metodologia' 
  | 'desenvolvimento_aula'
  | 'avaliacao' 
  | 'recuperacao_sei' 
  | 'identificacao';

export interface MappedField {
  id: string;
  sheet: string;
  address: string;
  row: number;
  col: number | string;
  colLetter?: string;
  section: string;
  label: string;
  expectedType: ExpectedFieldType;
  weekNumber?: number;
  bimestre?: number;
  currentValue?: string;
  confirmed: boolean;
  fillValue?: string;
  justification?: string;
  isSEI?: boolean;
  isAvaliacao?: boolean;
  isTransferred?: boolean;
  holidayReason?: string;
  isMerged?: boolean;
  mergeRange?: string;
  isMaster?: boolean;
  isExistingFilled?: boolean;
  isAutoAddedRow?: boolean;
  injectionMode?: InjectionMode;
  isImmutableFixed?: boolean;
  lessonRange?: string;
  isDisabled?: boolean;
  disabledByUser?: boolean;
  sourcePage?: number;
  sourceReference?: string;
  originalStyle?: {
    fontName?: string;
    fontSize?: number;
    bold?: boolean;
    fillColor?: string;
    fontColor?: string;
    border?: boolean;
  };
}

export type InjectionMode = 'literal' | 'ai_prompt';

export interface CustomCellMapping {
  address: string;
  label: string;
  expectedType: ExpectedFieldType;
  mode?: InjectionMode;
  mergeRange?: string;
  isMerged?: boolean;
}

export interface CellMapProfile {
  id: string;
  name: string;
  description: string;
  targetSheet: string;
  startRow: number;
  rowCount: number;
  skipRows?: number[];
  columns: {
    dateWeekCol: string;        // e.g. "B" (Data/Semana)
    skillCol: string;           // e.g. "D" (Habilidade / AE / Aula)
    objectivesCol: string;      // e.g. "E" (Objetivos de Aprendizagem)
    methodologyCol: string;     // e.g. "F" (Metodologia)
    developmentCol: string;     // e.g. "G" (Desenvolvimento da Aula)
    assessmentCol: string;      // e.g. "H" (Avaliação)
    recoveryCol: string;        // e.g. "I" (Ajustes / Recuperação)
  };
  headerFields: {
    teacherCell?: string;       // e.g. "D5"
    subjectCell?: string;       // e.g. "D6"
    gradeCell?: string;         // e.g. "H5"
    bimestreCell?: string;      // e.g. "H6"
    schoolCell?: string;        // e.g. "D4"
    diasLetivosCell?: string;   // e.g. "J7" (Dias Letivos do Bimestre)
    plannedClassesCell?: string;// e.g. "J8" (Total de Aulas Curriculares Previstas: 12 a 14)
    diasEfetivosCell?: string;  // e.g. "J9" (Dias Letivos Efetivos com Desconto de Eventos)
  };
  plannedClasses?: number;      // Teto de aulas do bimestre (12 a 14)
  classDays?: number[];         // Dias da semana com aula: 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex (ex: [4] = Quintas)
  classesPerDay?: number;       // Aulas por dia: 1, 2 (bloco geminado), 3
  teacherSchedule?: TeacherClassSchedule;
  isPreset?: boolean;
  updatedAt?: string;
  allowMapAnyCell?: boolean;
  customCellMappings?: CustomCellMapping[];
}

export interface TeacherClassSchedule {
  classDays: number[];          // Dias da semana: 1 (Segunda) a 5 (Sexta)
  classesPerDay: number;        // Aulas por dia lecionado (1, 2=geminado, 3)
  classesPerDayMap?: Record<number, number>;
}

export interface ScopeSkill {
  id: string;
  bimestre: number;
  week: number;
  code: string;
  description: string;
  objectOfKnowledge: string;
  estimatedClasses: number;
  unit: string;
  subject?: string;
  learningObjectives?: string;  // Coluna E: Objetivos de Aprendizagem
  methodology?: string;         // Coluna F: Estratégia de Ensino / Metodologia
  stepByStep?: string;          // Coluna G: Passo a Passo / Desenvolvimento Prático
  assessment?: string;          // Coluna H: Avaliação Formativa / Instrumento
  recovery?: string;            // Coluna I: Recuperação Contínua / Nivelamento
  lessonRange?: string;         // Ex: "Aula 1 e 2"
  sourcePage?: number;          // Página do documento PDF de onde a habilidade foi extraída
  sourceReference?: string;     // Ex: "Aulas 1 e 2 • Pág. 42 do Guia Priorizado"
}

export interface CalendarEvent {
  date: string;
  description: string;
  type: 'feriado' | 'recesso' | 'planejamento' | 'sei' | 'avaliacao_estadual' | 'conselho' | 'letivo';
  bimestre: number;
}

export interface CalendarSummary {
  year: number;
  totalSchoolDays: number;
  bimestres: {
    bimestre: number;
    periodo: string;
    startDate?: string;
    endDate?: string;
    diasLetivos: number;
    diasEfetivos?: number;
    feriadosRecessos: number;
    semanaSEI: string;
    semanaAvaliacao: string;
  }[];
  holidaysAndBreaks: { date: string; name: string; type?: string }[];
  isAutoExtracted?: boolean;
  extractedSource?: string;
}

export type Slot2DocMode = 'scope_only' | 'guide_pdf_only' | 'both';

export interface PrioritizedGuideSkill {
  code: string;
  description: string;
  objectOfKnowledge?: string;
  isPrioritary: boolean;
  descriptor?: string;
  pedagogicalFocus?: string;
  bimestre?: number;
  subject?: string;
  lessonRange?: string;
  sourcePage?: number;
  sourceReference?: string;
}

export interface UploadedSlotFile {
  file: File | null;
  name: string;
  size: number;
  format: 'xlsx' | 'docx' | 'pdf' | 'csv' | 'image' | 'unknown';
  status: 'empty' | 'loading' | 'ready' | 'error';
  errorMessage?: string;
  dataBuffer?: ArrayBuffer;
  summary?: string;
}

export interface PlanMetadata {
  school: string;          // Unidade Escolar (ex: EE Prof. Álvaro Ortiz)
  teacherName: string;     // Professor(a) (ex: nome do docente)
  subject: string;         // Componente Curricular / Disciplina (ex: Matemática, Química)
  grade: string;           // Turma / Série (ex: 9º Ano A, 1ª Série EM)
  bimestre: string;        // 1º Bimestre, 2º Bimestre, 3º Bimestre, 4º Bimestre
  plannedClasses?: number | string; // Célula J8: Carga real de aulas previstas (12 a 14)
  diasLetivos?: number | string;    // Célula J7: Dias Letivos do Bimestre
  diasEfetivos?: number | string;   // Célula J9: Dias Letivos Efetivos com Desconto de Eventos
  directorate?: string;    // Diretoria de Ensino (opcional)
  year?: string;           // Ano letivo (opcional)
  classDays?: number[];    // Dias da semana com aula: [1..5], padrão [4] (Quintas)
  classesPerDay?: number;  // Aulas por dia: 1, 2 (bloco geminado), 3
  teacherSchedule?: TeacherClassSchedule;
}
