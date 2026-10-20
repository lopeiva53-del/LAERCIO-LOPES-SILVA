import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import PizZip from 'pizzip';
import { PDFDocument } from 'pdf-lib';
import { MappedField, ScopeSkill, CalendarSummary, CellMapProfile, PlanMetadata, InjectionMode, CustomCellMapping } from '../types/plan';
import { SAMPLE_SCOPE_SKILLS, SAMPLE_CALENDAR_DATA } from './seducTemplates';
import { resolveCustomMappingMode } from './profileStorage';
import { 
  computeSeducCellMetrics, 
  scanBimestreWeekdays, 
  SEDUC_2025_BIMESTRES, 
  getSeducWeekPeriodText, 
  getTeacherAllocatedWeekInfo,
  generateTeacherClassSchedule,
  generateSeducWeeklySchedule,
  getSeducBimestreDetails,
  getOfficialSeducHolidays,
  detectAcademicYear,
  normalizeDateKey
} from './seducCalendarMetrics';
import { FIXED_IMMUTABLE_CELLS } from '../config/version';

export interface SheetRowPreview {
  rowNum: number;
  isInstructionOrHeader: boolean;
  cells: Array<{
    col: string;
    address: string;
    text: string;
    fillColor: string;
    bold: boolean;
    isMerged: boolean;
    masterAddress: string;
    mergeRange?: string;
    isMaster: boolean;
  }>;
}

export interface WorkbookInspection {
  sheetNames: string[];
  defaultSheet: string;
  previews: Record<string, SheetRowPreview[]>;
}

export interface ProfileMappingResult {
  fields: MappedField[];
  workbookInstance: ExcelJS.Workbook;
  activeSheet: string;
  sheetNames: string[];
  summary: {
    totalFields: number;
    rowsConfigured: number;
    startRow: number;
    endRow: number;
    columnsUsed: string[];
    skippedRows: number[];
    mergedCellsCount: number;
  };
}

/**
 * Extracts clean string text from an ExcelJS cell
 */
export function getExcelCellText(cell: ExcelJS.Cell): string {
  if (cell.value === null || cell.value === undefined) return '';
  if (typeof cell.value === 'string') return cell.value;
  if (typeof cell.value === 'number' || typeof cell.value === 'boolean') return String(cell.value);
  if (cell.value instanceof Date) return cell.value.toLocaleDateString('pt-BR');
  if (typeof cell.value === 'object') {
    const val = cell.value as any;
    if (Array.isArray(val.richText)) {
      return val.richText.map((r: any) => r.text || '').join('');
    }
    if (val.text !== undefined) return String(val.text);
    if (val.result !== undefined) return String(val.result);
  }
  return String(cell.text || '');
}

/**
 * Extracts hex fill color from an ExcelJS cell
 */
export function getCellFillColor(cell: ExcelJS.Cell): string {
  if (cell.fill && cell.fill.type === 'pattern' && cell.fill.fgColor) {
    const fg = cell.fill.fgColor as any;
    if (fg.argb) {
      return `#${fg.argb.slice(-6)}`;
    }
  }
  return '#FFFFFF';
}

/**
 * Safely converts any column representation (letter "B", number 2, numeric string "2", or object)
 * to an uppercase column letter ("B").
 * Ensures that if col is a column index number (e.g. 2 for B, 4 for D) or an object,
/**
 * Checks if a column is configured as disabled/blank ("" or "NONE").
 */
export function isColumnDisabled(col: any): boolean {
  if (col === null || col === undefined) return false;
  if (typeof col === 'object') {
    if (col.colLetter !== undefined) return isColumnDisabled(col.colLetter);
    if (col.col !== undefined) return isColumnDisabled(col.col);
    if (col.value !== undefined) return isColumnDisabled(col.value);
  }
  const str = String(col || '').trim().toUpperCase();
  return str === '' || str === 'NONE' || str === 'VAZIO' || str === 'DESATIVADA';
}

export const DEFAULT_COLUMN_BY_KEY: Record<string, string> = {
  dateWeekCol: 'B',
  skillCol: 'D',
  objectivesCol: 'E',
  methodologyCol: 'F',
  developmentCol: 'G',
  assessmentCol: 'H',
  recoveryCol: 'I'
};

export function normalizeColLetter(col: any): string {
  if (col === null || col === undefined) return '';
  if (typeof col === 'number') {
    return colNumberToLetter(col);
  }
  if (typeof col === 'object') {
    if (col.colLetter !== undefined) return normalizeColLetter(col.colLetter);
    if (col.col !== undefined) return normalizeColLetter(col.col);
    if (col.letter !== undefined) return normalizeColLetter(col.letter);
    if (col.address !== undefined) {
      const addrStr = String(col.address || '').trim().toUpperCase();
      return normalizeColLetter(addrStr.replace(/\d+/g, ''));
    }
    if (col.name !== undefined) return normalizeColLetter(col.name);
    if (col.value !== undefined) return normalizeColLetter(col.value);
  }
  const str = String(col || '').trim().toUpperCase();
  if (!str || str === 'NONE' || str === 'VAZIO' || str === 'DESATIVADA') return '';
  if (/^\d+$/.test(str)) {
    const parsedNum = parseInt(str, 10);
    return colNumberToLetter(parsedNum);
  }
  const lettersOnly = str.replace(/[^A-Z]/g, '');
  if (lettersOnly === 'NONE') return '';
  return lettersOnly || str;
}

/**
 * Safely converts any cell address or coordinate (e.g. "B16", "b16", 16, or object)
 * to a clean trimmed uppercase address.
 */
export function normalizeCoordinate(coord: any): string {
  if (coord === null || coord === undefined) return '';
  if (typeof coord === 'object') {
    if (coord.address !== undefined) return String(coord.address || '').trim().toUpperCase();
    if (coord.masterAddress !== undefined) return String(coord.masterAddress || '').trim().toUpperCase();
    if (coord.col !== undefined && coord.row !== undefined) {
      const colLetter = normalizeColLetter(coord.col);
      const rowNum = String(coord.row || '').trim();
      return `${colLetter}${rowNum}`.trim().toUpperCase();
    }
  }
  return String(coord || '').trim().toUpperCase();
}

/**
 * Converts column letter (e.g. "B") or column number (e.g. 2) to 1-based number (2)
 */
export function colLetterToNumber(col: any): number {
  if (col === null || col === undefined) return 1;
  if (typeof col === 'number') return col || 1;
  const upper = normalizeColLetter(col);
  if (!upper) return 1;
  let num = 0;
  for (let i = 0; i < upper.length; i++) {
    num = num * 26 + (upper.charCodeAt(i) - 64);
  }
  return num || 1;
}

/**
 * Converts 1-based column number (2) to column letter ("B")
 */
export function colNumberToLetter(num: any): string {
  const n = typeof num === 'number' ? num : parseInt(String(num || '1'), 10);
  if (isNaN(n) || n <= 0) return 'A';
  let s = '';
  let temp = n;
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    s = String.fromCharCode(65 + mod) + s;
    temp = Math.floor((temp - mod) / 26);
  }
  return s || 'A';
}

/**
 * Accurately extracts merge information for any cell
 */
export function getCellMergeInfo(cell: ExcelJS.Cell, worksheet: ExcelJS.Worksheet): {
  isMerged: boolean;
  masterAddress: string;
  mergeRange?: string;
  isMaster: boolean;
} {
  if (!cell.isMerged) {
    return { isMerged: false, masterAddress: cell.address, isMaster: true };
  }

  const master = cell.master || cell;
  const masterAddress = master.address;
  const isMaster = cell.address === masterAddress;

  // Look up range in worksheet._merges if available
  let mergeRange: string | undefined;
  const merges = (worksheet as any)._merges;
  if (merges) {
    for (const key of Object.keys(merges)) {
      const m = merges[key];
      if (typeof key === 'string' && (key.includes(masterAddress) || key.includes(cell.address))) {
        mergeRange = key;
        break;
      }
      if (m && typeof m.model === 'string' && (m.model.includes(masterAddress) || m.model.includes(cell.address))) {
        mergeRange = m.model;
        break;
      }
    }
  }

  return {
    isMerged: true,
    masterAddress,
    mergeRange: mergeRange || `${masterAddress} (Mesclada)`,
    isMaster
  };
}

/**
 * Inspects uploaded workbook for the Training / Setup Wizard
 * Captures all rows, cells, and merged cell relationships without blocking anything
 */
export async function inspectWorkbook(fileBuffer: ArrayBuffer): Promise<WorkbookInspection> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);

  const sheetNames: string[] = [];
  const previews: Record<string, SheetRowPreview[]> = {};

  workbook.eachSheet((worksheet) => {
    sheetNames.push(worksheet.name);
    const rowPreviews: SheetRowPreview[] = [];

    // Preview rows 1 to 60 to ensure rows 28+ and beyond are fully visible for training
    const maxScanRow = Math.min(65, Math.max(worksheet.rowCount || 0, 45));
    for (let r = 1; r <= maxScanRow; r++) {
      const row = worksheet.getRow(r);
      const cells: SheetRowPreview['cells'] = [];
      let isInstOrHdr = false;

      // Scan columns A through M
      const colsToScan = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
      colsToScan.forEach(colLetter => {
        const cell = row.getCell(colLetter);
        const text = getExcelCellText(cell).trim();
        const lower = text.toLowerCase();
        if (
          lower.includes('instrução') || lower.includes('instrucao') ||
          lower.includes('habilidade') || lower.includes('governo') ||
          lower.includes('diretoria') || lower.includes('metodologia') ||
          lower.includes('avaliação')
        ) {
          isInstOrHdr = true;
        }

        // Célula B17 (Intervenções Pedagógicas / Recuperação Contínua) NUNCA é instrução ou rótulo fixo intocável!
        // É tratada estritamente como campo editável de preenchimento dinâmico.
        if ((colLetter === 'B' && r === 17) || lower.includes('interven') || lower.includes('recuperacao continua') || lower.includes('recuperação contínua')) {
          isInstOrHdr = false;
        }

        const mergeInfo = getCellMergeInfo(cell, worksheet);

        cells.push({
          col: colLetter,
          address: `${colLetter}${r}`,
          text,
          fillColor: getCellFillColor(cell),
          bold: !!cell.font?.bold,
          isMerged: mergeInfo.isMerged,
          masterAddress: mergeInfo.masterAddress,
          mergeRange: mergeInfo.mergeRange,
          isMaster: mergeInfo.isMaster
        });
      });

      rowPreviews.push({
        rowNum: r,
        isInstructionOrHeader: isInstOrHdr,
        cells
      });
    }

    previews[worksheet.name] = rowPreviews;
  });

  // Pick default sheet: prefer "Planejamento Preenchido", or first sheet
  const defaultSheet = sheetNames.find(s => s.toLowerCase().includes('planejamento')) || sheetNames[0] || 'Planilha1';

  return {
    sheetNames,
    defaultSheet,
    previews
  };
}

/**
 * Apura dinamicamente o número exato de aulas a partir da ementa do Slot 2 (Escopo e Sequência)
 * para o componente e bimestre selecionados, sem utilizar valor fixo.
 */
export function computeSlot2DynamicClasses(
  scopeSkills?: ScopeSkill[],
  planMetadata?: PlanMetadata
): number {
  const bimNum = planMetadata?.bimestre ? extractBimestreNumber(planMetadata.bimestre) : 4;
  const targetSubject = normalizeTextClean(planMetadata?.subject || '');

  if (Array.isArray(scopeSkills) && scopeSkills.length > 0) {
    const validSkills = scopeSkills.filter(s => {
      const b = typeof s.bimestre === 'number' ? s.bimestre : extractBimestreNumber(String(s.bimestre || ''));
      if (bimNum > 0 && b > 0 && b !== bimNum) return false;
      if (targetSubject && s.subject) {
        const sSub = normalizeTextClean(s.subject);
        if (sSub && !sSub.includes(targetSubject) && !targetSubject.includes(sSub)) return false;
      }
      return true;
    });

    const activeSkills = validSkills.length > 0 ? validSkills : scopeSkills;

    // 1. Varredura do maior número de aula explícito no texto das habilidades (ex: "Aula 17 e 18" -> 18)
    let maxLessonFound = 0;
    activeSkills.forEach(s => {
      const textToScan = `${s.lessonRange || ''} ${s.sourceReference || ''} ${s.description || ''}`;
      const lessonMatches = textToScan.match(/\b(?:aula|aulas)\s*(\d+)(?:\s*(?:e|a|-|à)\s*(\d+))?/gi);
      if (lessonMatches) {
        lessonMatches.forEach(m => {
          const digits = m.match(/\d+/g);
          if (digits) {
            digits.forEach(d => {
              const num = parseInt(d, 10);
              if (!isNaN(num) && num < 100 && num > maxLessonFound) {
                maxLessonFound = num;
              }
            });
          }
        });
      }
    });

    if (maxLessonFound > 0) {
      return maxLessonFound;
    }

    // 2. Soma de estimatedClasses se informado na ementa
    const sumEstimated = activeSkills.reduce((acc, s) => {
      const est = typeof s.estimatedClasses === 'number' ? s.estimatedClasses : parseInt(String(s.estimatedClasses || '0'), 10);
      return acc + (!isNaN(est) && est > 0 ? est : 0);
    }, 0);

    if (sumEstimated > 0) {
      return sumEstimated;
    }

    // 3. Contagem dos blocos de aula regulares (desconsiderando conselho) * 2
    const regularBlocks = activeSkills.filter(s => {
      const code = String(s.code || '').toUpperCase();
      const desc = String(s.description || '').toLowerCase();
      return !code.includes('CONSELHO') && !desc.includes('conselho');
    });

    if (regularBlocks.length > 0) {
      return regularBlocks.length * 2;
    }
  }

  // Fallback quando não há habilidades carregadas no Slot 2
  if (planMetadata?.plannedClasses !== undefined && planMetadata?.plannedClasses !== null && planMetadata?.plannedClasses !== '') {
    const parsed = parseInt(String(planMetadata.plannedClasses).replace(/\D+/g, ''), 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 18;
}

/**
 * STRICT CELL-MAP ENGINE:
 * Builds fields based on trained Cell-Map Profile coordinates and custom mapped cells.
 * Perfectly maps merged cells (pointing to the master cell) and NEVER blocks any cell.
 */
export async function buildFieldsFromCellMapProfile(
  fileBuffer: ArrayBuffer,
  profile: CellMapProfile,
  planMetadata?: PlanMetadata,
  calendarData?: CalendarSummary,
  scopeSkills?: ScopeSkill[]
): Promise<ProfileMappingResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);

  const sheetNames: string[] = [];
  workbook.eachSheet(ws => sheetNames.push(ws.name));

  // Find target sheet (exact match or closest)
  let worksheet = workbook.getWorksheet(profile.targetSheet);
  if (!worksheet) {
    const match = workbook.worksheets.find(ws => 
      ws.name.toLowerCase() === profile.targetSheet.toLowerCase() ||
      ws.name.toLowerCase().includes('planejamento') ||
      ws.name.toLowerCase().includes('bimestre')
    );
    worksheet = match || workbook.worksheets[0];
  }

  if (!worksheet) {
    throw new Error(`Aba ${profile.targetSheet} não encontrada no arquivo.`);
  }

  const fields: MappedField[] = [];
  const skipRowsSet = new Set(profile.skipRows || []);
  let mergedCellsCount = 0;

  // 1. Calculate and map strict SEDUC-SP metrics for cells J7, J8, and J9:
  // J7: Dias Letivos do Bimestre (Calendário SEDUC Slot 3 descontando sábados, domingos, feriados, pontes e recessos)
  // J8: Total de Aulas do Escopo Apurado (Slot 2, apuração dinâmica integral da ementa sem valor fixo)
  // J9: Dias Letivos Efetivos com Desconto de Eventos (J7 menos Reuniões de Planejamento, Conselhos, Provas exclusivas e Feiras)
  const dynamicJ8 = computeSlot2DynamicClasses(scopeSkills, planMetadata);
  const cellMetrics = computeSeducCellMetrics({
    bimestre: planMetadata?.bimestre,
    subject: planMetadata?.subject,
    grade: planMetadata?.grade,
    plannedClassesInput: planMetadata?.plannedClasses || dynamicJ8,
    scopeSkills: scopeSkills,
    calendarData: calendarData,
    year: planMetadata?.year || calendarData?.year
  });

  const effectivePlannedClasses = dynamicJ8 || cellMetrics.j8AulasPrevistas;
  const effectiveWeeks = Math.ceil(effectivePlannedClasses / 2);
  const diasLetivosJ7 = cellMetrics.j7DiasLetivos;
  const diasEfetivosJ9 = cellMetrics.j9DiasEfetivos;

  // 1. Map Fixed Header Identification Cells including J7, J8, and J9
  const headerConfigs = [
    { key: 'schoolCell', label: 'Unidade Escolar', type: 'identificacao' as const, field: profile.headerFields?.schoolCell, manualVal: planMetadata?.school },
    { key: 'teacherCell', label: 'Professor(a) Responsável', type: 'identificacao' as const, field: profile.headerFields?.teacherCell, manualVal: planMetadata?.teacherName },
    { key: 'subjectCell', label: 'Componente Curricular / Disciplina', type: 'identificacao' as const, field: profile.headerFields?.subjectCell, manualVal: planMetadata?.subject },
    { key: 'gradeCell', label: 'Turma / Série', type: 'identificacao' as const, field: profile.headerFields?.gradeCell, manualVal: planMetadata?.grade },
    { key: 'bimestreCell', label: 'Bimestre Letivo', type: 'identificacao' as const, field: profile.headerFields?.bimestreCell, manualVal: planMetadata?.bimestre },
    { key: 'diasLetivosCell', label: 'Dias Letivos do Bimestre (J7)', type: 'identificacao' as const, field: profile.headerFields?.diasLetivosCell || 'J7', manualVal: String(planMetadata?.diasLetivos || diasLetivosJ7) },
    { key: 'plannedClassesCell', label: 'Total de Aulas do Escopo Apurado (J8)', type: 'identificacao' as const, field: profile.headerFields?.plannedClassesCell || 'J8', manualVal: String(effectivePlannedClasses) },
    { key: 'diasEfetivosCell', label: 'Dias Letivos Efetivos com Desconto de Eventos (J9)', type: 'identificacao' as const, field: profile.headerFields?.diasEfetivosCell || 'J9', manualVal: String(planMetadata?.diasEfetivos || diasEfetivosJ9) },
  ];

  headerConfigs.forEach(hc => {
    const addr = normalizeCoordinate(hc.field);
    if (addr) {
      const cell = worksheet.getCell(addr);
      const mergeInfo = getCellMergeInfo(cell, worksheet);
      if (mergeInfo.isMerged) mergedCellsCount++;

      // Always write to the master cell address so Excel renders it properly
      const targetAddress = normalizeCoordinate(mergeInfo.masterAddress || addr);
      const targetCell = worksheet.getCell(targetAddress);

      const rowNum = Number(targetCell.row);
      const colLetter = normalizeColLetter(targetCell.col || targetAddress.replace(/\d+/g, ''));
      const colNum = colLetterToNumber(colLetter);

      const manualVal = hc.manualVal !== undefined && hc.manualVal !== '' ? String(hc.manualVal).trim() : '';
      const existingText = getExcelCellText(targetCell);
      const valToUse = manualVal || existingText;

      fields.push({
        id: `HDR_${hc.key}_${targetAddress}`,
        sheet: worksheet.name,
        address: targetAddress,
        row: rowNum,
        col: colNum,
        colLetter,
        section: 'Cabeçalho de Identificação',
        label: hc.label,
        expectedType: hc.type,
        confirmed: true,
        currentValue: valToUse,
        fillValue: valToUse,
        isMerged: mergeInfo.isMerged,
        mergeRange: mergeInfo.mergeRange,
        isMaster: mergeInfo.isMaster,
        originalStyle: {
          fontName: targetCell.font?.name || 'Calibri',
          fontSize: targetCell.font?.size || 10,
          bold: targetCell.font?.bold || false,
          fillColor: getCellFillColor(targetCell),
          border: !!targetCell.border
        }
      });
    }
  });

  // 2. Map Weekly Lesson Grid (strictly starting at profile.startRow and capped at effectiveWeeks)
  const columnsUsed: string[] = [];
  const colMap = [
    { key: 'dateWeekCol', rawCol: profile.columns?.dateWeekCol, label: 'Data / Semana', type: 'periodo' as const },
    { key: 'skillCol', rawCol: profile.columns?.skillCol, label: 'Habilidade / AE / Aula', type: 'habilidade' as const },
    { key: 'objectivesCol', rawCol: profile.columns?.objectivesCol, label: 'Objetivos de Aprendizagem', type: 'objeto_conhecimento' as const },
    { key: 'methodologyCol', rawCol: profile.columns?.methodologyCol, label: 'Metodologia', type: 'metodologia' as const },
    { key: 'developmentCol', rawCol: profile.columns?.developmentCol, label: 'Desenvolvimento da Aula (Passo a Passo)', type: 'desenvolvimento_aula' as const },
    { key: 'assessmentCol', rawCol: profile.columns?.assessmentCol, label: 'Avaliação da Aprendizagem', type: 'avaliacao' as const },
    { key: 'recoveryCol', rawCol: profile.columns?.recoveryCol, label: 'Ajustes Pedagógicos / Recuperação (SEI)', type: 'recuperacao_sei' as const },
  ];

  colMap.forEach(c => {
    const colLet = normalizeColLetter(c.rawCol);
    if (colLet && !columnsUsed.includes(colLet)) {
      columnsUsed.push(colLet);
    }
  });

  const startRow = Number(profile.startRow) || 16;
  const rowCount = Math.max(Number(profile.rowCount) || 11, effectiveWeeks, 11); // Suporte integral a 11 semanas letivas
  const endRow = startRow + rowCount - 1;

  const activeBimNum = planMetadata?.bimestre ? extractBimestreNumber(planMetadata.bimestre) : 1;

  for (let r = startRow; r <= endRow; r++) {
    // Only skip if explicitly in skipRows
    if (skipRowsSet.has(r)) {
      continue;
    }

    const weekNum = (r - startRow) + 1;
    const isSEI = (weekNum === 10);
    const isClosing = (weekNum === 11);
    const isAval = (weekNum === 9);

    colMap.forEach(cm => {
      const isDisabled = isColumnDisabled(cm.rawCol);
      const colLetter = isDisabled ? (DEFAULT_COLUMN_BY_KEY[cm.key] || '') : normalizeColLetter(cm.rawCol);
      if (!colLetter) return;

      const addr = `${colLetter}${r}`;
      const cell = worksheet.getCell(addr);
      const mergeInfo = getCellMergeInfo(cell, worksheet);
      if (mergeInfo.isMerged) mergedCellsCount++;

      // Target the master address if merged
      const targetAddress = normalizeCoordinate(mergeInfo.masterAddress || addr);
      const targetCell = worksheet.getCell(targetAddress);
      const val = getExcelCellText(targetCell);

      const fieldId = `GRID_${colLetter}${r}`;
      // Avoid duplicate field IDs if already mapped
      if (!fields.some(f => f.id === fieldId)) {
        if (isDisabled) {
          // Disabled / Empty column: tracked for audit/preview but ignored by Gemini and injection engine
          fields.push({
            id: fieldId,
            sheet: worksheet.name,
            address: targetAddress,
            row: r,
            col: colLetterToNumber(colLetter),
            colLetter,
            section: `Semana ${weekNum} (Linha ${r})`,
            label: `${cm.label} (Col ${colLetter})`,
            expectedType: cm.type,
            weekNumber: weekNum,
            bimestre: activeBimNum,
            currentValue: val || '(Não preenchida / Desativada pelo usuário)',
            fillValue: '',
            confirmed: true,
            isDisabled: true,
            disabledByUser: true,
            isSEI,
            isAvaliacao: isAval,
            isMerged: mergeInfo.isMerged,
            mergeRange: mergeInfo.mergeRange,
            isMaster: mergeInfo.isMaster,
            originalStyle: {
              fontName: targetCell.font?.name || 'Calibri',
              fontSize: targetCell.font?.size || 10,
              bold: false,
              fillColor: getCellFillColor(targetCell),
              border: !!targetCell.border
            }
          });
          return;
        }

        const isDateCol = colLetter === 'B' || colLetter === normalizeColLetter(profile.columns?.dateWeekCol) || cm.key === 'dateWeekCol' || cm.type === 'periodo';
        const teacherSchedConfig = {
          classDays: planMetadata?.classDays || profile.classDays || profile.teacherSchedule?.classDays,
          classesPerDay: planMetadata?.classesPerDay || profile.classesPerDay || profile.teacherSchedule?.classesPerDay,
          plannedClasses: Number(planMetadata?.plannedClasses || profile.plannedClasses || 14),
          rowCount: profile.rowCount
        };
        const effectiveYear = (planMetadata?.year ? parseInt(String(planMetadata.year), 10) : undefined) || calendarData?.year || 2026;
        const weekAllocInfo = getTeacherAllocatedWeekInfo(weekNum, activeBimNum, profile.rowCount, calendarData, effectiveYear, teacherSchedConfig);
        const computedWeekDate = isDateCol ? (weekAllocInfo?.fullDateText || getSeducWeekPeriodText(weekNum, activeBimNum, isSEI, isAval, profile.rowCount, calendarData, effectiveYear, teacherSchedConfig)) : undefined;

        const isSuspension = weekAllocInfo?.status === 'suspension';
        const eventName = weekAllocInfo?.holidayReason || 'Dia do Professor';
        let suspensionFill: string | undefined = undefined;
        if (isSuspension) {
          if (isDateCol || colLetter === 'B') {
            suspensionFill = weekAllocInfo?.fullDateText || `Semana ${weekNum} (${weekAllocInfo?.datesText || '15/10/2026'}) - ${eventName} [Suspensão de Aulas]`;
          } else if (colLetter === 'D' || cm.key === 'skillCol') {
            suspensionFill = 'Evento Oficial / Suspensão de Aulas';
          } else if (colLetter === 'E' || cm.key === 'objectivesCol') {
            suspensionFill = 'Sem expediente pedagógico presencial conforme calendário escolar oficial SEDUC-SP.';
          } else if (colLetter === 'G' || cm.key === 'developmentCol' || cm.key === 'methodologyCol') {
            suspensionFill = `Suspensão das atividades letivas em virtude de ${eventName}. Conteúdo didático reprogramado para o próximo encontro letivo.`;
          } else if (colLetter === 'I' || cm.key === 'recoveryCol') {
            suspensionFill = '-';
          } else {
            suspensionFill = '-';
          }
        }

        fields.push({
          id: fieldId,
          sheet: worksheet.name,
          address: targetAddress,
          row: r,
          col: colLetterToNumber(colLetter),
          colLetter,
          section: `Semana ${weekNum} (Linha ${r})`,
          label: `${cm.label} (Col ${colLetter})`,
          expectedType: cm.type,
          weekNumber: weekNum,
          bimestre: activeBimNum,
          currentValue: isSuspension ? suspensionFill : ((val && !val.toLowerCase().includes('sábado')) ? val : (computedWeekDate || val)),
          fillValue: isSuspension ? suspensionFill : (computedWeekDate || undefined),
          confirmed: true,
          isDisabled: false,
          disabledByUser: false,
          isSEI: weekAllocInfo?.isSEI !== undefined ? weekAllocInfo.isSEI : isSEI,
          isAvaliacao: weekAllocInfo?.isAvaliacao !== undefined ? weekAllocInfo.isAvaliacao : isAval,
          isTransferred: isSuspension || weekAllocInfo?.isTransferred || false,
          holidayReason: weekAllocInfo?.holidayReason,
          isMerged: mergeInfo.isMerged,
          mergeRange: mergeInfo.mergeRange,
          isMaster: mergeInfo.isMaster,
          originalStyle: {
            fontName: targetCell.font?.name || 'Calibri',
            fontSize: targetCell.font?.size || 10,
            bold: isSEI || colLetter === normalizeColLetter(profile.columns?.dateWeekCol) || colLetter === normalizeColLetter(profile.columns?.skillCol),
            fillColor: isSuspension ? '#FEE2E2' : getCellFillColor(targetCell),
            border: !!targetCell.border
          }
        });
      }
    });
  }

  // 3. Map any Custom Mapped Cells (freely added by the user clicking or typing any coordinate!)
  if (profile.customCellMappings && profile.customCellMappings.length > 0) {
    profile.customCellMappings.forEach((cm, idx) => {
      const addr = normalizeCoordinate(cm.address);
      if (!addr) return;
      const cell = worksheet.getCell(addr);
      const mergeInfo = getCellMergeInfo(cell, worksheet);
      if (mergeInfo.isMerged) mergedCellsCount++;

      const targetAddress = normalizeCoordinate(mergeInfo.masterAddress || addr);
      const targetCell = worksheet.getCell(targetAddress);
      const rowNum = Number(targetCell.row);
      const colLetter = normalizeColLetter(targetAddress.replace(/\d+/g, ''));

      let mode = resolveCustomMappingMode({ address: targetAddress, label: cm.label, mode: cm.mode });
      const isFixedImmutable = ['B13', 'B15', 'B17'].includes(targetAddress);
      if (isFixedImmutable) {
        mode = 'literal';
      }

      const fixedDef = isFixedImmutable ? FIXED_IMMUTABLE_CELLS[targetAddress as 'B13' | 'B15' | 'B17'] : null;
      const labelText = fixedDef ? fixedDef.label : (cm.label || `Campo Livre ${targetAddress}`);
      const literalText = fixedDef ? fixedDef.text : labelText;
      const existingCellText = fixedDef ? fixedDef.text : getExcelCellText(targetCell);

      const customId = `CUSTOM_${targetAddress}_${idx}`;
      if (!fields.some(f => f.address === targetAddress)) {
        fields.push({
          id: customId,
          sheet: worksheet.name,
          address: targetAddress,
          row: rowNum,
          col: colLetterToNumber(colLetter),
          colLetter,
          section: isFixedImmutable 
            ? 'Células Fixas Imutáveis (B13, B15, B17)' 
            : mode === 'literal' ? 'Célula com Texto Fixo / Literal' : 'Célula Gerada com IA',
          label: labelText,
          expectedType: isFixedImmutable ? (targetAddress === 'B17' ? 'recuperacao_sei' : 'avaliacao') : (cm.expectedType || 'habilidade'),
          confirmed: true,
          currentValue: existingCellText,
          // For literal mode, pre-populate fillValue with the exact text so it's ready to inject directly
          fillValue: mode === 'literal' ? literalText : undefined,
          injectionMode: mode,
          isImmutableFixed: isFixedImmutable,
          isMerged: mergeInfo.isMerged,
          mergeRange: mergeInfo.mergeRange,
          isMaster: mergeInfo.isMaster,
          originalStyle: {
            fontName: targetCell.font?.name || 'Calibri',
            fontSize: targetCell.font?.size || 10,
            bold: false,
            fillColor: getCellFillColor(targetCell),
            border: !!targetCell.border
          }
        });
      }
    });
  }

  // 3.1. Células Fixas Imutáveis B13, B15 e B17 (Bloqueio estrito de IA e preenchimento literal exato)
  // Garante que B13, B15 e B17 estejam sempre presentes no array de campos com os textos fixos oficiais
  const fixedCellsToEnsure = [
    { addr: 'B13' as const, def: FIXED_IMMUTABLE_CELLS.B13, row: 13, exp: 'avaliacao' as const },
    { addr: 'B15' as const, def: FIXED_IMMUTABLE_CELLS.B15, row: 15, exp: 'avaliacao' as const },
    { addr: 'B17' as const, def: FIXED_IMMUTABLE_CELLS.B17, row: 17, exp: 'recuperacao_sei' as const }
  ];

  fixedCellsToEnsure.forEach(({ addr, def, row, exp }) => {
    let existing = fields.find(f => normalizeCoordinate(f.address) === addr);
    if (existing) {
      existing.fillValue = def.text;
      existing.currentValue = def.text;
      existing.injectionMode = 'literal';
      existing.isImmutableFixed = true;
      existing.label = def.label;
      existing.section = 'Células Fixas Imutáveis (B13, B15, B17)';
    } else {
      const cell = worksheet.getCell(addr);
      const merge = getCellMergeInfo(cell, worksheet);
      if (merge.isMerged) mergedCellsCount++;
      const targetAddr = normalizeCoordinate(merge.masterAddress || addr);
      const rootCell = worksheet.getCell(targetAddr);
      fields.push({
        id: `FIXED_${addr}_IMMUTABLE`,
        sheet: worksheet.name,
        address: targetAddr,
        row,
        col: 2,
        colLetter: 'B',
        section: 'Células Fixas Imutáveis (B13, B15, B17)',
        label: def.label,
        expectedType: exp,
        confirmed: true,
        currentValue: def.text,
        fillValue: def.text,
        injectionMode: 'literal',
        isImmutableFixed: true,
        isMerged: merge.isMerged,
        mergeRange: merge.mergeRange || (merge.isMerged ? `${addr}:I${row}` : undefined),
        isMaster: merge.isMaster,
        originalStyle: {
          fontName: rootCell.font?.name || 'Calibri',
          fontSize: rootCell.font?.size || 10,
          bold: false,
          fillColor: getCellFillColor(rootCell),
          border: !!rootCell.border
        }
      });
    }
  });

  // 3.2. Mapeamento obrigatório das células fixas de avaliação oficial (C21:C24 e J21:J24)
  // Garante que tanto a Coluna C (Instrumentos) quanto a Coluna J (Pesos/Porcentagens) tenham seus valores fixos injetados na íntegra
  const evalFixedDefinitions = [
    { addrC: 'C21', defC: 'Prova Paulista', addrJ: 'J21', defJ: '30%', row: 21 },
    { addrC: 'C22', defC: 'Atividades em Sala e Caderno', addrJ: 'J22', defJ: '30%', row: 22 },
    { addrC: 'C23', defC: 'Trabalhos e Práticas em Grupo', addrJ: 'J23', defJ: '20%', row: 23 },
    { addrC: 'C24', defC: 'Avaliação Formativa e SEI', addrJ: 'J24', defJ: '20%', row: 24 },
  ];

  evalFixedDefinitions.forEach(({ addrC, defC, addrJ, defJ, row }) => {
    // 1. Coluna C (Instrumento de Avaliação)
    let fieldC = fields.find(f => normalizeCoordinate(f.address) === addrC);
    const customMappingC = profile.customCellMappings?.find(cm => normalizeCoordinate(cm.address) === addrC);
    const labelC = (customMappingC?.label && customMappingC.label !== addrC) ? customMappingC.label : defC;

    if (!fieldC) {
      const cellC = worksheet.getCell(addrC);
      const mergeC = getCellMergeInfo(cellC, worksheet);
      const targetAddrC = normalizeCoordinate(mergeC.masterAddress || addrC);
      const rootC = worksheet.getCell(targetAddrC);
      fieldC = {
        id: `EVAL_${addrC}`,
        sheet: worksheet.name,
        address: targetAddrC,
        row,
        col: 3,
        colLetter: 'C',
        section: `Instrumentos de Avaliação (Linha ${row})`,
        label: labelC,
        expectedType: 'avaliacao',
        confirmed: true,
        currentValue: getExcelCellText(rootC) || labelC,
        fillValue: labelC,
        injectionMode: 'literal',
        isAvaliacao: true,
        isMerged: mergeC.isMerged,
        mergeRange: mergeC.mergeRange,
        isMaster: mergeC.isMaster,
        originalStyle: {
          fontName: rootC.font?.name || 'Calibri',
          fontSize: rootC.font?.size || 10,
          bold: true,
          fillColor: getCellFillColor(rootC),
          border: !!rootC.border
        }
      };
      fields.push(fieldC);
    } else {
      if (!fieldC.fillValue || fieldC.fillValue === addrC) {
        fieldC.fillValue = labelC;
      }
      fieldC.injectionMode = 'literal';
      fieldC.confirmed = true;
      fieldC.isAvaliacao = true;
    }

    // 2. Coluna J (Peso / Porcentagem de Avaliação)
    let fieldJ = fields.find(f => normalizeCoordinate(f.address) === addrJ);
    const customMappingJ = profile.customCellMappings?.find(cm => normalizeCoordinate(cm.address) === addrJ);
    const labelJ = (customMappingJ?.label && customMappingJ.label !== addrJ) ? customMappingJ.label : defJ;

    if (!fieldJ) {
      const cellJ = worksheet.getCell(addrJ);
      const mergeJ = getCellMergeInfo(cellJ, worksheet);
      const targetAddrJ = normalizeCoordinate(mergeJ.masterAddress || addrJ);
      const rootJ = worksheet.getCell(targetAddrJ);
      fieldJ = {
        id: `EVAL_${addrJ}`,
        sheet: worksheet.name,
        address: targetAddrJ,
        row,
        col: 10,
        colLetter: 'J',
        section: `Peso / Porcentagem de Avaliação (Linha ${row})`,
        label: labelJ,
        expectedType: 'avaliacao',
        confirmed: true,
        currentValue: getExcelCellText(rootJ) || labelJ,
        fillValue: labelJ,
        injectionMode: 'literal',
        isAvaliacao: true,
        isMerged: mergeJ.isMerged,
        mergeRange: mergeJ.mergeRange,
        isMaster: mergeJ.isMaster,
        originalStyle: {
          fontName: rootJ.font?.name || 'Calibri',
          fontSize: rootJ.font?.size || 10,
          bold: true,
          fillColor: getCellFillColor(rootJ),
          border: !!rootJ.border
        }
      };
      fields.push(fieldJ);
    } else {
      if (!fieldJ.fillValue || fieldJ.fillValue === addrJ) {
        fieldJ.fillValue = labelJ;
      }
      fieldJ.injectionMode = 'literal';
      fieldJ.confirmed = true;
      fieldJ.isAvaliacao = true;
    }
  });

  return {
    fields,
    workbookInstance: workbook,
    activeSheet: worksheet.name,
    sheetNames,
    summary: {
      totalFields: fields.length,
      rowsConfigured: rowCount,
      startRow,
      endRow,
      columnsUsed,
      skippedRows: Array.from(skipRowsSet),
      mergedCellsCount
    }
  };
}

export function normalizeTextClean(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function extractBimestreNumber(val: string | number | undefined): number {
  if (typeof val === 'number') return val >= 1 && val <= 4 ? val : 1;
  const str = normalizeTextClean(String(val || ''));
  if (str.includes('4') || str.includes('quarto') || str.includes('4b')) return 4;
  if (str.includes('3') || str.includes('terceiro') || str.includes('3b')) return 3;
  if (str.includes('2') || str.includes('segundo') || str.includes('2b')) return 2;
  if (str.includes('1') || str.includes('primeiro') || str.includes('1b')) return 1;
  return 1;
}

/**
 * Generates subject-specific pedagogical skills aligned with Currículo Paulista (SEDUC-SP)
 * when an uploaded file is empty or missing skills for that specific discipline,
 * strictly prohibiting generic Math (EF09MA01) from contaminating non-math subjects.
 */
export function generateFallbackSubjectSkills(
  subject: string,
  bimestreVal: string | number = 1,
  grade: string = '',
  plannedClasses: number | string = 14
): ScopeSkill[] {
  const normSub = normalizeTextClean(subject);
  const bimNum = extractBimestreNumber(bimestreVal);
  const parsedClasses = typeof plannedClasses === 'number' ? plannedClasses : parseInt(String(plannedClasses || '').replace(/\D+/g, ''), 10);
  const effectiveClasses = (!isNaN(parsedClasses) && parsedClasses >= 8) ? parsedClasses : 18;
  const totalWeeks = Math.max(Math.ceil(effectiveClasses / 2), 11);

  if (normSub.includes('financ')) {
    // Educação Financeira - Alinhado aos 4 bimestres
    const finByBim: Record<number, Array<{ code: string; desc: string; obj: string; unit: string }>> = {
      1: [
        { code: 'EM13MAT311', desc: 'Identificar e analisar a relação entre receitas, despesas e a elaboração do orçamento pessoal e familiar.', obj: 'Orçamento pessoal e familiar: controle financeiro e planilha de fluxo de caixa', unit: 'Educação Financeira - 1º Bimestre' },
        { code: 'EM13MAT312', desc: 'Avaliar situações de consumo consciente, diferenciando necessidades básicas de impulsos de consumo.', obj: 'Consumo consciente, sustentabilidade e publicidade financeira', unit: 'Educação Financeira - 1º Bimestre' },
      ],
      2: [
        { code: 'EM13MAT313', desc: 'Compreender o impacto da inflação no poder de compra e o funcionamento dos juros simples e compostos.', obj: 'Juros simples e compostos aplicados a compras parceladas e empréstimos', unit: 'Educação Financeira - 2º Bimestre' },
        { code: 'EM13MAT314', desc: 'Analisar diferentes modalidades de investimento de renda fixa e a importância da reserva de emergência.', obj: 'Reserva de emergência e modalidades de investimento (Tesouro Direto, CDB, Poupança)', unit: 'Educação Financeira - 2º Bimestre' },
      ],
      3: [
        { code: 'EM13MAT315', desc: 'Reconhecer os riscos do superendividamento e explorar estratégias para renegociação de dívidas.', obj: 'Prevenção ao superendividamento e planejamento financeiro de longo prazo', unit: 'Educação Financeira - 3º Bimestre' },
        { code: 'EM13MAT316', desc: 'Utilizar ferramentas digitais seguras e meios de pagamento contemporâneos (Pix, cartões e open banking).', obj: 'Segurança financeira digital e meios eletrônicos de pagamento', unit: 'Educação Financeira - 3º Bimestre' },
      ],
      4: [
        { code: 'EM13MAT317', desc: 'Elaborar um plano de metas financeiras (curto, médio e longo prazo) com projeções orçamentárias e previdência.', obj: 'Projeto de vida financeiro, previdência e tomada de decisão econômica responsável', unit: 'Educação Financeira - 4º Bimestre' },
        { code: 'EM13MAT318', desc: 'Analisar impactos macroeconômicos, tributação, impostos diretos e indiretos no planejamento individual.', obj: 'Cidadania fiscal, tributação e investimentos de renda variável', unit: 'Educação Financeira - 4º Bimestre' },
        { code: 'EM13MAT319', desc: 'Desenvolver projeto de empreendedorismo ou plano de ação financeira sustentável para a comunidade.', obj: 'Empreendedorismo jovem e sustentabilidade financeira comunitária', unit: 'Educação Financeira - 4º Bimestre' },
      ]
    };
    const finSkills = finByBim[bimNum] || finByBim[4];
    return Array.from({ length: totalWeeks }, (_, i) => i + 1).map((wk) => {
      // Semana 10: SEI - Semana de Estudos Intensivos / Recuperação e Nivelamento
      if (wk === 10) {
        return {
          id: `fin_skill_b${bimNum}_${wk}`,
          bimestre: bimNum,
          week: wk,
          code: 'SEI-RECUPERACAO',
          description: 'Semana de Estudos Intensivos (SEI): Retomada, recuperação contínua e nivelamento das aprendizagens prioritárias de Educação Financeira.',
          objectOfKnowledge: 'Recuperação Contínua (SEI): superação de defasagens em planejamento financeiro e tomada de decisão econômica',
          estimatedClasses: 2,
          unit: `Educação Financeira - Semana ${wk} (SEI)`,
          subject: subject || 'Educação Financeira',
          learningObjectives: 'Retomar e consolidar as habilidades essenciais que apresentaram maior defasagem nas avaliações formativas do bimestre.',
          methodology: 'Estações rotativas de aprendizagem com apoio do Material Digital SEDUC-SP e intervenção docente direta.',
          stepByStep: '1. Acolhida e alinhamento de metas da SEI (10 min). 2. Desafios práticos em duplas com mediação pedagógica (25 min). 3. Pós-teste de verificação de aprendizagem (15 min) (Total: 50 min). | Transição e Bloco 2: 4. Aprofundamento conceitual guiado (25 min). 5. Síntese e registro final no diário (15 min).',
          assessment: 'Instrumento avaliativo pós-revisão com rubrica de nivelamento e registro formativo no Diário Digital (SED).',
          recovery: 'Devolutiva pedagógica formativa e plano de estudos personalizado.',
          lessonRange: 'Semana de Estudos Intensivos (SEI) / Recuperação e Nivelamento',
          sourceReference: 'Base Curricular Oficial SEDUC-SP • SEI'
        };
      }

      // Semana 11: Conselho de Classe / Fechamento de Médias e Frequências
      if (wk === 11) {
        return {
          id: `fin_skill_b${bimNum}_${wk}`,
          bimestre: bimNum,
          week: wk,
          code: 'CONSELHO-FECHAMENTO',
          description: 'Conselho de Classe e Série / Fechamento Bimestral: Consolidação final de médias, apuração de frequência e análise colegiada de rendimento escolar.',
          objectOfKnowledge: 'Fechamento Bimestral e Conselho de Classe: análise de rendimento escolar e registros no SEDUC-SED',
          estimatedClasses: 0,
          unit: `Educação Financeira - Semana ${wk} (Conselho de Classe)`,
          subject: subject || 'Educação Financeira',
          learningObjectives: 'Realizar o fechamento de médias, consolidação de frequência e deliberação pedagógica no Conselho de Classe.',
          methodology: 'Reunião colegiada docente e pedagógica para análise de rendimento escolar e consolidação das notas no Sistema de Cadastro de Alunos (SED).',
          stepByStep: '1. Apuração e lançamento final de notas e frequências na plataforma SED (45 min). 2. Participação na reunião do Conselho de Classe com análise dos casos que demandam intervenção especial (45 min) (Total: 90 min).',
          assessment: 'Consolidação dos resultados bimestrais e ata final do Conselho de Classe.',
          recovery: 'Encaminhamentos pedagógicos e plano de acompanhamento para o período seguinte.',
          lessonRange: 'Conselho de Classe / Fechamento de Médias e Frequências',
          sourceReference: 'Regulamento Escolar SEDUC-SP • Conselho de Classe'
        };
      }

      // Semana 2: Suspensão Oficial de Aulas em 15/10 (Dia do Professor)
      if (wk === 2) {
        return {
          id: `fin_skill_b${bimNum}_${wk}`,
          bimestre: bimNum,
          week: wk,
          code: 'SUSPENSAO-AULAS',
          description: 'Evento Oficial / Suspensão de Aulas: Dia do Professor conforme calendário escolar oficial SEDUC-SP.',
          objectOfKnowledge: 'Suspensão de aulas presenciais - Conteúdo reprogramado',
          estimatedClasses: 0,
          unit: `Educação Financeira - Semana ${wk}`,
          subject: subject || 'Educação Financeira',
          learningObjectives: 'Sem expediente pedagógico presencial conforme calendário escolar oficial SEDUC-SP.',
          methodology: '-',
          stepByStep: 'Suspensão das atividades letivas em virtude do Dia do Professor. Conteúdo didático reprogramado para o próximo encontro letivo.',
          assessment: '-',
          recovery: '-',
          lessonRange: 'Suspensão de Aulas',
          sourceReference: 'Calendário Escolar Oficial SEDUC-SP'
        };
      }

      // Semanas regulares 1 e 3 a 9: Distribuição contínua das 16 aulas regulares do Escopo
      const lessonIndex = wk === 1 ? 1 : ((wk - 1) * 2 - 1);
      const startClass = lessonIndex;
      const endClass = lessonIndex + 1;
      const lessonRange = `Aula ${startClass} e ${endClass}`;
      const lessonRangePlural = `Aulas ${startClass} e ${endClass}`;

      const regIdx = Math.floor((startClass - 1) / 2);
      const s = finSkills[Math.min(regIdx, finSkills.length - 1)];

      return {
        id: `fin_skill_b${bimNum}_${wk}`,
        bimestre: bimNum,
        week: wk,
        code: s.code,
        description: s.desc,
        objectOfKnowledge: s.obj,
        estimatedClasses: 2,
        unit: s.unit,
        subject: subject || 'Educação Financeira',
        learningObjectives: `Articular os objetivos pedagógicos das ${lessonRangePlural}: Compreender e aplicar os conceitos de ${cleanPedagogicalText(s.obj)} no planejamento financeiro responsável.`,
        methodology: `Estratégia para bloco de 2 aulas geminadas (90-100 min - ${lessonRangePlural}): Ensino por Investigação e resolução de problemas práticos com apoio do Material Digital SEDUC-SP.`,
        stepByStep: `Aula ${startClass} (45-50 min): 1. Acolhida e problematização disparadora (10 min). 2. Investigação orientada com Material Digital (25 min). 3. Sistematização inicial (10 min). | Transição e Aula ${endClass} (45-50 min): 4. Aprofundamento prático em duplas (25 min). 5. Síntese e registro no diário de bordo (15 min) (Total: 90-100 min).`,
        assessment: `Observação formativa contínua, análise da produção escrita no diário de bordo e rubrica de participação individual e coletiva nas aulas ${startClass} e ${endClass}.`,
        recovery: `Intervenção pedagógica imediata e mediação dirigida para superação pontual de dúvidas conceituais das aulas ${startClass} e ${endClass}.`,
        lessonRange,
        sourceReference: `${lessonRangePlural} • Base Curricular Oficial SEDUC-SP`
      };
    });
  }

  if (normSub.includes('quim') || normSub.includes('quím')) {
    // Química do Ensino Médio SEDUC-SP - Rigorosamente separada por Bimestre:
    // 1º Bimestre: Modelos Atômicos, Tabela Periódica, Propriedades e Ligações Químicas
    // 2º Bimestre: Transformações Químicas, Leis Ponderais, Balanceamento e Estequiometria
    // 3º Bimestre: Soluções, Concentração, Cinética Química e Fatores de Velocidade
    // 4º Bimestre: Equilíbrio Químico, pH/pOH, Funções Orgânicas, Eletroquímica (Pilhas) e Química Ambiental
    const quimByBim: Record<number, Array<{
      code: string;
      desc: string;
      obj: string;
      unit: string;
      learningObjectives?: string;
      methodology?: string;
      stepByStep?: string;
      assessment?: string;
      recovery?: string;
    }>> = {
      1: [
        { code: 'EM13CNT101', desc: 'Analisar e representar transformações químicas e fenômenos cotidianos com base nos modelos atômicos clássicos e modernos.', obj: 'Modelos atômicos (Dalton, Thomson, Rutherford, Bohr) e distribuição eletrônica', unit: 'Estrutura da Matéria - 1º Bimestre' },
        { code: 'EM13CNT102', desc: 'Explicar a formação de substâncias a partir das ligações químicas (iônica, covalente e metálica) e suas propriedades.', obj: 'Tabela Periódica, propriedades periódicas e ligações químicas interatômicas', unit: 'Matéria e Energia - 1º Bimestre' },
        { code: 'EM13CNT103', desc: 'Investigar as forças intermoleculares e relacioná-las com pontos de fusão, ebulição e solubilidade.', obj: 'Geometria molecular, polaridade e interações intermoleculares', unit: 'Matéria e Energia - 1º Bimestre' },
      ],
      2: [
        { code: 'EM13CNT201', desc: 'Aplicar leis ponderais de Lavoisier e Proust no balanceamento de equações químicas e relações molares.', obj: 'Leis ponderais e estequiometria: cálculo de massa, mol e volume molar', unit: 'Transformações Químicas - 2º Bimestre' },
        { code: 'EM13CNT202', desc: 'Calcular rendimento e pureza de reações químicas em processos industriais e laboratoriais.', obj: 'Reações químicas com reagente limitante, pureza e rendimento reacional', unit: 'Transformações Químicas - 2º Bimestre' },
        { code: 'EM13CNT203', desc: 'Classificar as reações inorgânicas fundamentais (síntese, decomposição, simples e dupla troca).', obj: 'Funções inorgânicas (ácidos, bases, sais e óxidos) e suas reações', unit: 'Transformações Químicas - 2º Bimestre' },
      ],
      3: [
        { code: 'EM13CNT204', desc: 'Investigar soluções aquosas calculando concentração comum, título e concentração em quantidade de matéria (molaridade).', obj: 'Soluções químicas: solubilidade, curvas de saturação e concentração molar', unit: 'Dispersões e Soluções - 3º Bimestre' },
        { code: 'EM13CNT301', desc: 'Avaliar a cinética das reações químicas identificando fatores que alteram a velocidade (temperatura, concentração, superfície de contato, catalisador).', obj: 'Cinética química: velocidade média, energia de ativação e catalisadores', unit: 'Cinética Química - 3º Bimestre' },
        { code: 'EM13CNT302', desc: 'Interpretar a lei de velocidade para reações elementares e não elementares e gráficos cinéticos.', obj: 'Mecanismos de reação e fatores determinantes da rapidez das transformações', unit: 'Cinética Química - 3º Bimestre' },
      ],
      4: [
        {
          code: 'EM13CNT303',
          desc: 'Analisar e caracterizar o estado de equilíbrio químico dinâmico em transformações reversíveis a partir de aspectos macroscópicos e microscópicos.',
          obj: 'Equilíbrio químico dinâmico, reversibilidade e igualdade de velocidades direta e inversa',
          unit: 'Equilíbrio Químico - Semana 1',
          learningObjectives: 'Reconhecer que no equilíbrio químico as concentrações de reagentes e produtos permanecem constantes e as velocidades das reações direta e inversa se igualam.',
          methodology: 'Ensino por Investigação com experimento demonstrativo da garrafa de refrigerante sob pressão e análise de gráficos de concentração versus tempo.',
          stepByStep: '1. Acolhida e pergunta disparadora: "Todas as reações químicas chegam ao fim?" (10 min). 2. Demonstração prática do desprendimento e dissolução de CO2 (15 min). 3. Interpretação em duplas dos gráficos de velocidade e concentração (15 min). 4. Fechamento e registro no diário de bordo (10 min).',
          assessment: 'Rubrica formativa de interpretação de gráficos cinéticos e resolução orientada de duas situações-problema conceituais.',
          recovery: 'Atendimento individualizado com analogia mecânica da escada rolante para superar a confusão entre igualdade de velocidades e igualdade de concentrações.'
        },
        {
          code: 'EM13CNT303',
          desc: 'Deduzir e aplicar a lei de ação das massas no cálculo das constantes de equilíbrio em função de concentrações (Kc) e pressões parciais (Kp).',
          obj: 'Constante de equilíbrio Kc e Kp: dedução matemática, rendimento e tabela I.R.E.',
          unit: 'Equilíbrio Químico - Semana 2',
          learningObjectives: 'Calcular o valor numérico de Kc e Kp a partir de dados experimentais em sistemas homogêneos e heterogêneos, interpretando a extensão do rendimento reacional.',
          methodology: 'Aprendizagem Baseada em Resolução de Problemas (ABP) com apoio do Material Digital SEDUC e estruturação de tabelas I.R.E. (Início, Reagiu, Equilíbrio).',
          stepByStep: '1. Retomada breve com quiz diagnóstico (5 min). 2. Dedução coletiva da expressão de Kc no quadro (15 min). 3. Resolução guiada da tabela I.R.E. para a síntese da amônia (20 min). 4. Sistematização das regras de exclusão de sólidos e líquidos puros (10 min).',
          assessment: 'Análise das produções escritas na montagem da tabela I.R.E. e precisão do cálculo algébrico da constante Kc.',
          recovery: 'Material de apoio visual com roteiro de cálculo passo a passo para estudantes com defasagens em álgebra e notação científica.'
        },
        {
          code: 'EM13CNT303',
          desc: 'Prever e justificar o sentido de deslocamento do equilíbrio químico frente a perturbações de concentração e pressão total no sistema.',
          obj: 'Princípio de Le Chatelier: perturbações por concentração e pressão em sistemas gasosos',
          unit: 'Equilíbrio Químico - Semana 3',
          learningObjectives: 'Aplicar o Princípio de Le Chatelier para prever como um sistema em equilíbrio responde à adição ou remoção de componentes e à variação de volume/pressão.',
          methodology: 'Simulação computacional interativa PhET ("Reversible Reactions") em grupos de trabalho colaborativo mediado por roteiro de exploração.',
          stepByStep: '1. Contextualização: o processo industrial Haber-Bosch e a produção mundial de alimentos (10 min). 2. Rotação em bancadas virtuais alterando volume e quantidade de matéria (20 min). 3. Debate orientador sobre as respostas do sistema (15 min). 4. Conclusão coletiva no caderno (5 min).',
          assessment: 'Relatório de simulação investigativa preenchido em duplas e autoavaliação guiada de compreensão dos efeitos de pressão.',
          recovery: 'Intervenção com duplas produtivas para reforço da regra: o aumento da pressão sempre desloca o equilíbrio para o lado de menor volume gasoso.'
        },
        {
          code: 'EM13CNT303',
          desc: 'Avaliar a influência da temperatura em equilíbrios endotérmicos e exotérmicos e o papel cinético de catalisadores.',
          obj: 'Influência da temperatura (ΔH) no valor de Kc e papel cinético dos catalisadores',
          unit: 'Equilíbrio Químico - Semana 4',
          learningObjectives: 'Compreender que a temperatura é o único fator que altera o valor numérico da constante de equilíbrio e que o catalisador apenas reduz o tempo reacional sem alterar o rendimento.',
          methodology: 'Demonstração investigativa de equilíbrio térmico entre dióxido de nitrogênio (NO2 castanho) e dinitróxido de nitrogênio (N2O4 incolor) em banhos térmicos.',
          stepByStep: '1. Pergunta disparadora: "O catalisador aumenta a quantidade final de produto obtido?" (10 min). 2. Demonstração de equilíbrio térmico em seringas graduadas (15 min). 3. Análise dos gráficos endotérmico versus exotérmico (15 min). 4. Síntese conceitual fundamentada (10 min).',
          assessment: 'Ficha de verificação rápida (Exit Ticket) com questões conceituais sobre a não alteração do Kc por catalisadores.',
          recovery: 'Revisão do conceito de entalpia (ΔH positivo/negativo) com esquemas comparativos ilustrados no Material Digital SEDUC.'
        },
        {
          code: 'EM13CNT304',
          desc: 'Compreender o equilíbrio iônico da água e a relação entre as concentrações hidrogeniônica [H+] e hidroxiliônica [OH-] com a escala de pH e pOH.',
          obj: 'Autoionização da água, produto iônico Kw, escala logarítmica de pH e pOH',
          unit: 'Equilíbrio Iônico - Semana 5',
          learningObjectives: 'Calcular o pH e o pOH de soluções aquosas a 25°C e relacionar os valores numéricos com o caráter ácido, básico ou neutro de soluções do cotidiano.',
          methodology: 'Prática laboratorial com extrato vegetal de repolho roxo, fitas universais de pH e produtos cotidianos (vinagre, café, sabonete, leite de magnésia).',
          stepByStep: '1. Acolhida e teste prático com cores de indicadores em tubos de ensaio (15 min). 2. Introdução à escala de 0 a 14 e à fórmula matemática pH = -log[H+] (15 min). 3. Resolução guiada de cálculos de pH neutro, ácido e alcalino (15 min). 4. Fechamento e sistematização (5 min).',
          assessment: 'Tabela de classificação das soluções cotidianas conforme valores de pH e mapa conceitual de acidez/basicidade.',
          recovery: 'Exercícios graduados de revisão de logaritmos na base 10 e potências de base 10 aplicadas a concentrações molares.'
        },
        {
          code: 'EM13CNT304',
          desc: 'Investigar o fenômeno da hidrólise salina, a ação reguladora de soluções tampão em sistemas biológicos e os impactos ambientais da chuva ácida.',
          obj: 'Hidrólise salina, soluções tampão no sangue e ecologia da chuva ácida',
          unit: 'Equilíbrio Iônico - Semana 6',
          learningObjectives: 'Identificar o caráter ácido ou básico de soluções salinas e explicar a importância do sistema tampão carbonato/bicarbonato no equilíbrio homeostático e na preservação de solos e oceanos.',
          methodology: 'Estudo de Caso e Aprendizagem Cooperativa (Jigsaw) sobre a acidificação de corpos d\'água e a fisiologia da respiração e tampão sanguíneo.',
          stepByStep: '1. Exibição de caso real sobre os efeitos da chuva ácida em florestas e construções (10 min). 2. Trabalho em grupos especialistas (sangue, solo, oceanos) (20 min). 3. Compartilhamento das análises químicas (15 min). 4. Registro das reações de hidrólise no caderno (5 min).',
          assessment: 'Rubrica de argumentação científica sobre a ação tamponante contra variações bruscas de pH.',
          recovery: 'Atendimento individualizado para reforço na identificação da força de ácidos e bases formadores do sal.'
        },
        {
          code: 'EM13CNT305',
          desc: 'Reconhecer as propriedades singulares do átomo de carbono (postulados de Kekulé, tetravalência e hibridização) e classificar cadeias carbônicas.',
          obj: 'Introdução à Química Orgânica: tetravalência do carbono e classificação de cadeias carbônicas',
          unit: 'Química Orgânica - Semana 7',
          learningObjectives: 'Classificar cadeias carbônicas abertas/fechadas, normais/ramificadas, saturadas/insaturadas e homogêneas/heterogêneas, identificando carbonos primários, secundários, terciários e quaternários.',
          methodology: 'Oficina Maker com modelos moleculares tridimensionais (bolinhas e varetas) para visualização espacial de ligações sigma e pi.',
          stepByStep: '1. Contextualização histórica sobre o colapso da Teoria da Força Vital e síntese da ureia (10 min). 2. Oficina prática de montagem tridimensional de metano, etano e benzeno (20 min). 3. Exercícios de classificação de cadeias no quadro (15 min). 4. Fechamento e registro no diário de bordo (5 min).',
          assessment: 'Avaliação formativa entre pares da precisão geométrica dos modelos moleculares montados e classificação correta de fórmulas estruturais.',
          recovery: 'Flashcards de apoio com critérios visuais de classificação de cadeias carbônicas.'
        },
        {
          code: 'EM13CNT305',
          desc: 'Identificar as fórmulas estruturais e os grupos funcionais característicos dos hidrocarbonetos e das principais funções orgânicas oxigenadas no cotidiano.',
          obj: 'Hidrocarbonetos e funções oxigenadas: álcoois, aldeídos, cetonas, ácidos carboxílicos e ésteres',
          unit: 'Química Orgânica - Semana 8',
          learningObjectives: 'Diferenciar álcoois, aldeídos, cetonas, ácidos carboxílicos e ésteres em rótulos de alimentos, cosméticos, fármacos e biocombustíveis.',
          methodology: 'Gamificação Pedagógica ("Caça aos Grupos Funcionais") em rótulos reais e simulações do Material Digital SEDUC.',
          stepByStep: '1. Problematização: por que o etanol é combustível e também antisséptico? (10 min). 2. Exploração guiada das fórmulas gerais dos grupos funcionais (15 min). 3. Análise prática de rótulos em grupos (15 min). 4. Conclusão comparando propriedades físicas (10 min).',
          assessment: 'Questionário formativo com identificação de grupos funcionais em moléculas farmacológicas cotidianas.',
          recovery: 'Tabela sinóptica comparativa destacando os sufixos IUPAC (-ol, -al, -ona, -oico) para cada função orgânica.'
        },
        {
          code: 'AVAL-PROVA-PAULISTA',
          desc: 'Verificar e consolidar a apropriação das habilidades essenciais do 4º Bimestre (Equilíbrio Químico, pH/pOH e Funções Orgânicas) através da Prova Paulista e SARESP.',
          obj: 'Avaliação Oficial do Estado de São Paulo: Prova Paulista / SARESP e consolidação diagnóstica',
          unit: 'Avaliação da Aprendizagem - Semana 9',
          learningObjectives: 'Consolidar as competências e habilidades trabalhadas ao longo do bimestre, identificando potencialidades e defasagens de aprendizagem.',
          methodology: 'Aplicação monitorada da Prova Paulista na plataforma CMSP com análise diagnóstica imediata dos itens de maior complexidade.',
          stepByStep: '1. Acolhida socioemocional e orientações operacionais para a avaliação (10 min). 2. Execução da avaliação bimestral individual com foco e concentração (30 min). 3. Mapeamento das dúvidas mais frequentes levantadas pelos estudantes (10 min).',
          assessment: 'Matriz diagnóstica de acertos e erros categorizada por descritor de habilidade (EM13CNT303, EM13CNT304, EM13CNT305).',
          recovery: 'Mapeamento dos estudantes que necessitam de intervenção intensiva na Semana de Estudos Intensivos (SEI).'
        },
        {
          code: 'SEI-RECUPERACAO',
          desc: 'Semana de Estudos Intensivos (SEI): Retomada, recuperação contínua e aprofundamento das habilidades com defasagem identificada no 4º Bimestre.',
          obj: 'Recuperação Contínua (SEI): superação de defasagens em Equilíbrio Químico e Química Orgânica',
          unit: 'Recuperação e Aprofundamento - Semana 10',
          learningObjectives: 'Retomar e superar as dificuldades diagnósticas em cálculo de Kc, escala de pH e funções orgânicas, garantindo progressão plena.',
          methodology: 'Rotação por Estações de Aprendizagem Diferenciadas: Estação 1 (Cálculo Kc e Le Chatelier), Estação 2 (pH e Chuva Ácida), Estação 3 (Monitoria entre Pares com Material Digital).',
          stepByStep: '1. Alinhamento de metas da SEI e formação de grupos por defasagem identificada (10 min). 2. Desafios práticos nas estações rotativas com mediação docente direta (25 min). 3. Pós-teste de verificação da superação de defasagens (15 min).',
          assessment: 'Instrumento avaliativo pós-revisão com rubrica de verificação da superação de dificuldades e registro no Diário Digital (SED).',
          recovery: 'Feedback formativo individualizado e devolutiva pedagógica final aos estudantes.'
        }
      ]
    };

    const quimSkills = quimByBim[bimNum] || quimByBim[4];
    const seiSkill = quimSkills.find(s => s.code?.includes('SEI') || s.desc?.toLowerCase().includes('sei')) || quimSkills[quimSkills.length - 1];
    const evalSkill = quimSkills.find(s => s.code?.includes('AVAL') || s.desc?.toLowerCase().includes('prova paulista')) || (quimSkills.length >= 2 ? quimSkills[quimSkills.length - 2] : quimSkills[0]);
    const regularSkills = quimSkills.filter(s => !s.code?.includes('SEI') && !s.code?.includes('AVAL') && !s.code?.includes('CONSELHO') && !s.code?.includes('FECH'));

    return Array.from({ length: totalWeeks }, (_, i) => i + 1).map((w) => {
      // Semana 10: SEI - Semana de Estudos Intensivos / Recuperação e Nivelamento
      if (w === 10) {
        return {
          id: `quim_skill_b${bimNum}_${w}`,
          bimestre: bimNum,
          week: w,
          code: 'SEI-RECUPERACAO',
          description: 'Semana de Estudos Intensivos (SEI): Retomada, recuperação contínua e nivelamento das aprendizagens prioritárias de Química.',
          objectOfKnowledge: 'Recuperação Contínua (SEI): superação de defasagens em Equilíbrio Químico e Funções Orgânicas',
          estimatedClasses: 2,
          unit: `Química - Semana ${w} (SEI)`,
          subject: subject || 'Química',
          learningObjectives: 'Retomar e consolidar as habilidades essenciais que apresentaram maior defasagem nas avaliações formativas do bimestre.',
          methodology: 'Estações rotativas de aprendizagem com apoio do Material Digital SEDUC-SP e intervenção docente direta.',
          stepByStep: '1. Acolhida e alinhamento de metas da SEI (10 min). 2. Oficinas práticas em duplas produtivas por descritores críticos (25 min). 3. Pós-teste de nivelamento formativo (15 min) (Total: 50 min). | Transição e Bloco 2: 4. Aprofundamento conceitual guiado (25 min). 5. Síntese e registro final no diário (15 min).',
          assessment: 'Instrumento avaliativo pós-revisão com rubrica de nivelamento e registro formativo no Diário Digital (SED).',
          recovery: 'Devolutiva pedagógica formativa e plano de estudos personalizado.',
          lessonRange: 'Semana de Estudos Intensivos (SEI) / Recuperação e Nivelamento',
          sourceReference: 'Base Curricular Oficial SEDUC-SP • SEI'
        };
      }

      // Semana 11: Conselho de Classe / Fechamento de Médias e Frequências
      if (w === 11) {
        return {
          id: `quim_skill_b${bimNum}_${w}`,
          bimestre: bimNum,
          week: w,
          code: 'CONSELHO-FECHAMENTO',
          description: 'Conselho de Classe e Série / Fechamento Bimestral: Consolidação final de médias, apuração de frequência e análise colegiada de rendimento escolar.',
          objectOfKnowledge: 'Fechamento Bimestral e Conselho de Classe: análise de rendimento escolar e registros no SEDUC-SED',
          estimatedClasses: 0,
          unit: `Química - Semana ${w} (Conselho de Classe)`,
          subject: subject || 'Química',
          learningObjectives: 'Realizar o fechamento de médias, consolidação de frequência e deliberação pedagógica no Conselho de Classe.',
          methodology: 'Reunião colegiada docente e pedagógica para análise de rendimento escolar e consolidação das notas no Sistema de Cadastro de Alunos (SED).',
          stepByStep: '1. Apuração e lançamento final de notas e frequências na plataforma SED (45 min). 2. Participação na reunião do Conselho de Classe com análise dos casos que demandam intervenção especial (45 min) (Total: 90 min).',
          assessment: 'Consolidação dos resultados bimestrais e ata final do Conselho de Classe.',
          recovery: 'Encaminhamentos pedagógicos e plano de acompanhamento para o período seguinte.',
          lessonRange: 'Conselho de Classe / Fechamento de Médias e Frequências',
          sourceReference: 'Regulamento Escolar SEDUC-SP • Conselho de Classe'
        };
      }

      // Semana 2: Suspensão Oficial de Aulas em 15/10 (Dia do Professor)
      if (w === 2) {
        return {
          id: `quim_skill_b${bimNum}_${w}`,
          bimestre: bimNum,
          week: w,
          code: 'SUSPENSAO-AULAS',
          description: 'Evento Oficial / Suspensão de Aulas: Dia do Professor conforme calendário escolar oficial SEDUC-SP.',
          objectOfKnowledge: 'Suspensão de aulas presenciais - Conteúdo reprogramado',
          estimatedClasses: 0,
          unit: `Química - Semana ${w}`,
          subject: subject || 'Química',
          learningObjectives: 'Sem expediente pedagógico presencial conforme calendário escolar oficial SEDUC-SP.',
          methodology: '-',
          stepByStep: 'Suspensão das atividades letivas em virtude do Dia do Professor. Conteúdo didático reprogramado para o próximo encontro letivo.',
          assessment: '-',
          recovery: '-',
          lessonRange: 'Suspensão de Aulas',
          sourceReference: 'Calendário Escolar Oficial SEDUC-SP'
        };
      }

      // Semanas 1 e 3 a 9: Aulas curriculares regulares (Aulas 1 a 16 / 8 pares geminados)
      const lessonIndex = w === 1 ? 1 : ((w - 1) * 2 - 1);
      const startClass = lessonIndex;
      const endClass = lessonIndex + 1;
      const lessonRange = `Aula ${startClass} e ${endClass}`;
      const lessonRangePlural = `Aulas ${startClass} e ${endClass}`;
      const regIdx = Math.floor((startClass - 1) / 2);
      const s = regularSkills[Math.min(regIdx, regularSkills.length - 1)];

      return {
        id: `quim_skill_b${bimNum}_${w}`,
        bimestre: bimNum,
        week: w,
        code: s.code,
        description: s.desc,
        objectOfKnowledge: s.obj,
        estimatedClasses: 2,
        unit: s.unit,
        subject: subject || 'Química',
        learningObjectives: (s as any).learningObjectives || `Articular os objetivos pedagógicos das ${lessonRangePlural}: Compreender e aplicar os conceitos fundamentais de ${cleanPedagogicalText(s.obj)} em situações experimentais e cotidianas.`,
        methodology: (s as any).methodology || `Estratégia para bloco de 2 aulas geminadas (90-100 min - ${lessonRangePlural}): Ensino por Investigação e resolução de problemas práticos com apoio do Material Digital SEDUC-SP.`,
        stepByStep: (s as any).stepByStep || `Aula ${startClass} (45-50 min): 1. Acolhida e problematização disparadora (10 min). 2. Investigação orientada com Material Digital (25 min). 3. Sistematização inicial (10 min). | Transição e Aula ${endClass} (45-50 min): 4. Aprofundamento prático em duplas (25 min). 5. Síntese e registro no diário de bordo (15 min) (Total: 90-100 min).`,
        assessment: (s as any).assessment || `Observação formativa contínua, análise da produção escrita no diário de bordo e rubrica de participação individual e coletiva nas aulas ${startClass} e ${endClass}.`,
        recovery: (s as any).recovery || `Intervenção pedagógica imediata e mediação dirigida para superação pontual de dúvidas conceituais das aulas ${startClass} e ${endClass}.`,
        lessonRange,
        sourceReference: `${lessonRangePlural} • Base Curricular Oficial SEDUC-SP`
      };
    });
  }

  if (normSub.includes('portug') || normSub.includes('lingua')) {
    // Língua Portuguesa por Bimestre
    const lpByBim: Record<number, Array<{ code: string; desc: string; obj: string; unit: string }>> = {
      1: [
        { code: 'EF09LP01', desc: 'Analisar o fenômeno da disseminação de informações falsas na rede e desenvolver estratégias de checagem de fatos.', obj: 'Estratégias de leitura crítica e combate à desinformação', unit: 'Campo Jornalístico/Midiático - 1º Bimestre' },
        { code: 'EF09LP02', desc: 'Produzir e editar textos argumentativos considerando o contexto de circulação.', obj: 'Gêneros argumentativos: tese e argumentos', unit: 'Produção Textual - 1º Bimestre' },
      ],
      2: [
        { code: 'EF09LP04', desc: 'Identificar recursos de coesão referencial e sequencial em textos dissertativos e crônicas.', obj: 'Mecanismos de coesão textual e concordância verbal e nominal', unit: 'Análise Linguística - 2º Bimestre' },
        { code: 'EF09LP05', desc: 'Empregar figuras de linguagem e recursos expressivos em textos literários e publicitários.', obj: 'Semântica e efeitos de sentido', unit: 'Linguagem e Expressão - 2º Bimestre' },
      ],
      3: [
        { code: 'EF09LP07', desc: 'Interpretar textos literários clássicos e contemporâneos relacionando-os com o contexto histórico-social.', obj: 'Leitura literária: temática, estilo de época e intertextualidade', unit: 'Campo Artístico-Literário - 3º Bimestre' },
        { code: 'EF09LP08', desc: 'Analisar o discurso poético e a métrica de manifestações artísticas populares e eruditas.', obj: 'Gênero lírico e poesia contemporânea', unit: 'Campo Artístico-Literário - 3º Bimestre' },
      ],
      4: [
        { code: 'EF09LP10', desc: 'Planejar, produzir e revisar artigos de opinião e editoriais com fundamentação teórica consistente e proposta de intervenção.', obj: 'Artigo de opinião, editorial e propostas de intervenção cidadã', unit: 'Campo de Atuação Cidadã - 4º Bimestre' },
        { code: 'EF09LP11', desc: 'Avaliar a adequação de variedades linguísticas em situações formais e públicas, combatendo o preconceito linguístico.', obj: 'Variação linguística, norma-padrão e preconceito linguístico', unit: 'Análise Linguística e Semiótica - 4º Bimestre' },
        { code: 'EF09LP12', desc: 'Realizar seminários e debates regrados sobre temas de relevância social contemporânea.', obj: 'Oralidade formal, debate regrado e argumentação oral', unit: 'Oralidade e Cidadania - 4º Bimestre' },
      ]
    };
    const lpSkills = lpByBim[bimNum] || lpByBim[4];
    return Array.from({ length: totalWeeks }, (_, i) => i + 1).map((wk) => {
      // Semana 10: SEI - Semana de Estudos Intensivos / Recuperação e Nivelamento
      if (wk === 10) {
        return {
          id: `lp_skill_b${bimNum}_${wk}`,
          bimestre: bimNum,
          week: wk,
          code: 'SEI-RECUPERACAO',
          description: 'Semana de Estudos Intensivos (SEI): Retomada, recuperação contínua e nivelamento das aprendizagens prioritárias em Língua Portuguesa.',
          objectOfKnowledge: 'Recuperação Contínua (SEI): superação de defasagens em leitura, produção de texto e análise linguística',
          estimatedClasses: 2,
          unit: `Língua Portuguesa - Semana ${wk} (SEI)`,
          subject: subject || 'Língua Portuguesa',
          learningObjectives: 'Retomar e superar as dificuldades diagnósticas em leitura e produção argumentativa.',
          methodology: 'Estações rotativas de aprendizagem com apoio do Material Digital SEDUC e mediação docente direta.',
          stepByStep: '1. Alinhamento de metas da SEI (10 min). 2. Oficina de reescrita orientada em duplas (25 min). 3. Pós-teste de verificação formativa (15 min) (Total: 50 min). | Transição e Bloco 2: 4. Aprofundamento conceitual guiado (25 min). 5. Síntese e registro final no diário (15 min).',
          assessment: 'Instrumento avaliativo pós-revisão e registro formativo no Diário Digital (SED).',
          recovery: 'Feedback individualizado e nivelamento de descritores.',
          lessonRange: 'Semana de Estudos Intensivos (SEI) / Recuperação e Nivelamento',
          sourceReference: 'Base Curricular Oficial SEDUC-SP • SEI'
        };
      }

      // Semana 11: Conselho de Classe / Fechamento de Médias e Frequências
      if (wk === 11) {
        return {
          id: `lp_skill_b${bimNum}_${wk}`,
          bimestre: bimNum,
          week: wk,
          code: 'CONSELHO-FECHAMENTO',
          description: 'Conselho de Classe e Série / Fechamento Bimestral: Consolidação final de médias, apuração de frequência e análise colegiada de rendimento escolar.',
          objectOfKnowledge: 'Fechamento Bimestral e Conselho de Classe: análise de rendimento escolar e registros no SEDUC-SED',
          estimatedClasses: 0,
          unit: `Língua Portuguesa - Semana ${wk} (Conselho de Classe)`,
          subject: subject || 'Língua Portuguesa',
          learningObjectives: 'Realizar o fechamento de médias, consolidação de frequência e deliberação pedagógica no Conselho de Classe.',
          methodology: 'Reunião colegiada docente e pedagógica para análise de rendimento escolar e consolidação das notas no Sistema de Cadastro de Alunos (SED).',
          stepByStep: '1. Apuração e lançamento final de notas e frequências na plataforma SED (45 min). 2. Participação na reunião do Conselho de Classe com análise dos casos que demandam intervenção especial (45 min) (Total: 90 min).',
          assessment: 'Consolidação dos resultados bimestrais e ata final do Conselho de Classe.',
          recovery: 'Encaminhamentos pedagógicos e plano de acompanhamento para o período seguinte.',
          lessonRange: 'Conselho de Classe / Fechamento de Médias e Frequências',
          sourceReference: 'Regulamento Escolar SEDUC-SP • Conselho de Classe'
        };
      }

      // Semana 2: Suspensão Oficial de Aulas em 15/10 (Dia do Professor)
      if (wk === 2) {
        return {
          id: `lp_skill_b${bimNum}_${wk}`,
          bimestre: bimNum,
          week: wk,
          code: 'SUSPENSAO-AULAS',
          description: 'Evento Oficial / Suspensão de Aulas: Dia do Professor conforme calendário escolar oficial SEDUC-SP.',
          objectOfKnowledge: 'Suspensão de aulas presenciais - Conteúdo reprogramado',
          estimatedClasses: 0,
          unit: `Língua Portuguesa - Semana ${wk}`,
          subject: subject || 'Língua Portuguesa',
          learningObjectives: 'Sem expediente pedagógico presencial conforme calendário escolar oficial SEDUC-SP.',
          methodology: '-',
          stepByStep: 'Suspensão das atividades letivas em virtude do Dia do Professor. Conteúdo didático reprogramado para o próximo encontro letivo.',
          assessment: '-',
          recovery: '-',
          lessonRange: 'Suspensão de Aulas',
          sourceReference: 'Calendário Escolar Oficial SEDUC-SP'
        };
      }

      // Semanas 1 e 3 a 9: Aulas curriculares regulares (Aulas 1 a 16 / 8 pares geminados)
      const lessonIndex = wk === 1 ? 1 : ((wk - 1) * 2 - 1);
      const startClass = lessonIndex;
      const endClass = lessonIndex + 1;
      const lessonRange = `Aula ${startClass} e ${endClass}`;
      const lessonRangePlural = `Aulas ${startClass} e ${endClass}`;
      const regIdx = Math.floor((startClass - 1) / 2);
      const s = lpSkills[Math.min(regIdx, lpSkills.length - 1)];

      return {
        id: `lp_skill_b${bimNum}_${wk}`,
        bimestre: bimNum,
        week: wk,
        code: s.code,
        description: s.desc,
        objectOfKnowledge: s.obj,
        estimatedClasses: 2,
        unit: s.unit,
        subject: subject || 'Língua Portuguesa',
        learningObjectives: `Articular os objetivos pedagógicos das ${lessonRangePlural}: Compreender e aplicar os conceitos fundamentais de ${cleanPedagogicalText(s.obj)} na produção textual e análise linguística.`,
        methodology: `Estratégia para bloco de 2 aulas geminadas (90-100 min - ${lessonRangePlural}): Ensino por Investigação e oficinas práticas de leitura e escrita com Material Digital SEDUC-SP.`,
        stepByStep: `Aula ${startClass} (45-50 min): 1. Acolhida e leitura disparadora (10 min). 2. Análise textual orientada com Material Digital (25 min). 3. Sistematização inicial (10 min). | Transição e Aula ${endClass} (45-50 min): 4. Produção e aprofundamento prático em duplas (25 min). 5. Síntese e registro no diário de bordo (15 min) (Total: 90-100 min).`,
        assessment: `Observação formativa contínua, análise da produção escrita no diário de bordo e rubrica de participação individual e coletiva nas aulas ${startClass} e ${endClass}.`,
        recovery: `Intervenção pedagógica imediata e mediação dirigida para superação pontual de dúvidas conceituais das aulas ${startClass} e ${endClass}.`,
        lessonRange,
        sourceReference: `${lessonRangePlural} • Base Curricular Oficial SEDUC-SP`
      };
    });
  }

  // Generic subject generator strictly tagged with the selected bimestre (totalWeeks covering Aula 1 to effectiveClasses)
  const cleanSubName = subject.trim() || 'Componente Curricular';
  const subCode = cleanSubName.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'HAB';
  return Array.from({ length: totalWeeks }, (_, i) => i + 1).map(wk => {
    // Semana 10: SEI - Semana de Estudos Intensivos / Recuperação e Nivelamento
    if (wk === 10) {
      return {
        id: `custom_skill_b${bimNum}_${wk}`,
        bimestre: bimNum,
        week: wk,
        code: 'SEI-RECUPERACAO',
        description: `Semana de Estudos Intensivos (SEI): Retomada, recuperação contínua e nivelamento das aprendizagens prioritárias de ${cleanSubName}.`,
        objectOfKnowledge: `Recuperação Contínua (SEI): superação de defasagens em ${cleanSubName}`,
        estimatedClasses: 2,
        unit: `${cleanSubName} - Semana ${wk} (SEI)`,
        subject: cleanSubName,
        learningObjectives: 'Retomar e consolidar as habilidades essenciais que apresentaram maior defasagem nas avaliações formativas do bimestre.',
        methodology: 'Estações rotativas de aprendizagem com apoio do Material Digital SEDUC-SP e intervenção docente direta.',
        stepByStep: '1. Acolhida e alinhamento de metas da SEI (10 min). 2. Oficinas práticas em duplas produtivas (25 min). 3. Pós-teste de nivelamento formativo (15 min) (Total: 50 min). | Transição e Bloco 2: 4. Aprofundamento conceitual guiado (25 min). 5. Síntese e registro final no diário (15 min).',
        assessment: 'Instrumento avaliativo pós-revisão com rubrica de nivelamento e registro formativo no Diário Digital (SED).',
        recovery: 'Devolutiva pedagógica formativa e plano de estudos personalizado.',
        lessonRange: 'Semana de Estudos Intensivos (SEI) / Recuperação e Nivelamento',
        sourceReference: 'Base Curricular Oficial SEDUC-SP • SEI'
      };
    }

    // Semana 11: Conselho de Classe / Fechamento de Médias e Frequências
    if (wk === 11) {
      return {
        id: `custom_skill_b${bimNum}_${wk}`,
        bimestre: bimNum,
        week: wk,
        code: 'CONSELHO-FECHAMENTO',
        description: 'Conselho de Classe e Série / Fechamento Bimestral: Consolidação final de médias, apuração de frequência e análise colegiada de rendimento escolar.',
        objectOfKnowledge: 'Fechamento Bimestral e Conselho de Classe: análise de rendimento escolar e registros no SEDUC-SED',
        estimatedClasses: 0,
        unit: `${cleanSubName} - Semana ${wk} (Conselho de Classe)`,
        subject: cleanSubName,
        learningObjectives: 'Realizar o fechamento de médias, consolidação de frequência e deliberação pedagógica no Conselho de Classe.',
        methodology: 'Reunião colegiada docente e pedagógica para análise de rendimento escolar e consolidação das notas no Sistema de Cadastro de Alunos (SED).',
        stepByStep: '1. Apuração e lançamento final de notas e frequências na plataforma SED (45 min). 2. Participação na reunião do Conselho de Classe com análise dos casos que demandam intervenção especial (45 min) (Total: 90 min).',
        assessment: 'Consolidação dos resultados bimestrais e ata final do Conselho de Classe.',
        recovery: 'Encaminhamentos pedagógicos e plano de acompanhamento para o período seguinte.',
        lessonRange: 'Conselho de Classe / Fechamento de Médias e Frequências',
        sourceReference: 'Regulamento Escolar SEDUC-SP • Conselho de Classe'
      };
    }

    // Semana 2: Suspensão Oficial de Aulas em 15/10 (Dia do Professor)
    if (wk === 2) {
      return {
        id: `custom_skill_b${bimNum}_${wk}`,
        bimestre: bimNum,
        week: wk,
        code: 'SUSPENSAO-AULAS',
        description: 'Evento Oficial / Suspensão de Aulas: Dia do Professor conforme calendário escolar oficial SEDUC-SP.',
        objectOfKnowledge: 'Suspensão de aulas presenciais - Conteúdo reprogramado',
        estimatedClasses: 0,
        unit: `${cleanSubName} - Semana ${wk}`,
        subject: cleanSubName,
        learningObjectives: 'Sem expediente pedagógico presencial conforme calendário escolar oficial SEDUC-SP.',
        methodology: '-',
        stepByStep: 'Suspensão das atividades letivas em virtude do Dia do Professor. Conteúdo didático reprogramado para o próximo encontro letivo.',
        assessment: '-',
        recovery: '-',
        lessonRange: 'Suspensão de Aulas',
        sourceReference: 'Calendário Escolar Oficial SEDUC-SP'
      };
    }

    // Semanas 1 e 3 a 9: Aulas curriculares regulares (Aulas 1 a 16 / 8 pares geminados)
    const lessonIndex = wk === 1 ? 1 : ((wk - 1) * 2 - 1);
    const startClass = lessonIndex;
    const endClass = lessonIndex + 1;
    const lessonRange = `Aula ${startClass} e ${endClass}`;
    const lessonRangePlural = `Aulas ${startClass} e ${endClass}`;

    let code = `HAB-${subCode}${bimNum}0${wk}`;
    let desc = `Desenvolver competências essenciais de ${cleanSubName} para o ${bimNum}º Bimestre previstas no Currículo Paulista para a ${grade || 'série indicada'}.`;
    let obj = `Objetos de conhecimento da Semana ${wk} de ${cleanSubName} - Eixo Temático ${wk}`;

    return {
      id: `custom_skill_b${bimNum}_${wk}`,
      bimestre: bimNum,
      week: wk,
      code,
      description: desc,
      objectOfKnowledge: obj,
      estimatedClasses: 2,
      unit: `${cleanSubName} - ${bimNum}º Bimestre SEDUC-SP`,
      subject: cleanSubName,
      lessonRange,
      sourceReference: `${lessonRangePlural} • Base Curricular Oficial SEDUC-SP`
    };
  });
}

/**
 * Parses Escopo e Sequência from CSV or XLSX with dynamic discipline and bimestre filtering.
 */
export async function parseScopeSequence(
  fileBuffer: ArrayBuffer,
  fileFormat: string,
  filterOptions?: { subject?: string; bimestre?: string; grade?: string }
): Promise<ScopeSkill[]> {
  const targetSubject = normalizeTextClean(filterOptions?.subject || '');
  const targetBimestreNum = filterOptions?.bimestre ? extractBimestreNumber(filterOptions.bimestre) : 0;

  try {
    if (fileFormat === 'csv') {
      const text = new TextDecoder('utf-8').decode(fileBuffer);
      const parsed = Papa.parse<any>(text, { header: true, skipEmptyLines: true });
      if (parsed.data && parsed.data.length > 0) {
        const skills: ScopeSkill[] = [];

        parsed.data.forEach((row, idx) => {
          // Normalize row values for filtering
          const rowSubject = normalizeTextClean(
            row.Disciplina || row.disciplina || row.Componente || row.componente || 
            row.Materia || row.materia || row['Componente Curricular'] || ''
          );
          const rowBimestreRaw = row.Bimestre || row.bimestre || row.Bim || row.bim || '';
          const rowBimNum = rowBimestreRaw ? extractBimestreNumber(rowBimestreRaw) : 0;

          // Check subject filter if present
          if (targetSubject && rowSubject) {
            if (!rowSubject.includes(targetSubject) && !targetSubject.includes(rowSubject)) {
              return; // Skip if subject does not match
            }
          }

          // Check bimestre filter if present
          if (targetBimestreNum > 0 && rowBimNum > 0) {
            if (rowBimNum !== targetBimestreNum) {
              return; // Skip if bimestre does not match
            }
          }

          const rawCode = String(row.Codigo_Habilidade || row.codigo || row.Codigo || row.habilidade || '').trim();
          const desc = String(row.Descricao_Habilidade || row.descricao || row.Habilidade || row.desc || '').trim();
          const obj = String(row.Objeto_de_Conhecimento || row.objeto || row.Conteudo || row.conteudo || '').trim();

          // Extract code regex if raw code is empty
          let code = rawCode;
          if (!code && desc) {
            const match = desc.match(/(?:EF|EM)\d{2}[A-Z]{2,4}\d{2}/i);
            if (match) code = match[0].toUpperCase();
          }
          if (!code) {
            code = `HAB-${idx + 1}`;
          }

          if (code || desc || obj) {
            skills.push({
              id: `csv_skill_${idx}`,
              bimestre: rowBimNum || targetBimestreNum || 1,
              week: parseInt(row.Semana_Prevista || row.semana || row.Semana || String(skills.length + 1), 10),
              code,
              description: desc || `Habilidade de ${filterOptions?.subject || 'Currículo Paulista'}`,
              objectOfKnowledge: obj || 'Conteúdo curricular estruturante',
              estimatedClasses: parseInt(row.Aulas_Previstas || row.aulas || '4', 10),
              unit: row.Unidade_Tematica || row.unidade || filterOptions?.subject || 'Geral',
              subject: rowSubject || filterOptions?.subject
            });
          }
        });

        if (skills.length > 0) {
          return organizeSkillsIntoWeeklyClassPairs(skills, targetBimestreNum || 4, filterOptions?.subject || 'Química', filterOptions?.grade);
        }
      }
    } else if (fileFormat === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(fileBuffer);
      const skills: ScopeSkill[] = [];

      // Scan all worksheets to find sheets matching targetSubject or targetBimestre
      const matchingSheets: ExcelJS.Worksheet[] = [];
      const otherSheets: ExcelJS.Worksheet[] = [];

      workbook.eachSheet((ws) => {
        const normSheetName = normalizeTextClean(ws.name);
        const matchesSubject = targetSubject && normSheetName.includes(targetSubject);
        const matchesBim = targetBimestreNum > 0 && (
          normSheetName.includes(`${targetBimestreNum}b`) || 
          normSheetName.includes(`${targetBimestreNum}º`) ||
          normSheetName.includes(`bimestre ${targetBimestreNum}`) ||
          normSheetName.includes(`bim ${targetBimestreNum}`)
        );

        if (matchesSubject || matchesBim) {
          matchingSheets.push(ws);
        } else {
          otherSheets.push(ws);
        }
      });

      const sheetsToScan = matchingSheets.length > 0 ? matchingSheets : otherSheets;

      sheetsToScan.forEach((sheet) => {
        let headerRowIdx = -1;
        let colCode = -1;
        let colDesc = -1;
        let colObj = -1;
        let colSubject = -1;
        let colBim = -1;
        let colWeek = -1;
        let colClasses = -1;

        // Scan first 15 rows to detect columns
        const maxHeaderScan = Math.min(sheet.rowCount || 15, 15);
        for (let r = 1; r <= maxHeaderScan; r++) {
          const row = sheet.getRow(r);
          const cellTexts = row.values ? JSON.stringify(row.values).toLowerCase() : '';
          if (
            cellTexts.includes('habilidade') || 
            cellTexts.includes('código') || 
            cellTexts.includes('codigo') || 
            cellTexts.includes('objeto') ||
            cellTexts.includes('conteúdo')
          ) {
            headerRowIdx = r;
            row.eachCell((cell, colNumber) => {
              const txt = normalizeTextClean(cell.text || String(cell.value || ''));
              if (txt.includes('código') || txt.includes('codigo')) colCode = colNumber;
              else if (txt.includes('habilidade') || txt.includes('descri')) colDesc = colNumber;
              else if (txt.includes('objeto') || txt.includes('conte')) colObj = colNumber;
              else if (txt.includes('disciplina') || txt.includes('componente') || txt.includes('materia')) colSubject = colNumber;
              else if (txt.includes('bimestre') || txt.includes('bim')) colBim = colNumber;
              else if (txt.includes('semana')) colWeek = colNumber;
              else if (txt.includes('aulas') || txt.includes('aula') || txt.includes('carga') || txt.includes('qtd')) colClasses = colNumber;
            });
            break;
          }
        }

        if (headerRowIdx === -1) headerRowIdx = 1;
        if (colCode === -1 && colDesc === -1) {
          colCode = 1;
          colDesc = 2;
          colObj = 3;
        }

        sheet.eachRow((row, rowNumber) => {
          if (rowNumber <= headerRowIdx) return;

          // Check subject filter if column exists
          if (colSubject !== -1 && targetSubject) {
            const rowSubText = normalizeTextClean(row.getCell(colSubject).text);
            if (rowSubText && !rowSubText.includes(targetSubject) && !targetSubject.includes(rowSubText)) {
              return;
            }
          }

          // Check bimestre filter if column exists
          if (colBim !== -1 && targetBimestreNum > 0) {
            const rowBimVal = row.getCell(colBim).text;
            const rBimNum = rowBimVal ? extractBimestreNumber(rowBimVal) : 0;
            if (rBimNum > 0 && rBimNum !== targetBimestreNum) {
              return;
            }
          }

          const rawCode = String(colCode !== -1 ? row.getCell(colCode).text : '').trim();
          const desc = String(colDesc !== -1 ? row.getCell(colDesc).text : '').trim();
          const obj = String(colObj !== -1 ? row.getCell(colObj).text : '').trim();

          let code = rawCode;
          if (!code && desc) {
            const match = desc.match(/(?:EF|EM)\d{2}[A-Z]{2,4}\d{2}/i);
            if (match) code = match[0].toUpperCase();
          }
          if (!code && (desc || obj)) {
            code = `HAB-${skills.length + 1}`;
          }

          if (code || desc || obj) {
            const weekVal = colWeek !== -1 ? parseInt(row.getCell(colWeek).text || '', 10) : skills.length + 1;
            let rowClasses = 2;
            if (colClasses !== -1) {
              const cText = row.getCell(colClasses).text || String(row.getCell(colClasses).value || '');
              const cNum = parseInt(cText.replace(/\D+/g, ''), 10);
              if (!isNaN(cNum) && cNum > 0) rowClasses = cNum;
            }
            skills.push({
              id: `xlsx_skill_${sheet.name}_${rowNumber}`,
              bimestre: targetBimestreNum || 1,
              week: isNaN(weekVal) ? skills.length + 1 : weekVal,
              code,
              description: desc || `Habilidade de ${filterOptions?.subject || 'Currículo Paulista'}`,
              objectOfKnowledge: obj || 'Conteúdo curricular estruturante',
              estimatedClasses: rowClasses,
              unit: sheet.name || filterOptions?.subject || 'Currículo Paulista',
              subject: filterOptions?.subject
            });
          }
        });
      });

      if (skills.length > 0) {
        return organizeSkillsIntoWeeklyClassPairs(skills, targetBimestreNum || 4, filterOptions?.subject || 'Química', filterOptions?.grade);
      }
    }
  } catch (err) {
    console.warn('Erro ao fazer parse de escopo personalizado, usando gerador dinâmico por disciplina:', err);
  }

  // If user specified a subject and it is NOT Matemática, generate authentic curriculum for that discipline
  if (filterOptions?.subject && !targetSubject.includes('matem')) {
    return generateFallbackSubjectSkills(filterOptions.subject, filterOptions.bimestre, filterOptions.grade);
  }

  // If user explicitly specified Matemática or left empty
  return SAMPLE_SCOPE_SKILLS;
}

/**
 * Strips bullet marks, stray symbols, parenthetical leftovers and extra whitespace from pedagogical text
 */
export function cleanPedagogicalText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[•·\*\-\–\—\(\)\[\]]+/g, ' ')
    .replace(/\s*[•·\*]+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


/**
 * Authentic SEDUC-SP curriculum catalog for high-fidelity fallback when PDF text has empty placeholders or brief bullet codes
 */
export function getOfficialSkillCatalog(code: string, subject: string = '', bimNum: number = 4): { desc: string; obj: string } | null {
  const normCode = (code || '').toUpperCase().trim();
  const normSub = normalizeTextClean(subject);

  const catalog: Record<string, { desc: string; obj: string }> = {
    // 4º Bimestre - Química EM
    'EM13CNT303': {
      desc: 'Compreender o conceito de equilíbrio químico dinâmico e calcular a constante de equilíbrio Kc e Kp em sistemas gasosos e homogêneos.',
      obj: 'Equilíbrio químico: constante de equilíbrio Kc e Princípio de Le Chatelier'
    },
    'EM13CNT304': {
      desc: 'Analisar o equilíbrio iônico da água, escala de pH e pOH, hidrólise salina e soluções tampão no cotidiano e no organismo humano.',
      obj: 'Equilíbrio iônico da água, escala de pH/pOH, indicadores ácido-base e chuva ácida'
    },
    'EM13CNT305': {
      desc: 'Identificar as características estruturais dos hidrocarbonetos e das principais funções orgânicas oxigenadas no cotidiano e na indústria.',
      obj: 'Introdução à Química Orgânica: cadeias carbônicas, hidrocarbonetos e funções oxigenadas'
    },
    'EM13CNT306': {
      desc: 'Investigar os processos eletroquímicos espontâneos (pilhas e baterias) e reações de oxirredução na produção de energia limpa.',
      obj: 'Eletroquímica: reações de oxirredução, pilhas eletroquímicas e potenciais de redução'
    },
    'EM13CNT307': {
      desc: 'Avaliar os impactos ambientais de combustíveis fósseis, biocarburantes e polímeros sintéticos, propondo práticas sustentáveis alinhadas aos ODS.',
      obj: 'Química verde, biocombustíveis, polímeros sintéticos e sustentabilidade ambiental'
    },
    'EM13CNT105': {
      desc: 'Analisar os ciclos biogeoquímicos e a dinâmica das transformações químicas na atmosfera, hidrosfera e litosfera, avaliando impactos socioambientais.',
      obj: 'Ciclos biogeoquímicos, química da atmosfera e transformações ambientais sustentáveis'
    },
    // 1º Bimestre - Química EM
    'EM13CNT101': {
      desc: 'Analisar e representar transformações químicas e fenômenos cotidianos com base nos modelos atômicos clássicos e modernos.',
      obj: 'Modelos atômicos e distribuição eletrônica nas transformações químicas'
    },
    'EM13CNT102': {
      desc: 'Explicar a formação de substâncias a partir das ligações químicas (iônica, covalente e metálica) e suas propriedades.',
      obj: 'Ligações químicas interatômicas e tabela periódica'
    },
    // Educação Financeira EM
    'EM13MAT317': {
      desc: 'Elaborar um plano de metas financeiras (curto, médio e longo prazo) com projeções orçamentárias e previdência.',
      obj: 'Projeto de vida financeiro, previdência e tomada de decisão econômica responsável'
    },
    'EM13MAT318': {
      desc: 'Analisar impactos macroeconômicos, tributação, impostos diretos e indiretos no planejamento individual.',
      obj: 'Cidadania fiscal, tributação e investimentos de renda variável'
    },
    'EM13MAT319': {
      desc: 'Desenvolver projeto de empreendedorismo ou plano de ação financeira sustentável para a comunidade.',
      obj: 'Empreendedorismo jovem e sustentabilidade financeira comunitária'
    }
  };

  if (catalog[normCode]) {
    return catalog[normCode];
  }

  // Fallback by subject for 4th bimestre if Chemistry
  if (normSub.includes('quim') || normSub.includes('quím')) {
    const defaultQuim4: Record<number, { desc: string; obj: string }> = {
      1: {
        desc: 'Compreender o conceito de equilíbrio químico dinâmico e calcular a constante de equilíbrio Kc e Kp em sistemas gasosos e homogêneos.',
        obj: 'Equilíbrio químico: constante de equilíbrio Kc e Princípio de Le Chatelier'
      },
      2: {
        desc: 'Analisar o equilíbrio iônico da água, escala de pH e pOH, hidrólise salina e soluções tampão no cotidiano e no organismo humano.',
        obj: 'Equilíbrio iônico da água, escala de pH/pOH, indicadores ácido-base e chuva ácida'
      },
      3: {
        desc: 'Identificar as características estruturais dos hidrocarbonetos e das principais funções orgânicas oxigenadas no cotidiano e na indústria.',
        obj: 'Introdução à Química Orgânica: cadeias carbônicas, hidrocarbonetos e funções oxigenadas'
      },
      4: {
        desc: 'Investigar os processos eletroquímicos espontâneos (pilhas e baterias) e reações de oxirredução na produção de energia limpa.',
        obj: 'Eletroquímica: reações de oxirredução, pilhas eletroquímicas e potenciais de redução'
      },
      5: {
        desc: 'Avaliar os impactos ambientais de combustíveis fósseis, biocarburantes e polímeros sintéticos, propondo práticas sustentáveis alinhadas aos ODS.',
        obj: 'Química verde, biocombustíveis, polímeros sintéticos e sustentabilidade ambiental'
      }
    };
    return defaultQuim4[1];
  }

  return null;
}

/**
 * Extracts raw text from a PDF ArrayBuffer or Uint8Array in browser or node
 */
export interface PdfPageEntry {
  pageNumber: number;
  text: string;
}

export interface PdfExtractionResult {
  fullText: string;
  pages: PdfPageEntry[];
  totalPages: number;
}

export async function extractPdfTextWithPages(buffer: ArrayBuffer | Uint8Array): Promise<PdfExtractionResult> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let fullText = '';
  let pages: PdfPageEntry[] = [];
  let totalPages = 0;

  // Attempt 1: Call backend API if running in browser
  try {
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      let binary = '';
      const len = bytes.byteLength;
      const chunkSize = 8192;
      for (let i = 0; i < len; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
        binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
      }
      const base64 = btoa(binary);

      const resp = await fetch('/api/extract-pdf-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: base64 })
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json.text) fullText = json.text;
        if (Array.isArray(json.pages) && json.pages.length > 0) {
          pages = json.pages;
        }
        totalPages = json.totalPages || pages.length;
      }
    }
  } catch (err) {
    console.warn('Fallback extracting text locally from PDF:', err);
  }

  // Attempt 2: Try pdf-lib object stream extraction
  if (!fullText) {
    try {
      const pdfDoc = await PDFDocument.load(bytes);
      const pdfPages = pdfDoc.getPages();
      totalPages = pdfPages.length;
      let textAccum = '';
      for (let i = 0; i < pdfPages.length; i++) {
        const pageMarker = `\n--- PÁGINA ${i + 1} ---\n`;
        textAccum += pageMarker;
        pages.push({ pageNumber: i + 1, text: pageMarker });
      }
      if (textAccum.trim().length > 10) fullText = textAccum;
    } catch (e) {
      // ignore
    }
  }

  // If pages are still empty but fullText has page markers
  if (pages.length === 0 && fullText) {
    const pageMarkerRegex = /---\s*PÁGINA\s+(\d+)\s*---/gi;
    let match;
    let lastIdx = 0;
    let lastPageNum = 1;
    while ((match = pageMarkerRegex.exec(fullText)) !== null) {
      if (lastIdx > 0 || match.index > 0) {
        const chunk = fullText.substring(lastIdx, match.index).trim();
        if (chunk) pages.push({ pageNumber: lastPageNum, text: chunk });
      }
      lastPageNum = parseInt(match[1], 10) || (pages.length + 1);
      lastIdx = match.index + match[0].length;
    }
    const finalChunk = fullText.substring(lastIdx).trim();
    if (finalChunk) {
      pages.push({ pageNumber: lastPageNum, text: finalChunk });
    }
  }

  return {
    fullText: fullText || '',
    pages,
    totalPages: totalPages || pages.length || 1
  };
}

export async function extractTextFromPdfBuffer(buffer: ArrayBuffer | Uint8Array): Promise<string> {
  const result = await extractPdfTextWithPages(buffer);
  return result.fullText;
}

/**
 * Parses and extracts prioritized skills from a "Guia de Habilidades Priorizadas" (PDF text or buffer),
 * executing a strict 4-Level Hierarchical Funnel:
 *   Level 1: Componente Curricular / Disciplina (ex: Química)
 *   Level 2: Série / Ano (ex: 1ª Série, Ensino Médio)
 *   Level 3: Bimestre (ex: 4º Bimestre)
 *   Level 4: Subseção interna de 'Escopo e Sequência' / 'Distribuição Semanal'
 * Strictly eliminating stray bullet points ("• •") and ensuring complete pedagogical text.
 */
export async function parsePrioritizedGuidePdf(
  rawTextOrBuffer: string | ArrayBuffer,
  filterOptions?: { subject?: string; bimestre?: string; grade?: string; plannedClasses?: number | string }
): Promise<ScopeSkill[]> {
  let fullText = '';
  if (typeof rawTextOrBuffer === 'string') {
    fullText = rawTextOrBuffer;
  } else {
    fullText = await extractTextFromPdfBuffer(rawTextOrBuffer);
  }

  // Target filters
  const targetSubNorm = normalizeTextClean(filterOptions?.subject || '');
  const targetBimNum = filterOptions?.bimestre ? extractBimestreNumber(filterOptions.bimestre) : 4;
  const targetGradeNorm = normalizeTextClean(filterOptions?.grade || '');

  // Split into lines or paragraphs
  const lines = fullText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const prioritizedSkills: ScopeSkill[] = [];
  const scopeAndSequenceSkills: ScopeSkill[] = [];

  // Skill code regex: matches EF09MA01, EM13CNT101, EM13CNT303, EM13CNT105, etc.
  const skillRegex = /\b(E[FM]\d{2}[A-Z]{2,4}\d{2,3}[A-Z]?)\b/i;

  let currentSectionSubject = '';
  let currentSectionGrade = '';
  let currentSectionBim = 0;
  let inScopeAndSequenceSubsection = false;
  let currentPageNumber = 1;

  lines.forEach((line, idx) => {
    // Detect page transition markers (e.g. --- PÁGINA 42 ---)
    const pageMatch = line.match(/---\s*(?:PÁGINA|PAGINA|PAGE)\s*(\d+)\s*---/i);
    if (pageMatch) {
      currentPageNumber = parseInt(pageMatch[1], 10) || currentPageNumber;
      return;
    }

    const lineNorm = normalizeTextClean(line);

    // NÍVEL 1: Componente Curricular / Disciplina
    if (lineNorm.includes('quimica') || lineNorm.includes('quim')) currentSectionSubject = 'Química';
    else if (lineNorm.includes('educacao financeira') || lineNorm.includes('financeira')) currentSectionSubject = 'Educação Financeira';
    else if (lineNorm.includes('lingua portuguesa') || lineNorm.includes('portugues')) currentSectionSubject = 'Língua Portuguesa';
    else if (lineNorm.includes('matematica') || lineNorm.includes('matemat')) currentSectionSubject = 'Matemática';
    else if (lineNorm.includes('fisica')) currentSectionSubject = 'Física';
    else if (lineNorm.includes('biologia')) currentSectionSubject = 'Biologia';
    else if (lineNorm.includes('historia')) currentSectionSubject = 'História';
    else if (lineNorm.includes('geografia')) currentSectionSubject = 'Geografia';
    else if (lineNorm.includes('filosofia')) currentSectionSubject = 'Filosofia';
    else if (lineNorm.includes('sociologia')) currentSectionSubject = 'Sociologia';
    else if (lineNorm.includes('ingles') || lineNorm.includes('lingua inglesa')) currentSectionSubject = 'Língua Inglesa';
    else if (lineNorm.includes('arte')) currentSectionSubject = 'Arte';
    else if (lineNorm.includes('educacao fisica')) currentSectionSubject = 'Educação Física';

    // NÍVEL 2: Ano / Série
    if (lineNorm.includes('1ª serie') || lineNorm.includes('1a serie') || lineNorm.includes('1 serie') || lineNorm.includes('1º ano') || lineNorm.includes('1 ano')) {
      currentSectionGrade = '1ª Série';
    } else if (lineNorm.includes('2ª serie') || lineNorm.includes('2a serie') || lineNorm.includes('2 serie') || lineNorm.includes('2º ano') || lineNorm.includes('2 ano')) {
      currentSectionGrade = '2ª Série';
    } else if (lineNorm.includes('3ª serie') || lineNorm.includes('3a serie') || lineNorm.includes('3 serie') || lineNorm.includes('3º ano') || lineNorm.includes('3 ano')) {
      currentSectionGrade = '3ª Série';
    } else if (lineNorm.includes('9º ano') || lineNorm.includes('9o ano') || lineNorm.includes('9 ano')) {
      currentSectionGrade = '9º Ano';
    }

    // NÍVEL 3: Bimestre
    let detectedNewBim = 0;
    if (lineNorm.includes('4º bimestre') || lineNorm.includes('4o bimestre') || lineNorm.includes('4º bim') || lineNorm.includes('4o bim') || lineNorm.includes('4b') || lineNorm.includes('quarto bimestre')) {
      detectedNewBim = 4;
    } else if (lineNorm.includes('3º bimestre') || lineNorm.includes('3o bimestre') || lineNorm.includes('3º bim') || lineNorm.includes('3o bim') || lineNorm.includes('3b') || lineNorm.includes('terceiro bimestre')) {
      detectedNewBim = 3;
    } else if (lineNorm.includes('2º bimestre') || lineNorm.includes('2o bimestre') || lineNorm.includes('2º bim') || lineNorm.includes('2o bim') || lineNorm.includes('2b') || lineNorm.includes('segundo bimestre')) {
      detectedNewBim = 2;
    } else if (lineNorm.includes('1º bimestre') || lineNorm.includes('1o bimestre') || lineNorm.includes('1º bim') || lineNorm.includes('1o bim') || lineNorm.includes('1b') || lineNorm.includes('primeiro bimestre')) {
      detectedNewBim = 1;
    }

    if (detectedNewBim > 0) {
      currentSectionBim = detectedNewBim;
      inScopeAndSequenceSubsection = false;
    }

    // NÍVEL 4: Subseção 'Escopo e Sequência' / 'Distribuição Semanal'
    if (
      lineNorm.includes('escopo e sequencia') ||
      lineNorm.includes('quadro de distribuicao') ||
      lineNorm.includes('sequencia didatica') ||
      lineNorm.includes('distribuicao semanal') ||
      (lineNorm.includes('semana') && (lineNorm.includes('aula') || lineNorm.includes('objeto') || lineNorm.includes('habilidade')))
    ) {
      inScopeAndSequenceSubsection = true;
    }

    // STRICT FUNNEL CHECKS:
    if (targetBimNum > 0 && currentSectionBim > 0 && currentSectionBim !== targetBimNum) {
      return; // Skip if in another bimestre (e.g. 1º, 2º or 3º Bimestre)
    }

    if (targetSubNorm && currentSectionSubject) {
      const secSubNorm = normalizeTextClean(currentSectionSubject);
      if (!secSubNorm.includes(targetSubNorm) && !targetSubNorm.includes(secSubNorm)) {
        return; // In another subject -> Skip
      }
    }

    if (targetGradeNorm && currentSectionGrade) {
      const secGradeNorm = normalizeTextClean(currentSectionGrade);
      if (targetGradeNorm.includes('1') && !secGradeNorm.includes('1')) return;
      if (targetGradeNorm.includes('2') && !secGradeNorm.includes('2')) return;
      if (targetGradeNorm.includes('3') && !secGradeNorm.includes('3')) return;
      if (targetGradeNorm.includes('9') && !secGradeNorm.includes('9')) return;
    }

    const match = line.match(skillRegex);
    if (match) {
      const code = match[1].toUpperCase();

      // Prohibit introductory 1st bimestre skills and irrelevant skills when target is 4th bimestre
      if (targetBimNum === 4 && (code === 'EM13CNT101' || code === 'EM13CNT102' || code === 'EM13CNT103' || code === 'EM13CNT105')) {
        return;
      }

      // If currentSectionBim was never detected yet, require explicit bimestre match on nearby context
      if (targetBimNum > 0 && currentSectionBim === 0) {
        const localContext = lines.slice(Math.max(0, idx - 2), idx + 2).join(' ').toLowerCase();
        const hasBimMatch = localContext.includes(`${targetBimNum}º`) || localContext.includes(`${targetBimNum}o`) || localContext.includes(`bimestre ${targetBimNum}`) || localContext.includes(`${targetBimNum}b`);
        if (!hasBimMatch) {
          return;
        }
      }

      // Extract description safely, removing bullets and stray markers
      const rawWithoutCode = line.replace(new RegExp(`\\(?\\[?${match[0]}\\]?\\)?`, 'gi'), '');
      let description = cleanPedagogicalText(rawWithoutCode);

      // If description is empty or noisy bullet artifact, scan forward for a real phrase
      if (description.length < 10 || description.toLowerCase().includes('habilidade prioritaria')) {
        for (let k = idx + 1; k <= Math.min(idx + 3, lines.length - 1); k++) {
          const cand = cleanPedagogicalText(lines[k]);
          if (cand.length >= 15 && !lines[k].match(skillRegex)) {
            description = cand;
            break;
          }
        }
      }

      // Retrieve catalog information to ensure complete phrases and zero empty placeholders
      const catalogEntry = getOfficialSkillCatalog(code, currentSectionSubject || filterOptions?.subject || '', targetBimNum);
      if ((!description || description.length < 10) && catalogEntry?.desc) {
        description = catalogEntry.desc;
      }

      // Detect pedagogical columns from surrounding lines (within 5 lines forward)
      let objectOfKnowledge = '';
      let learningObjectives = '';
      let methodology = '';
      let stepByStep = '';
      let assessment = '';
      let recovery = '';

      for (let j = idx + 1; j <= Math.min(idx + 5, lines.length - 1); j++) {
        const nextLine = lines[j];
        const nextNorm = normalizeTextClean(nextLine);

        if (nextNorm.includes('objeto') || nextNorm.includes('conteudo') || nextNorm.includes('tema')) {
          const rawObj = nextLine.replace(/^(objeto|conteúdo|conteudo|tema)[s\s:]*/i, '');
          objectOfKnowledge = cleanPedagogicalText(rawObj);
        } else if (nextNorm.includes('objetivo') || nextNorm.includes('foco')) {
          const rawObjt = nextLine.replace(/^(objetivo|foco)[s\s:]*/i, '');
          learningObjectives = cleanPedagogicalText(rawObjt);
        } else if (nextNorm.includes('metodolog') || nextNorm.includes('estrateg')) {
          const rawMeth = nextLine.replace(/^(metodologia|estratégia)[s\s:]*/i, '');
          methodology = cleanPedagogicalText(rawMeth);
        } else if (nextNorm.includes('passo a passo') || nextNorm.includes('desenvolvimento') || nextNorm.includes('encaminha')) {
          const rawStep = nextLine.replace(/^(passo a passo|desenvolvimento|encaminhamento)[s\s:]*/i, '');
          stepByStep = cleanPedagogicalText(rawStep);
        } else if (nextNorm.includes('avalia') || nextNorm.includes('instrumento')) {
          const rawEval = nextLine.replace(/^(avaliação|instrumentos)[s\s:]*/i, '');
          assessment = cleanPedagogicalText(rawEval);
        } else if (nextNorm.includes('recupera') || nextNorm.includes('ajuste') || nextNorm.includes('sei')) {
          const rawRec = nextLine.replace(/^(recuperação|ajustes|sei)[s\s:]*/i, '');
          recovery = cleanPedagogicalText(rawRec);
        }
      }

      if (!objectOfKnowledge || objectOfKnowledge.length < 8) {
        if (catalogEntry?.obj) {
          objectOfKnowledge = catalogEntry.obj;
        } else {
          objectOfKnowledge = `Foco pedagógico e objetos de conhecimento do ${targetBimNum}º Bimestre (${currentSectionSubject || filterOptions?.subject || 'Química'})`;
        }
      }

      const cleanTopic = cleanPedagogicalText(objectOfKnowledge || description);
      const currentWeekNumber = (inScopeAndSequenceSubsection ? scopeAndSequenceSkills.length : prioritizedSkills.length) + 1;

      // Benchmark skill lookup for complete weekly pedagogical differentiation
      const benchmarkSkills = generateFallbackSubjectSkills(currentSectionSubject || filterOptions?.subject || 'Química', targetBimNum, filterOptions?.grade, filterOptions?.plannedClasses);
      const benchmark = benchmarkSkills[Math.min(currentWeekNumber - 1, benchmarkSkills.length - 1)];

      if (!learningObjectives || learningObjectives.length < 15 || learningObjectives.includes('•')) {
        learningObjectives = benchmark?.learningObjectives || `Compreender e aplicar os conceitos fundamentais de ${cleanTopic} em situações contextualizadas.`;
      }
      if (!methodology || methodology.length < 15 || methodology.includes('•')) {
        methodology = benchmark?.methodology || `Metodologia ativa articulada à resolução orientada de problemas com suporte do Material Digital SEDUC-SP.`;
      }
      if (!stepByStep || stepByStep.length < 15 || stepByStep.includes('•')) {
        stepByStep = benchmark?.stepByStep || `1. Acolhida e problematização contextualizada (10 min). 2. Desenvolvimento prático em duplas (25 min). 3. Sistematização no caderno (15 min).`;
      }
      if (!assessment || assessment.length < 15 || assessment.includes('•')) {
        assessment = benchmark?.assessment || `Rubrica formativa de acompanhamento da participação e precisão conceitual dos exercícios práticos propostos.`;
      }
      if (!recovery || recovery.length < 15 || recovery.includes('•')) {
        recovery = benchmark?.recovery || `Intervenção diagnóstica pontual com atendimento individualizado e listas temáticas de nivelamento.`;
      }

      const startLesson = (currentWeekNumber * 2) - 1;
      const endLesson = currentWeekNumber * 2;
      const lessonRange = `Aula ${startLesson} e ${endLesson}`;
      const lessonRangePlural = `Aulas ${startLesson} e ${endLesson}`;

      const structuredSkill: ScopeSkill = {
        id: `pdf_prioritized_b${targetBimNum}_${code}_${currentWeekNumber}`,
        bimestre: targetBimNum,
        week: currentWeekNumber,
        code,
        description: description || benchmark?.description || `Habilidade essencial do ${targetBimNum}º Bimestre (${filterOptions?.subject || currentSectionSubject})`,
        objectOfKnowledge,
        estimatedClasses: 2,
        unit: inScopeAndSequenceSubsection
          ? `Escopo e Sequência SEDUC-SP - ${targetBimNum}º Bimestre`
          : `Habilidades Priorizadas SEDUC-SP - ${targetBimNum}º Bimestre`,
        subject: currentSectionSubject || filterOptions?.subject,
        learningObjectives,
        methodology,
        stepByStep,
        assessment,
        recovery,
        lessonRange,
        sourcePage: currentPageNumber,
        sourceReference: `${lessonRangePlural} • Pág. ${currentPageNumber} - Guia Priorizado PDF`
      };

      if (inScopeAndSequenceSubsection) {
        scopeAndSequenceSkills.push(structuredSkill);
      } else {
        prioritizedSkills.push(structuredSkill);
      }
    }
  });

  const subjectName = filterOptions?.subject || currentSectionSubject || 'Química';
  const gradeName = filterOptions?.grade || currentSectionGrade || '1ª Série';

  // PRIORITY 1: Return skills found strictly inside the internal "Escopo e Sequência" subsection of the PDF
  if (scopeAndSequenceSkills.length > 0) {
    return organizeSkillsIntoWeeklyClassPairs(scopeAndSequenceSkills, targetBimNum, subjectName, gradeName, filterOptions?.plannedClasses);
  }

  // PRIORITY 2: Return skills extracted from the target bimestre section of the PDF
  if (prioritizedSkills.length > 0) {
    return organizeSkillsIntoWeeklyClassPairs(prioritizedSkills, targetBimNum, subjectName, gradeName, filterOptions?.plannedClasses);
  }

  // PRIORITY 3: Fallback strictly to official curriculum of target bimestre (never 1º Bimestre)
  if (filterOptions?.subject) {
    return generateFallbackSubjectSkills(filterOptions.subject, targetBimNum, filterOptions.grade, filterOptions?.plannedClasses);
  }

  return organizeSkillsIntoWeeklyClassPairs(SAMPLE_SCOPE_SKILLS, targetBimNum, 'Química', '1ª Série', filterOptions?.plannedClasses);
}

/**
 * Organizes curriculum skills into weekly 2-class pairs guaranteeing 100% coverage
 * from Aula 1 up to the planned classes limit (12 a 14 aulas, 6 a 7 semanas) without discarding any class.
 */
export function organizeSkillsIntoWeeklyClassPairs(
  skills: ScopeSkill[],
  targetBimNum: number = 4,
  subject: string = 'Educação Financeira',
  grade: string = '1ª Série',
  plannedClasses: number | string = 16
): ScopeSkill[] {
  const parsedClasses = typeof plannedClasses === 'number' ? plannedClasses : parseInt(String(plannedClasses || '').replace(/\D+/g, ''), 10);
  const effectiveClasses = (!isNaN(parsedClasses) && parsedClasses >= 8 && parsedClasses <= 18) ? parsedClasses : 16;
  const totalWeeks = 11;
  const benchmarkSkills = generateFallbackSubjectSkills(subject, targetBimNum, grade, effectiveClasses);
  const result: ScopeSkill[] = [];

  // Filtrar habilidades regulares do documento do Escopo (sem blocos de recuperação/fechamento)
  const regularSkills = skills.filter((s: any) => {
    const code = String(s.code || '').toUpperCase();
    const desc = String(s.description || s.desc || '').toLowerCase();
    return !code.includes('SEI') && !code.includes('FECH') && !code.includes('CONSELHO') && !desc.includes('conselho') && !desc.includes('fechamento');
  });

  for (let w = 1; w <= totalWeeks; w++) {
    // Semana 10: SEI - Semana de Estudos Intensivos / Recuperação e Nivelamento
    if (w === 10) {
      const benchmark = benchmarkSkills.find(b => b.week === 10) || benchmarkSkills[benchmarkSkills.length - 2];
      result.push({
        id: `scope_week_${w}_sei`,
        bimestre: targetBimNum,
        week: w,
        code: 'SEI-RECUPERACAO',
        description: 'Semana de Estudos Intensivos (SEI): Retomada, recuperação contínua e nivelamento das aprendizagens prioritárias.',
        objectOfKnowledge: 'Recuperação Contínua (SEI): superação de defasagens em conceitos essenciais e nivelamento das habilidades prioritárias',
        estimatedClasses: 2,
        unit: `${subject} - SEI`,
        subject,
        learningObjectives: 'Retomar e consolidar as habilidades essenciais que apresentaram maior defasagem nas avaliações formativas do bimestre.',
        methodology: 'Estações rotativas de aprendizagem com intervenção pedagógica direta e apoio do Material Digital SEDUC-SP.',
        stepByStep: '1. Acolhida e alinhamento de metas da SEI (10 min). 2. Desafios práticos em duplas por descritores críticos (25 min). 3. Pós-teste de nivelamento formativo (15 min) (Total: 50 min). | Transição e Bloco 2: 4. Aprofundamento conceitual guiado (25 min). 5. Síntese e registro final no diário (15 min).',
        assessment: 'Instrumento avaliativo pós-revisão com rubrica de nivelamento e registro formativo no Diário Digital (SED).',
        recovery: 'Devolutiva pedagógica formativa e plano de estudos personalizado.',
        lessonRange: 'Semana de Estudos Intensivos (SEI) / Recuperação e Nivelamento',
        sourceReference: 'Base Curricular Oficial SEDUC-SP • SEI'
      });
      continue;
    }

    // Semana 11: Conselho de Classe / Fechamento de Médias e Frequências
    if (w === 11) {
      result.push({
        id: `scope_week_${w}_closing`,
        bimestre: targetBimNum,
        week: w,
        code: 'CONSELHO-FECHAMENTO',
        description: 'Conselho de Classe e Série / Fechamento Bimestral: Consolidação final de médias, apuração de frequência e análise colegiada de rendimento escolar.',
        objectOfKnowledge: 'Fechamento Bimestral e Conselho de Classe: análise de rendimento escolar e registros no SEDUC-SED',
        estimatedClasses: 0,
        unit: `${subject} - Conselho de Classe`,
        subject,
        learningObjectives: 'Realizar o fechamento de médias, consolidação de frequência e deliberação pedagógica no Conselho de Classe.',
        methodology: 'Reunião colegiada docente e pedagógica para análise de rendimento escolar e consolidação das notas no Sistema de Cadastro de Alunos (SED).',
        stepByStep: '1. Apuração e lançamento final de notas e frequências na plataforma SED (45 min). 2. Participação na reunião do Conselho de Classe com análise dos casos que demandam intervenção especial (45 min) (Total: 90 min).',
        assessment: 'Consolidação dos resultados bimestrais e ata final do Conselho de Classe.',
        recovery: 'Encaminhamentos pedagógicos e plano de acompanhamento para o período seguinte.',
        lessonRange: 'Conselho de Classe / Fechamento de Médias e Frequências',
        sourceReference: 'Regulamento Escolar SEDUC-SP • Conselho de Classe'
      });
      continue;
    }

    // Semana 2: Suspensão Oficial de Aulas em 15/10 (Dia do Professor)
    if (w === 2) {
      result.push({
        id: `scope_week_${w}_suspension`,
        bimestre: targetBimNum,
        week: w,
        code: 'SUSPENSAO-AULAS',
        description: 'Evento Oficial / Suspensão de Aulas: Dia do Professor conforme calendário escolar oficial SEDUC-SP.',
        objectOfKnowledge: 'Suspensão de aulas presenciais - Conteúdo reprogramado',
        estimatedClasses: 0,
        unit: `${subject} - Semana ${w}`,
        subject,
        learningObjectives: 'Sem expediente pedagógico presencial conforme calendário escolar oficial SEDUC-SP.',
        methodology: '-',
        stepByStep: 'Suspensão das atividades letivas em virtude do Dia do Professor. Conteúdo didático reprogramado para o próximo encontro letivo.',
        assessment: '-',
        recovery: '-',
        lessonRange: 'Suspensão de Aulas',
        sourceReference: 'Calendário Escolar Oficial SEDUC-SP'
      });
      continue;
    }

    // Semanas 1 e 3 a 9: Aulas curriculares regulares (Aulas 1 a 16 / 8 pares de aulas geminadas)
    const lessonIndex = w === 1 ? 1 : ((w - 1) * 2 - 1);
    const startLesson = lessonIndex;
    const endLesson = lessonIndex + 1;
    const lessonRange = `Aula ${startLesson} e ${endLesson}`;
    const lessonRangePlural = `Aulas ${startLesson} e ${endLesson}`;

    const regIdx = Math.floor((startLesson - 1) / 2);
    const benchmark = benchmarkSkills[w - 1] || benchmarkSkills[Math.min(regIdx, benchmarkSkills.length - 1)];

    let matchedSkill = regularSkills[regIdx] || skills.find(s => s.week === w) || skills[regIdx];

    if (matchedSkill) {
      const sourcePage = matchedSkill.sourcePage;
      const sourceRef = sourcePage
        ? `${lessonRangePlural} • Pág. ${sourcePage} - Guia Priorizado PDF`
        : (matchedSkill.sourceReference && matchedSkill.sourceReference.toLowerCase().includes('aula')
            ? matchedSkill.sourceReference
            : `${lessonRangePlural} • Base Curricular Oficial SEDUC-SP`);

      result.push({
        ...matchedSkill,
        week: w,
        lessonRange,
        estimatedClasses: 2,
        sourcePage,
        sourceReference: sourceRef,
        learningObjectives: matchedSkill.learningObjectives || benchmark?.learningObjectives || `Articular os objetivos pedagógicos das ${lessonRangePlural}: Compreender e aplicar os conceitos fundamentais de ${cleanPedagogicalText(matchedSkill.objectOfKnowledge || matchedSkill.description || '')} em situações contextualizadas.`,
        methodology: matchedSkill.methodology || benchmark?.methodology || `Estratégia para bloco de 2 aulas geminadas (90-100 min - ${lessonRangePlural}): Ensino por Investigação articulado à resolução orientada de problemas no Material Digital SEDUC-SP.`,
        stepByStep: matchedSkill.stepByStep || benchmark?.stepByStep || `Aula ${startLesson} (45-50 min): 1. Acolhida e problematização disparadora (10 min). 2. Investigação orientada com Material Digital (25 min). 3. Sistematização inicial (10 min). | Transição e Aula ${endLesson} (45-50 min): 4. Aprofundamento prático em duplas (25 min). 5. Síntese e registro no diário de bordo (15 min) (Total: 90-100 min).`,
        assessment: matchedSkill.assessment || benchmark?.assessment || `Observação formativa contínua, análise da produção escrita no diário de bordo e rubrica de participação individual e coletiva nas aulas ${startLesson} e ${endLesson}.`,
        recovery: matchedSkill.recovery || benchmark?.recovery || `Intervenção pedagógica imediata e mediação dirigida para superação pontual de dúvidas conceituais das aulas ${startLesson} e ${endLesson}.`
      });
    } else {
      result.push({
        ...benchmark,
        week: w,
        lessonRange,
        estimatedClasses: 2,
        sourceReference: `${lessonRangePlural} • Base Curricular Oficial SEDUC-SP`
      });
    }
  }

  return result;
}

/**
 * Merges Scope (.xlsx) with Prioritized Guide (.pdf)
 * Prioritizes the essential skills from the PDF guide, integrating them with the weekly timeline of the Scope.
 */
export function mergeScopeAndPrioritizedGuide(
  scopeSkills: ScopeSkill[],
  guideSkills: ScopeSkill[],
  targetBimNum: number = 4,
  subject: string = 'Química',
  grade: string = '1ª Série',
  plannedClasses: number | string = 14
): ScopeSkill[] {
  if (!guideSkills || guideSkills.length === 0) return organizeSkillsIntoWeeklyClassPairs(scopeSkills, targetBimNum, subject, grade, plannedClasses);
  if (!scopeSkills || scopeSkills.length === 0) return organizeSkillsIntoWeeklyClassPairs(guideSkills, targetBimNum, subject, grade, plannedClasses);

  const merged: ScopeSkill[] = [];
  const seenCodes = new Set<string>();

  // 1. Put prioritized guide skills first
  guideSkills.forEach((gSkill, idx) => {
    seenCodes.add(gSkill.code.toUpperCase());
    merged.push({
      ...gSkill,
      week: idx + 1,
      unit: gSkill.unit.includes('Priorit') ? gSkill.unit : `[Priorizada] ${gSkill.unit}`
    });
  });

  // 2. Add remaining scope skills that are not duplicates
  scopeSkills.forEach((sSkill) => {
    if (!seenCodes.has(sSkill.code.toUpperCase())) {
      merged.push({
        ...sSkill,
        week: merged.length + 1
      });
      seenCodes.add(sSkill.code.toUpperCase());
    }
  });

  return organizeSkillsIntoWeeklyClassPairs(merged, targetBimNum, subject, grade, plannedClasses);
}

/**
 * Parses Calendário SEDUC from CSV, XLSX, PDF or text.
 * Aplica ESTRITAMENTE a contagem de dias úteis (segunda a sexta-feira, dayOfWeek 1 a 5),
 * eliminando sábados e domingos por padrão.
 */
export async function parseSeducCalendar(
  fileBuffer: ArrayBuffer,
  fileFormat: string,
  fileName?: string
): Promise<CalendarSummary> {
  const customHolidays: Array<{ date: string; name: string }> = [];
  const detectedYears: number[] = [];

  if (fileName) {
    const fnMatch = fileName.match(/\b(202\d|203\d)\b/);
    if (fnMatch) detectedYears.push(parseInt(fnMatch[1], 10));
  }

  try {
    if (fileFormat === 'csv') {
      const text = new TextDecoder('utf-8').decode(fileBuffer);
      const parsed = Papa.parse<any>(text, { header: true, skipEmptyLines: true });
      if (parsed.data && parsed.data.length > 0) {
        parsed.data.forEach((r: any) => {
          const dt = (r.Data || r.data || r.Data_Evento || r.date || '').trim();
          const nm = (r.Descricao_Evento || r.descricao || r.evento || r.Evento || 'Evento Calendário').trim();
          if (dt) {
            customHolidays.push({ date: dt, name: nm });
            const yM = dt.match(/\b(202\d|203\d)\b/);
            if (yM) detectedYears.push(parseInt(yM[1], 10));
          }
        });
      }
    } else if (fileFormat === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(fileBuffer);
      const sheet = workbook.worksheets[0];
      if (sheet) {
        let colDate = -1;
        let colName = -1;
        sheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) {
            row.eachCell((cell, colNumber) => {
              const txt = normalizeTextClean(cell.text || String(cell.value || ''));
              if (txt.includes('data') || txt.includes('date')) colDate = colNumber;
              else if (txt.includes('evento') || txt.includes('descri') || txt.includes('feriado')) colName = colNumber;
            });
            return;
          }
          if (colDate !== -1) {
            const dateVal = (row.getCell(colDate).text || String(row.getCell(colDate).value || '')).trim();
            const nameVal = colName !== -1 ? (row.getCell(colName).text || String(row.getCell(colName).value || '')).trim() : 'Evento Calendário';
            if (dateVal && dateVal.length >= 5) {
              customHolidays.push({ date: dateVal, name: nameVal || 'Feriado/Recesso' });
              const yM = dateVal.match(/\b(202\d|203\d)\b/);
              if (yM) detectedYears.push(parseInt(yM[1], 10));
            }
          }
        });
      }
    }
  } catch (err) {
    console.warn('Erro no parse do calendário:', err);
  }

  // Detecta o ano letivo dominante a partir das datas do arquivo ou do sistema
  let detectedYear = new Date().getFullYear();
  if (detectedYears.length > 0) {
    const counts = new Map<number, number>();
    detectedYears.forEach(y => counts.set(y, (counts.get(y) || 0) + 1));
    let maxCount = 0;
    for (const [y, count] of counts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        detectedYear = y;
      }
    }
  }

  const officialHolidays = getOfficialSeducHolidays(detectedYear);
  const allHolidays = [...customHolidays];
  officialHolidays.forEach(oh => {
    if (!allHolidays.some(h => normalizeDateKey(h.date, detectedYear) === normalizeDateKey(oh.date, detectedYear))) {
      allHolidays.push(oh);
    }
  });

  // Recalcular os 4 bimestres usando ESTRITAMENTE a varredura de segunda a sexta-feira (dayOfWeek 1 a 5),
  // eliminando rigorosamente sábados e domingos
  const bimestresRecalculados = ([1, 2, 3, 4] as const).map(bNum => {
    const details = getSeducBimestreDetails(bNum, detectedYear, { year: detectedYear, totalSchoolDays: 200, bimestres: [], holidaysAndBreaks: allHolidays });
    return {
      bimestre: bNum,
      periodo: details.periodText,
      startDate: details.startDate,
      endDate: details.endDate,
      diasLetivos: details.diasLetivosJ7,
      diasEfetivos: details.diasEfetivosJ9,
      feriadosRecessos: details.feriadosERecessos.length,
      semanaSEI: bNum === 3 
        ? '25 a 29 de Agosto (Semana 6 - SEI / Fechamento)' 
        : bNum === 4 
        ? '08 a 12 de Dezembro (Semana 10)' 
        : bNum === 2 
        ? '30 de Junho a 04 de Julho (Semana 10)' 
        : '07 a 11 de Abril (Semana 9)',
      semanaAvaliacao: bNum === 3
        ? '15 a 19 de Setembro (Semana 9 - Avaliação Formativa)'
        : bNum === 4
        ? '01 a 05 de Dezembro (Semana 9 - SARESP Oficial)'
        : bNum === 2
        ? '23 a 27 de Junho (Semana 9 - Prova Paulista)'
        : '31 de Março a 04 de Abril (Semana 8 - Prova Paulista)'
    };
  });

  const totalSchoolDays = bimestresRecalculados.reduce((sum, b) => sum + b.diasLetivos, 0);

  return {
    year: detectedYear,
    totalSchoolDays,
    bimestres: bimestresRecalculados,
    holidaysAndBreaks: allHolidays,
    isAutoExtracted: true,
    extractedSource: 'Leitor Dinâmico SEDUC'
  };
}

/**
 * Injects processed data strictly by coordinates into the original file,
 * handling merged cells seamlessly (writing to master cell) and strictly
 * keeping 100% of fonts, borders, fills, formulas, and layouts intact!
 *
 * STRICT REQUIREMENTS:
 * 1. Respects configured startRow (e.g., 28) and NEVER writes weekly lesson data
 *    into rows 16 to 25 when startRow > 16.
 * 2. Writes directly to the active selected worksheet (e.g., "Planejamento Preenchido"
 *    or the primary planning sheet) and marks it as active in the workbook views.
 * 3. Ensures rows from startRow and all rows written are NOT hidden (row.hidden = false)
 *    and line height is preserved/ensured (>= 40px) with full wrapText visibility.
 */
export async function injectDataAndExport(
  fileFormat: 'xlsx' | 'docx' | 'pdf',
  originalBuffer: ArrayBuffer,
  fills: Array<{ id: string; address: string; sheet: string; fillValue: string; row?: number; colLetter?: string; [key: string]: any }>,
  options?: {
    targetSheetName?: string;
    startRow?: number;
    rowCount?: number;
    profile?: CellMapProfile;
    planMetadata?: PlanMetadata;
    calendarData?: CalendarSummary;
    scopeSkills?: ScopeSkill[];
  }
): Promise<ArrayBuffer> {
  if (fileFormat === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(originalBuffer);

    const configuredStartRow = options?.startRow !== undefined
      ? Number(options.startRow)
      : (options?.profile?.startRow !== undefined ? Number(options.profile.startRow) : undefined);

    const configuredRowCount = options?.rowCount !== undefined
      ? Number(options.rowCount)
      : (options?.profile?.rowCount !== undefined ? Number(options.profile.rowCount) : 10);

    const primaryTargetSheetName = String(
      options?.targetSheetName || options?.profile?.targetSheet || ''
    ).trim();

    // 1. Resolve primary active target sheet
    let defaultSheet: ExcelJS.Worksheet | undefined;
    if (primaryTargetSheetName) {
      defaultSheet = workbook.getWorksheet(primaryTargetSheetName) || 
                     workbook.worksheets.find(ws => ws.name.toLowerCase() === primaryTargetSheetName.toLowerCase()) ||
                     workbook.worksheets.find(ws => ws.name.toLowerCase().includes(primaryTargetSheetName.toLowerCase()));
    }

    if (!defaultSheet) {
      // Find the first authentic planning worksheet, or first non-hidden sheet
      defaultSheet = workbook.worksheets.find(ws => 
        ws.name.toLowerCase().includes('planejamento') ||
        ws.name.toLowerCase().includes('bimestre') ||
        ws.name.toLowerCase().includes('plano')
      ) || workbook.worksheets.find(ws => ws.state !== 'hidden') || workbook.worksheets[0];
    }

    // Set workbook views so that the user lands directly on the filled planning sheet
    if (defaultSheet) {
      defaultSheet.state = 'visible';
      const sheetIndex = workbook.worksheets.indexOf(defaultSheet);
      if (sheetIndex >= 0) {
        workbook.views = [
          {
            x: 0,
            y: 0,
            width: 10000,
            height: 20000,
            firstSheet: 0,
            activeTab: sheetIndex,
            visibility: 'visible'
          }
        ];
      }
    }

    // Model row for style inheritance (row 16 in standard SEDUC/URE Taubaté templates)
    const modelRowNumber = 16;
    const rowsWritten = new Set<number>();

    // 2. Write directly to each mapped coordinate
    fills.forEach(f => {
      const targetSheetName = String(f.sheet || primaryTargetSheetName || '').trim();
      const sheet = (targetSheetName ? workbook.getWorksheet(targetSheetName) : null) ||
                    workbook.worksheets.find(ws => ws.name.toLowerCase() === targetSheetName.toLowerCase()) ||
                    defaultSheet ||
                    workbook.worksheets[0];

      if (!sheet) return;

      const addr = normalizeCoordinate(f.address);
      if (!addr) return;

      // Extract row number
      const cellRow = f.row !== undefined 
        ? Number(f.row) 
        : parseInt(addr.replace(/[^\d]/g, ''), 10);

      const isHeaderOrSpecialField = f.id?.startsWith('HDR_') || 
                            f.id?.startsWith('CUSTOM_') ||
                            f.id?.startsWith('EVAL_') ||
                            f.injectionMode === 'ai_prompt' ||
                            f.injectionMode === 'literal' ||
                            addr === 'B17' ||
                            ['D4', 'D5', 'D6', 'H5', 'H6', 'C4', 'C5', 'F3', 'F4', 'A2', 'J7', 'J8', 'J9', 'B17', 'C21', 'C22', 'C23', 'C24', 'J21', 'J22', 'J23', 'J24'].includes(addr);

      // STRICT RULE 1: If user configured startRow (e.g., 28) and startRow > 16,
      // NEVER write weekly lesson data (GRID_*) into rows 16 to 25!
      // BUT NEVER block special fields, custom mapped fields, header fields, evaluation fields, or B17!
      if (configuredStartRow && configuredStartRow > 16) {
        if (!isHeaderOrSpecialField && f.id?.startsWith('GRID_') && cellRow >= 16 && cellRow < configuredStartRow) {
          // Block writing to rows 16-25 when user configured startRow = 28
          return;
        }
      }

      const colLetter = normalizeColLetter(f.colLetter || addr.replace(/\d+/g, ''));

      // STRICT REQUIREMENT: As ÚNICAS colunas que devem permanecer vazias/em branco são a F (Metodologia) e a H (Avaliação).
      // As demais colunas da grade semanal (B, D, E, G, I) DEVEM ser preenchidas linha a linha (a partir da Linha 28).
      if (cellRow >= 28) {
        if (colLetter === 'F' || colLetter === 'H') {
          const emptyCell = sheet.getCell(addr);
          const masterEmpty = emptyCell.isMerged ? (emptyCell.master || emptyCell) : emptyCell;
          masterEmpty.value = '';
          return;
        }
      }

      const cell = sheet.getCell(addr);
      // If the cell is merged (e.g. B13:I13, B15:I15, B17:J17), assign directly to the master root cell
      const targetCell = cell.isMerged ? (cell.master || cell) : cell;

      if (['B13', 'B15', 'B17'].includes(addr) || ['B13', 'B15', 'B17'].includes(targetCell.address)) {
        const fixedKey = (['B13', 'B15', 'B17'].includes(addr) ? addr : targetCell.address) as 'B13' | 'B15' | 'B17';
        targetCell.value = FIXED_IMMUTABLE_CELLS[fixedKey].text;
      } else if (addr === 'J8') {
        const dynamicJ8 = computeSlot2DynamicClasses(options?.scopeSkills, options?.planMetadata);
        targetCell.value = dynamicJ8;
      } else if (['J7', 'J9'].includes(addr)) {
        const parsedInt = parseInt(String(f.fillValue).replace(/\D+/g, ''), 10);
        targetCell.value = !isNaN(parsedInt) ? parsedInt : f.fillValue;
      } else if ((colLetter === 'B' || f.expectedType === 'periodo') && cellRow >= 16) {
        const valStr = String(f.fillValue || '');
        if (!valStr || valStr.includes('29/07') || valStr.toLowerCase().includes('sábado') || valStr.toLowerCase().includes('domingo') || !valStr.toLowerCase().includes('semana')) {
          const wNum = f.weekNumber || (cellRow >= 28 ? cellRow - 27 : 1);
          const bim = options?.planMetadata?.bimestre ? extractBimestreNumber(options.planMetadata.bimestre) : 4;
          const teacherSchedConfig = {
            classDays: options?.planMetadata?.classDays || options?.profile?.classDays || options?.profile?.teacherSchedule?.classDays,
            classesPerDay: options?.planMetadata?.classesPerDay || options?.profile?.classesPerDay || options?.profile?.teacherSchedule?.classesPerDay,
            plannedClasses: Number(options?.planMetadata?.plannedClasses || options?.profile?.plannedClasses || 14),
            rowCount: options?.profile?.rowCount || 10
          };
          const effectiveYear = (options?.planMetadata?.year ? parseInt(String(options.planMetadata.year), 10) : undefined) || options?.calendarData?.year || 2026;
          const weekAllocInfo = getTeacherAllocatedWeekInfo(wNum, bim, options?.profile?.rowCount, options?.calendarData, effectiveYear, teacherSchedConfig);
          targetCell.value = weekAllocInfo?.fullDateText || getSeducWeekPeriodText(wNum, bim, f.isSEI, f.isAvaliacao, options?.profile?.rowCount, options?.calendarData, effectiveYear, teacherSchedConfig);
        } else {
          targetCell.value = f.fillValue;
        }
      } else {
        targetCell.value = f.fillValue;
      }

      rowsWritten.add(cellRow);

      // Format alignment with full word wrap:
      // Tratamento das Células Fixas B13, B15 e B17:
      // Injete na célula raiz, ative quebra automática (wrapText = true) e alinhamento esquerdo
      // preservando 100% das bordas e estilos visuais originais
      if (['B13', 'B15', 'B17'].includes(addr) || ['B13', 'B15', 'B17'].includes(targetCell.address)) {
        targetCell.alignment = {
          ...(targetCell.alignment || {}),
          vertical: 'middle',
          horizontal: 'left',
          wrapText: true
        };
      } else if (['C21', 'C22', 'C23', 'C24'].includes(addr)) {
        targetCell.alignment = {
          ...(targetCell.alignment || {}),
          vertical: targetCell.alignment?.vertical || 'middle',
          horizontal: targetCell.alignment?.horizontal || 'left',
          wrapText: true
        };
      } else if (['J21', 'J22', 'J23', 'J24'].includes(addr)) {
        targetCell.alignment = {
          ...(targetCell.alignment || {}),
          vertical: targetCell.alignment?.vertical || 'middle',
          horizontal: targetCell.alignment?.horizontal || 'center',
          wrapText: true
        };
      } else {
        targetCell.alignment = {
          ...(targetCell.alignment || {}),
          vertical: targetCell.alignment?.vertical || 'middle',
          horizontal: targetCell.alignment?.horizontal || (colLetter === 'B' ? 'center' : 'left'),
          wrapText: true
        };
      }

      // Inherit borders and fonts if targetCell has none (e.g. newly accessed rows like 28+)
      if (!targetCell.border || Object.keys(targetCell.border).length === 0) {
        const modelCell = sheet.getCell(`${colLetter}${modelRowNumber}`);
        if (modelCell && modelCell.border) {
          targetCell.border = JSON.parse(JSON.stringify(modelCell.border));
        } else {
          targetCell.border = {
            top: { style: 'thin', color: { argb: 'CBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'CBD5E1' } },
            left: { style: 'thin', color: { argb: 'CBD5E1' } },
            right: { style: 'thin', color: { argb: 'CBD5E1' } }
          };
        }

        if (modelCell && modelCell.font) {
          targetCell.font = {
            name: modelCell.font.name || 'Calibri',
            size: modelCell.font.size || 10,
            bold: targetCell.font?.bold || modelCell.font.bold || false,
            color: modelCell.font.color || { argb: '1E293B' }
          };
          targetCell.font = {
            name: 'Calibri',
            size: 10,
            bold: colLetter === 'B',
            color: { argb: '1E293B' }
          };
        }
      }

      // Annotate cell with origin traceability note (Excel comment)
      if (f.sourcePage || f.sourceReference) {
        const noteText = f.sourcePage
          ? `[Origem]: Extraído da página ${f.sourcePage} da seção Escopo e Sequência do Guia Priorizado (PDF).`
          : `[Origem]: ${f.sourceReference || 'Base Curricular Oficial SEDUC-SP'}.`;
        try {
          targetCell.note = noteText;
        } catch (e) {
          // ignore if note not supported
        }
      }
    });

    // STRICT RULE: Prioritize and write manual Identification / Header inputs directly
    // to configured profile coordinates (including J7, J8, and J9)
    if (options?.planMetadata && defaultSheet) {
      const hf = options.profile?.headerFields;
      const meta = options.planMetadata;
      const dynamicJ8 = computeSlot2DynamicClasses(options?.scopeSkills, meta);
      const metrics = computeSeducCellMetrics({
        bimestre: meta.bimestre,
        subject: meta.subject,
        grade: meta.grade,
        plannedClassesInput: meta.plannedClasses || dynamicJ8,
        scopeSkills: options?.scopeSkills,
        calendarData: options?.calendarData,
        year: meta.year || options?.calendarData?.year
      });

      const effectiveJ8 = dynamicJ8 || metrics.j8AulasPrevistas;

      const directHeaders = [
        { coord: hf?.schoolCell, val: meta.school, isNumeric: false },
        { coord: hf?.teacherCell, val: meta.teacherName, isNumeric: false },
        { coord: hf?.subjectCell, val: meta.subject, isNumeric: false },
        { coord: hf?.gradeCell, val: meta.grade, isNumeric: false },
        { coord: hf?.bimestreCell, val: meta.bimestre, isNumeric: false },
        { coord: hf?.diasLetivosCell || 'J7', val: meta.diasLetivos !== undefined ? meta.diasLetivos : metrics.j7DiasLetivos, isNumeric: true },
        { coord: hf?.plannedClassesCell || 'J8', val: effectiveJ8, isNumeric: true },
        { coord: hf?.diasEfetivosCell || 'J9', val: meta.diasEfetivos !== undefined ? meta.diasEfetivos : metrics.j9DiasEfetivos, isNumeric: true },
      ];

      directHeaders.forEach(({ coord, val, isNumeric }) => {
        const addr = normalizeCoordinate(coord);
        if (addr && val !== undefined && val !== null && val !== '' && defaultSheet) {
          const cell = defaultSheet.getCell(addr);
          const masterCell = cell.isMerged ? (cell.master || cell) : cell;

          if (isNumeric || ['J7', 'J8', 'J9'].includes(addr)) {
            const parsedInt = parseInt(String(val).replace(/\D+/g, ''), 10);
            masterCell.value = !isNaN(parsedInt) ? parsedInt : val;
          } else {
            masterCell.value = String(val).trim();
          }

          masterCell.alignment = {
            ...(masterCell.alignment || {}),
            vertical: masterCell.alignment?.vertical || 'middle',
            horizontal: masterCell.alignment?.horizontal || 'center',
            wrapText: true
          };
          rowsWritten.add(Number(masterCell.row));
        }
      });
    }

    // STRICT CLOSURE RULE: Clear excess rows beyond configuredRowCount (e.g., weeks 7/8 to 10)
    // so no ghost lessons remain in the exported Excel spreadsheet
    if (configuredStartRow && defaultSheet) {
      const activeRowCount = Math.max(configuredRowCount || 11, 11);
      const excessStartRow = configuredStartRow + activeRowCount;
      const maxExcessRow = Math.max(configuredStartRow + 10, excessStartRow + 4);
      const colsToClear = ['B', 'D', 'E', 'F', 'G', 'H', 'I', 'A', 'C'];
      for (let r = excessStartRow; r <= maxExcessRow; r++) {
        // NUNCA limpe as linhas 21 a 24 (C21:C24 e J21:J24) nem as linhas 13, 15 ou 17 (B13, B15, B17)
        if (r >= 21 && r <= 24) continue;
        if (r === 13 || r === 14 || r === 15 || r === 17) continue;
        colsToClear.forEach(col => {
          if (['C21', 'C22', 'C23', 'C24', 'J21', 'J22', 'J23', 'J24', 'B13', 'B15', 'B17'].includes(`${col}${r}`)) return;
          const c = defaultSheet.getCell(`${col}${r}`);
          if (c) {
            const master = c.isMerged ? (c.master || c) : c;
            master.value = '';
            try { (master as any).note = undefined; } catch (e) {}
          }
        });
      }
    }

    // STRICT RULE: Forçar a escrita explícita dos valores nas células C21, C22, C23, C24 e J21, J22, J23, J24 no arquivo gerado para download
    // Preservando rigorosamente as bordas, fontes, alinhamentos e cores de preenchimento originais de cada uma das 8 células
    if (defaultSheet) {
      const evalFixedSpecs = [
        { addrC: 'C21', defC: 'Prova Paulista', addrJ: 'J21', defJ: '30%' },
        { addrC: 'C22', defC: 'Atividades em Sala e Caderno', addrJ: 'J22', defJ: '30%' },
        { addrC: 'C23', defC: 'Trabalhos e Práticas em Grupo', addrJ: 'J23', defJ: '20%' },
        { addrC: 'C24', defC: 'Avaliação Formativa e SEI', addrJ: 'J24', defJ: '20%' },
      ];

      evalFixedSpecs.forEach(({ addrC, defC, addrJ, defJ }) => {
        const fillItemC = fills.find(f => normalizeCoordinate(f.address) === addrC);
        const fillItemJ = fills.find(f => normalizeCoordinate(f.address) === addrJ);

        const customC = options?.profile?.customCellMappings?.find(cm => normalizeCoordinate(cm.address) === addrC);
        const customJ = options?.profile?.customCellMappings?.find(cm => normalizeCoordinate(cm.address) === addrJ);

        const textC = String(fillItemC?.fillValue || customC?.label || defC).trim() || defC;
        const textJ = String(fillItemJ?.fillValue || customJ?.label || defJ).trim() || defJ;

        // 1. Gravar na Célula C (Instrumento)
        const cellC = defaultSheet.getCell(addrC);
        const masterC = cellC.isMerged ? (cellC.master || cellC) : cellC;
        masterC.value = textC;
        masterC.alignment = {
          ...(masterC.alignment || {}),
          vertical: masterC.alignment?.vertical || 'middle',
          horizontal: masterC.alignment?.horizontal || 'left',
          wrapText: true
        };
        rowsWritten.add(Number(masterC.row));

        // 2. Gravar na Célula J (Peso / Porcentagem)
        const cellJ = defaultSheet.getCell(addrJ);
        const masterJ = cellJ.isMerged ? (cellJ.master || cellJ) : cellJ;
        masterJ.value = textJ;
        masterJ.alignment = {
          ...(masterJ.alignment || {}),
          vertical: masterJ.alignment?.vertical || 'middle',
          horizontal: masterJ.alignment?.horizontal || 'center',
          wrapText: true
        };
        rowsWritten.add(Number(masterJ.row));
      });
    }

    // STRICT RULE: Bloqueio e Preenchimento Estrito das Células Fixas B13, B15 e B17 no ExcelJS
    // Injete obrigatoriamente e exclusivamente os seguintes textos literais fixos:
    // Célula B13, B15 e B17 gravadas na célula raiz correspondente com wrapText = true
    // e preservação de 100% da formatação visual original (cores, bordas, fontes e mesclagens)
    if (defaultSheet) {
      const fixedImmutableSpecs = [
        { addr: 'B13', text: FIXED_IMMUTABLE_CELLS.B13.text },
        { addr: 'B15', text: FIXED_IMMUTABLE_CELLS.B15.text },
        { addr: 'B17', text: FIXED_IMMUTABLE_CELLS.B17.text },
      ];

      fixedImmutableSpecs.forEach(({ addr, text }) => {
        const cell = defaultSheet.getCell(addr);
        const master = cell.isMerged ? (cell.master || cell) : cell;
        master.value = text;
        master.alignment = {
          ...(master.alignment || {}),
          vertical: master.alignment?.vertical || 'middle',
          horizontal: master.alignment?.horizontal || 'left',
          wrapText: true
        };
        rowsWritten.add(Number(master.row));
      });
    }

    // STRICT RULE: Enforce Coluna B ("Data prevista") weekly schedule formatted strictly Monday-to-Friday:
    // "Semana X (DD/MM a DD/MM) - N dias letivos [notas]"
    // for all configured weekly rows (e.g., rows 28 onwards) on defaultSheet!
    // STRICT RULE: Enforce Weekly Schedule Grid (Columns B, D, E, G, I filled line by line; Columns F and H strictly empty)
    // for all configured weekly rows (e.g., rows 28 onwards) on defaultSheet!
    if (defaultSheet) {
      const startR = (configuredStartRow && configuredStartRow >= 28) ? configuredStartRow : 28;
      const activeRowCount = Math.max(configuredRowCount || 11, 11);
      const targetBimNum = options?.planMetadata?.bimestre ? extractBimestreNumber(options.planMetadata.bimestre) : 4;
      const dateColLetter = normalizeColLetter(options?.profile?.columns?.dateWeekCol) || 'B';

      for (let r = startR; r < startR + activeRowCount; r++) {
        const weekNum = (r - startR) + 1;
        const isSEI = (weekNum === 10);
        const isClosing = (weekNum === 11);
        const isAval = (weekNum === 9);
        const teacherSchedConfig = {
          classDays: options?.planMetadata?.classDays || options?.profile?.classDays || options?.profile?.teacherSchedule?.classDays,
          classesPerDay: options?.planMetadata?.classesPerDay || options?.profile?.classesPerDay || options?.profile?.teacherSchedule?.classesPerDay,
          plannedClasses: Number(options?.planMetadata?.plannedClasses || options?.profile?.plannedClasses || 18),
          rowCount: activeRowCount
        };
        const effectiveYear = (options?.planMetadata?.year ? parseInt(String(options.planMetadata.year), 10) : undefined) || options?.calendarData?.year || 2026;
        const weekAllocInfo = getTeacherAllocatedWeekInfo(weekNum, targetBimNum, activeRowCount, options?.calendarData, effectiveYear, teacherSchedConfig);
        const expectedDateText = weekAllocInfo?.fullDateText || getSeducWeekPeriodText(weekNum, targetBimNum, isSEI, isAval, activeRowCount, options?.calendarData, effectiveYear, teacherSchedConfig);

        // 1. Coluna B: Data / Semana
        const dateCellAddr = `${dateColLetter}${r}`;
        const cellB = defaultSheet.getCell(dateCellAddr);
        const masterB = cellB.isMerged ? (cellB.master || cellB) : cellB;

        // Check if fill has valid text, otherwise inject expectedDateText
        const fillForCellB = fills.find(f => normalizeCoordinate(f.address) === dateCellAddr || (f.row === r && (f.colLetter === 'B' || f.expectedType === 'periodo')));
        let finalValB = expectedDateText;
        if (
          fillForCellB &&
          fillForCellB.fillValue &&
          !fillForCellB.fillValue.includes('29/07') &&
          fillForCellB.fillValue.toLowerCase().includes('semana') &&
          !fillForCellB.fillValue.toLowerCase().includes('sábado') &&
          !fillForCellB.fillValue.toLowerCase().includes('domingo')
        ) {
          finalValB = fillForCellB.fillValue;
        } else {
          finalValB = expectedDateText;
        }

        masterB.value = finalValB;
        masterB.alignment = {
          ...(masterB.alignment || {}),
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true
        };
        rowsWritten.add(r);

        // 2. Colunas F e H: As ÚNICAS colunas que devem permanecer vazias/em branco
        const cellF = defaultSheet.getCell(`F${r}`);
        const masterF = cellF.isMerged ? (cellF.master || cellF) : cellF;
        masterF.value = '';

        const cellH = defaultSheet.getCell(`H${r}`);
        const masterH = cellH.isMerged ? (cellH.master || cellH) : cellH;
        masterH.value = '';

        // 3. Colunas D, E, G, I: Preenchidas linha a linha a partir da Linha 28 com os dados do Gemini
        const cellD = defaultSheet.getCell(`D${r}`);
        const masterD = cellD.isMerged ? (cellD.master || cellD) : cellD;

        const cellE = defaultSheet.getCell(`E${r}`);
        const masterE = cellE.isMerged ? (cellE.master || cellE) : cellE;

        const cellG = defaultSheet.getCell(`G${r}`);
        const masterG = cellG.isMerged ? (cellG.master || cellG) : cellG;

        const cellI = defaultSheet.getCell(`I${r}`);
        const masterI = cellI.isMerged ? (cellI.master || cellI) : cellI;

        const fillD = fills.find(f => normalizeCoordinate(f.address) === `D${r}` || (f.row === r && (f.colLetter === 'D' || f.id?.includes('_D') || f.expectedType === 'habilidade')));
        const fillE = fills.find(f => normalizeCoordinate(f.address) === `E${r}` || (f.row === r && (f.colLetter === 'E' || f.id?.includes('_E') || f.expectedType === 'objeto_conhecimento')));
        const fillG = fills.find(f => normalizeCoordinate(f.address) === `G${r}` || (f.row === r && (f.colLetter === 'G' || f.id?.includes('_G') || f.expectedType === 'desenvolvimento_aula')));
        const fillI = fills.find(f => normalizeCoordinate(f.address) === `I${r}` || (f.row === r && (f.colLetter === 'I' || f.id?.includes('_I') || f.expectedType === 'recuperacao_sei')));

        const eventName = weekAllocInfo?.holidayReason || 'Dia do Professor';

        // REGRA 2 (SEDUC-SP v2.2.3): REMOÇÃO DO PREENCHIMENTO VERMELHO CLARO NA LINHA DE SUSPENSÃO (15/10/2026 - LINHA 29)
        // As células da linha de suspensão (Colunas B até I) mantêm rigorosamente o padrão
        // de preenchimento neutro/original do modelo Planejamento de Aula URE Taubaté.xlsx (sem estilo fill de alerta).
        if (weekAllocInfo?.status === 'suspension') {
          masterD.value = fillD?.fillValue || 'Evento Oficial / Suspensão de Aulas';
          masterE.value = fillE?.fillValue || 'Sem expediente pedagógico presencial conforme calendário escolar oficial SEDUC-SP.';
          masterG.value = fillG?.fillValue || `Suspensão das atividades letivas em virtude de ${eventName}. Conteúdo didático reprogramado para o próximo encontro letivo.`;
          masterI.value = fillI?.fillValue || '-';
        } else if (isSEI) {
          masterD.value = fillD?.fillValue || 'Semana de Estudos Intensivos (SEI) / Recuperação e Nivelamento • (SEI-RECUPERACAO) - Objeto de Conhecimento: Retomada e consolidação das aprendizagens prioritárias do 4º Bimestre';
          masterE.value = fillE?.fillValue || 'Retomar, nivelar e consolidar as habilidades essenciais do 4º Bimestre que apresentaram maior índice de defasagem nas avaliações formativas e Prova Paulista.';
          masterG.value = fillG?.fillValue || 'Bloco 1 (45-50 min): 1. Acolhida e devolutiva pedagógica das defasagens diagnósticas (15 min). 2. Oficinas práticas em duplas produtivas por descritores críticos (30 min). 3. Síntese intermediária (5 min). | Transição e Bloco 2 (45-50 min): 4. Desafios de nivelamento e aplicação contextualizada (30 min). 5. Autoavaliação e registro no diário de bordo (15 min) (Tempo Total: 90-100 min).';
          masterI.value = fillI?.fillValue || 'Atendimento individualizado para estudantes com defasagens conceituais remanescentes e roteiro personalizado de estudos.';
        } else if (isClosing) {
          masterD.value = fillD?.fillValue || 'Conselho de Classe / Fechamento de Médias e Frequências • (CONSELHO-FECHAMENTO) - Objeto de Conhecimento: Fechamento bimestral, apuração de frequência e análise colegiada de rendimento escolar';
          masterE.value = fillE?.fillValue || 'Consolidar os registros de aproveitamento escolar, realizar o fechamento de médias e frequências e participar colegiadamente das deliberações do Conselho de Classe final.';
          masterG.value = fillG?.fillValue || 'Etapa 1 (45-50 min): 1. Apuração final e conferência de frequências e notas no Diário Digital / SED (30 min). 2. Lançamento e consolidação das médias finais e menções do 4º Bimestre (20 min). | Transição e Etapa 2 (45-50 min): 3. Participação no Conselho de Classe e deliberações colegiadas de progressão (35 min). 4. Registro em ata institucional e encerramento do ano letivo (15 min) (Tempo Total: 90-100 min).';
          masterI.value = fillI?.fillValue || 'Registro dos encaminhamentos e pareceres pedagógicos finais para o ciclo seguinte na Secretaria Escolar Digital (SED).';
        } else {
          // Semanas regulares de aula: preencher linha a linha com os dados gerados pelo Gemini
          const skillForWeek = (options?.scopeSkills && options.scopeSkills.length > 0)
            ? (options.scopeSkills.find(s => s.week === weekNum) || options.scopeSkills[Math.min(weekNum - 1, options.scopeSkills.length - 1)])
            : undefined;
          const startLesson = (weekNum === 1 ? 1 : ((weekNum - 1) * 2 - 1));
          const endLesson = (weekNum === 1 ? 2 : ((weekNum - 1) * 2));
          const defaultLessonRange = `Aula ${startLesson} e ${endLesson}`;
          const skillCode = skillForWeek?.code || 'HAB-SP';
          const skillObj = skillForWeek?.objectOfKnowledge || skillForWeek?.description || 'Conteúdo Estruturante do Currículo Paulista';

          masterD.value = fillD?.fillValue || `${defaultLessonRange} • (${skillCode}) - Objeto de Conhecimento: ${skillObj}`;
          masterE.value = fillE?.fillValue || skillForWeek?.description || `Articular os objetivos pedagógicos das ${defaultLessonRange}: Compreender e aplicar os conceitos fundamentais na resolução de situações-problema contextualizadas.`;
          masterG.value = fillG?.fillValue || `Bloco 1 (45-50 min): 1. Acolhida e problematização disparadora contextualizada (10 min). 2. Investigação e desenvolvimento em duplas (25 min). 3. Sistematização preliminar (10 min). | Transição e Bloco 2 (45-50 min): 4. Aplicação prática dos conceitos e exercícios guiados (25 min). 5. Fechamento formativo e registro no caderno (15 min) (Tempo Total: 90-100 min).`;
          masterI.value = fillI?.fillValue || 'Atendimento pedagógico individualizado e acompanhamento dos estudantes com defasagens de aprendizagem.';
        }

        // Aplicação de quebra automática de texto e alinhamento
        [masterD, masterE, masterG, masterI].forEach(m => {
          m.alignment = {
            ...(m.alignment || {}),
            vertical: 'middle',
            horizontal: 'left',
            wrapText: true
          };
          rowsWritten.add(r);
        });

        // Garantir que as bordas originais estejam preservadas
        [masterB, masterD, masterE, masterF, masterG, masterH, masterI].forEach(m => {
          if (!m.border || Object.keys(m.border).length === 0) {
            m.border = {
              top: { style: 'thin', color: { argb: 'CBD5E1' } },
              bottom: { style: 'thin', color: { argb: 'CBD5E1' } },
              left: { style: 'thin', color: { argb: 'CBD5E1' } },
              right: { style: 'thin', color: { argb: 'CBD5E1' } }
            };
          }
        });
      }
    }

    // STRICT RULE 3: Ensure all rows from configuredStartRow (e.g., 28) and all rows written
    // are NOT hidden (row.hidden = false) and row height is preserved (>= 40px)!
    const sheetsToUnhide = defaultSheet ? [defaultSheet] : workbook.worksheets;
    sheetsToUnhide.forEach(ws => {
      // 1. Unhide and size rows in configured weekly lesson range
      if (configuredStartRow) {
        const count = configuredRowCount || 7;
        for (let r = configuredStartRow; r < configuredStartRow + count; r++) {
          const row = ws.getRow(r);
          row.hidden = false;
          if (!row.height || row.height < 36) {
            row.height = 42;
          }
        }
      }

      // 2. Unhide and size all written rows
      rowsWritten.forEach(r => {
        const row = ws.getRow(r);
        row.hidden = false;
        if (!row.height || row.height < 36) {
          row.height = 42;
        }
      });

      // 3. Ensure grid lines are visible
      ws.views = [{ showGridLines: true }];
    });

    const outputBuffer = await workbook.xlsx.writeBuffer();
    return outputBuffer as ArrayBuffer;
  }

  if (fileFormat === 'docx') {
    const zip = new PizZip(originalBuffer);
    let xml = zip.file('word/document.xml')?.asText() || '';

    fills.forEach((f) => {
      const escapedVal = f.fillValue
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      const emptyRunRegex = /(<w:tc[^>]*>[\s\S]*?<w:p[^>]*>[\s\S]*?<w:r[^>]*>)<w:t\/>(<\/w:r>[\s\S]*?<\/w:p>[\s\S]*?<\/w:tc>)/;
      if (emptyRunRegex.test(xml)) {
        xml = xml.replace(emptyRunRegex, `$1<w:t>${escapedVal}</w:t>$2`);
      }
    });

    zip.file('word/document.xml', xml);
    const output = zip.generate({ type: 'arraybuffer' });
    return output;
  }

  if (fileFormat === 'pdf') {
    const pdfDoc = await PDFDocument.load(originalBuffer);
    const form = pdfDoc.getForm();

    fills.forEach(f => {
      try {
        const field = form.getTextField(f.address);
        if (field) {
          field.setText(f.fillValue);
        }
      } catch (e) {
        // Ignored
      }
    });

    const pdfBytes = await pdfDoc.save();
    return pdfBytes.buffer as ArrayBuffer;
  }

  throw new Error(`Formato ${fileFormat} não suportado para injeção direta.`);
}

export interface SaveResult {
  success: boolean;
  method: 'picker' | 'fallback' | 'canceled' | 'iframe_blocked';
  fileName: string;
  message: string;
  errorType?: string;
}

/**
 * Gera dinamicamente o nome de arquivo sugerido para o planejamento
 * Formato padrão: Planejamento_2026_4Bim_[DISCIPLINA]_[TURMA]_[PROFESSOR].xlsx
 */
export function generateSuggestedFileName(
  fields: MappedField[] = [],
  originalFileName?: string,
  format: string = 'xlsx',
  planMetadata?: PlanMetadata
): string {
  const ext = format === 'docx' ? 'docx' : format === 'pdf' ? 'pdf' : 'xlsx';

  const sanitize = (text: string, fallback: string): string => {
    if (!text) return fallback;
    const normalized = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .trim();
    return normalized || fallback;
  };

  // 1. Detectar Ano (default 2026)
  let year = planMetadata?.year || '2026';
  const yearMatch = fields.find(f => f.weekNumber === 1 && f.colLetter === 'B')?.fillValue?.match(/\b(202\d|203\d)\b/);
  if (yearMatch) {
    year = yearMatch[1];
  }

  // 2. Detectar Bimestre (default 4Bim)
  let bimTag = '4Bim';
  const bimField = fields.find(f => 
    (f.address || '').toUpperCase() === 'E7' || 
    (f.label || '').toLowerCase().includes('bimestre') || 
    f.id.includes('bimestreCell') ||
    f.id.includes('bimonthCell')
  );
  const bimText = (planMetadata?.bimestre || bimField?.fillValue || bimField?.currentValue || '').toLowerCase();
  if (bimText.includes('1')) bimTag = '1Bim';
  else if (bimText.includes('2')) bimTag = '2Bim';
  else if (bimText.includes('3')) bimTag = '3Bim';
  else if (bimText.includes('4')) bimTag = '4Bim';

  // 3. Detectar Disciplina
  const subjectField = fields.find(f => {
    const addr = (f.address || '').toUpperCase();
    const lbl = (f.label || '').toLowerCase();
    return addr === 'C5' || lbl.includes('disciplina') || lbl.includes('componente') || f.id.includes('subjectCell');
  });
  const rawSubject = planMetadata?.subject || subjectField?.fillValue || subjectField?.currentValue || 'Matematica';
  const cleanSubject = sanitize(rawSubject, 'Geral');

  // 4. Detectar Turma / Série
  const gradeField = fields.find(f => {
    const addr = (f.address || '').toUpperCase();
    const lbl = (f.label || '').toLowerCase();
    return addr === 'B5' || lbl.includes('turma') || lbl.includes('ano') || lbl.includes('serie') || lbl.includes('série') || f.id.includes('gradeCell');
  });
  const rawGrade = planMetadata?.grade || gradeField?.fillValue || gradeField?.currentValue || '9Ano';
  const cleanGrade = sanitize(rawGrade, 'Turma');

  // 5. Detectar Professor
  const teacherField = fields.find(f => {
    const addr = (f.address || '').toUpperCase();
    const lbl = (f.label || '').toLowerCase();
    return addr === 'C4' || lbl.includes('professor') || lbl.includes('docente') || f.id.includes('teacherCell');
  });
  const rawTeacher = planMetadata?.teacherName || teacherField?.fillValue || teacherField?.currentValue || 'Professor';
  const cleanTeacher = sanitize(rawTeacher, 'Professor');

  return `Planejamento_${year}_${bimTag}_${cleanSubject}_${cleanGrade}_${cleanTeacher}.${ext}`;
}

/**
 * Executa o download tradicional direto via Blob (navegador salva na pasta padrão de Downloads)
 */
export function downloadBlobDirect(
  buffer: ArrayBuffer,
  fileName: string,
  format: string = 'xlsx'
): void {
  let mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  let ext = 'xlsx';

  if (format === 'docx' || fileName.toLowerCase().endsWith('.docx')) {
    mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    ext = 'docx';
  } else if (format === 'pdf' || fileName.toLowerCase().endsWith('.pdf')) {
    mimeType = 'application/pdf';
    ext = 'pdf';
  }

  if (!fileName.toLowerCase().endsWith('.' + ext)) {
    fileName = `${fileName}.${ext}`;
  }

  const blob = new Blob([buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}

/**
 * Salva o arquivo utilizando a File System Access API (window.showSaveFilePicker)
 * permitindo ao usuário escolher a pasta do Google Drive ou do computador.
 * Caso o navegador esteja em um iframe bloqueado ou ocorra SecurityError, retorna status específico para a UI.
 */
export async function saveFileWithPicker(
  buffer: ArrayBuffer,
  suggestedName: string,
  format: string = 'xlsx'
): Promise<SaveResult> {
  let mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  let ext = 'xlsx';
  let desc = 'Planilha do Excel (*.xlsx)';

  if (format === 'docx' || suggestedName.toLowerCase().endsWith('.docx')) {
    mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    ext = 'docx';
    desc = 'Documento do Word (*.docx)';
  } else if (format === 'pdf' || suggestedName.toLowerCase().endsWith('.pdf')) {
    mimeType = 'application/pdf';
    ext = 'pdf';
    desc = 'Documento PDF (*.pdf)';
  }

  if (!suggestedName.toLowerCase().endsWith('.' + ext)) {
    suggestedName = `${suggestedName}.${ext}`;
  }

  // 1. Tentar utilizar a API nativa showSaveFilePicker
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const pickerOptions = {
        suggestedName: suggestedName,
        types: [
          {
            description: desc,
            accept: {
              [mimeType]: [`.${ext}`]
            }
          }
        ]
      };

      const fileHandle = await (window as any).showSaveFilePicker(pickerOptions);
      const writableStream = await fileHandle.createWritable();
      await writableStream.write(buffer);
      await writableStream.close();

      return {
        success: true,
        method: 'picker',
        fileName: fileHandle.name || suggestedName,
        message: `Arquivo salvo com sucesso na pasta selecionada: ${fileHandle.name || suggestedName}`
      };
    } catch (err: any) {
      // 1.1 Se o usuário cancelou voluntariamente na caixa de diálogo nativa
      if (err.name === 'AbortError') {
        return {
          success: false,
          method: 'canceled',
          fileName: suggestedName,
          message: 'Seleção de pasta cancelada pelo usuário.'
        };
      }

      // 1.2 Se foi bloqueado por restrição de sandbox/iframe do navegador
      const isSecurity = err.name === 'SecurityError' ||
        (err.message && err.message.toLowerCase().includes('security')) ||
        (err.message && err.message.toLowerCase().includes('cross-origin')) ||
        (err.message && err.message.toLowerCase().includes('not allowed'));

      if (isSecurity) {
        console.warn('showSaveFilePicker bloqueado por restrição de segurança do iframe:', err);
        return {
          success: false,
          method: 'iframe_blocked',
          fileName: suggestedName,
          message: 'O navegador restringe a janela nativa de arquivos dentro da prévia (iframe).',
          errorType: 'SecurityError'
        };
      }

      // 1.3 Outros erros imprevistos: fallback para download direto
      console.warn('Erro ao utilizar File System Access API, executando fallback direto:', err);
      downloadBlobDirect(buffer, suggestedName, format);
      return {
        success: true,
        method: 'fallback',
        fileName: suggestedName,
        message: `Download concluído na pasta padrão de Downloads via fallback seguro: ${suggestedName}`
      };
    }
  }

  // 2. Fallback quando a API não é suportada pelo navegador
  downloadBlobDirect(buffer, suggestedName, format);
  return {
    success: true,
    method: 'fallback',
    fileName: suggestedName,
    message: `Navegador sem suporte ao seletor nativo. Download realizado na pasta Downloads: ${suggestedName}`
  };
}
