/**
 * SEDUC-SP Academic Calendar and Curriculum Engine
 * 
 * REGRAS OBRIGATÓRIAS (ANO DINÂMICO E DIAS ÚTEIS ESTRITOS):
 * 1. ELIMINAÇÃO TOTAL DE DATAS E ANOS HARDCODED:
 *    - O sistema opera dinamicamente com base no ano letivo extraído do arquivo
 *      de calendário anexado no Slot 3 (ou pelo ano identificado na data de envio).
 *    - Quando o calendário for do ano letivo de 2026, todas as operações de data,
 *      dias da semana e contagens operam rigorosamente com base em 2026.
 * 2. ENQUADRAMENTO ESTRITO DE SEGUNDA A SEXTA (Monday-to-Friday):
 *    - Cada bloco "Semana X" DEVE iniciar rigorosamente em uma SEGUNDA-FEIRA (dayOfWeek = 1)
 *      e terminar em uma SEXTA-FEIRA (dayOfWeek = 5).
 *    - Sábados (dayOfWeek = 6) e Domingos (dayOfWeek = 0) NUNCA podem ser data de início,
 *      data de término ou computados como dias letivos ordinários.
 *    - Se o início do bimestre cair em dia útil intermediário (ex.: quinta-feira), a Semana 1
 *      compreende daquela data até a sexta-feira imediata da mesma semana. A partir da
 *      Semana 2 em diante, todas as semanas iniciam na SEGUNDA e encerram na SEXTA.
 * 3. RECÁLCULO DAS CÉLULAS J7 E J9 COM BASE NO CALENDÁRIO FORNECIDO:
 *    - Célula J7: Dias úteis (seg-sex) menos feriados, pontes e recessos assinalados.
 *    - Célula J9: Saldo de J7 menos eventos oficiais da SEDUC (Conselhos, Planejamento e avaliações).
 */

import { CalendarSummary } from '../types/plan';

export interface BimestreCalendarDetails {
  bimestreNum: number;
  bimestreLabel: string;
  year: number;
  startDate: string;            // DD/MM/YYYY
  endDate: string;              // DD/MM/YYYY
  periodText: string;           // ex: "24/07/2026 a 02/10/2026"
  totalCalendarDays: number;    // Dias corridos no intervalo
  totalSemanaDiasUteis: number; // Exclusivamente seg a sex (dayOfWeek 1 a 5)
  totalFimDeSemanaIgnorados: number; // Sábados e domingos no período descartados
  feriadosERecessos: Array<{ date: string; name: string }>;
  diasLetivosJ7: number;        // Saldo Célula J7 (dias úteis - feriados em dias úteis)
  eventosSuspensoes: Array<{ name: string; dias: number; dateRange?: string }>;
  totalDiasEventos: number;     // Soma dos dias de eventos em dias úteis
  diasEfetivosJ9: number;       // Saldo Célula J9 (J7 - totalDiasEventos)
  defaultPlannedClasses: number;// 12 a 14 aulas (teto da grade semanal)
}

/**
 * Converte string de data no formato DD/MM/YYYY, YYYY-MM-DD ou DD/MM para Date ao meio-dia
 * (evita desvios de fuso horário / horário de verão)
 */
export function parseBrDate(dateStr: string, fallbackYear?: number): Date {
  if (!dateStr) return new Date();
  const cleaned = String(dateStr).trim();
  const defaultYear = fallbackYear || new Date().getFullYear();

  // DD/MM/YYYY ou DD-MM-YYYY
  const brMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (brMatch) {
    const day = parseInt(brMatch[1], 10);
    const month = parseInt(brMatch[2], 10) - 1;
    const year = parseInt(brMatch[3], 10);
    return new Date(year, month, day, 12, 0, 0);
  }

  // DD/MM (sem ano especificado)
  const brNoYearMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (brNoYearMatch) {
    const day = parseInt(brNoYearMatch[1], 10);
    const month = parseInt(brNoYearMatch[2], 10) - 1;
    return new Date(defaultYear, month, day, 12, 0, 0);
  }

  // YYYY-MM-DD
  const isoMatch = cleaned.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    return new Date(year, month, day, 12, 0, 0);
  }

  const d = new Date(cleaned);
  d.setHours(12, 0, 0, 0);
  return isNaN(d.getTime()) ? new Date(defaultYear, 0, 1, 12, 0, 0) : d;
}

/**
 * Formata um objeto Date para DD/MM/YYYY
 */
export function formatBrDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Formata um objeto Date para DD/MM
 */
export function formatDayMonth(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

/**
 * Retorna o nome do dia da semana em português
 */
export function getDayOfWeekName(dayOfWeek: number): string {
  const names = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado'
  ];
  return names[dayOfWeek] || '';
}

/**
 * Normaliza string de data para DD/MM/YYYY para comparação segura
 */
export function normalizeDateKey(dateStr: string, fallbackYear?: number): string {
  try {
    const d = parseBrDate(dateStr, fallbackYear);
    return formatBrDate(d);
  } catch (e) {
    return dateStr.trim();
  }
}

/**
 * Normaliza texto de entrada removendo acentos, espaços extras e minúsculas
 */
export function normalizeSeducText(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Extrai o número do bimestre (1..4) de texto ou número
 */
export function extractBimestreNum(val: string | number | undefined): number {
  if (typeof val === 'number') {
    return val >= 1 && val <= 4 ? val : 1;
  }
  const str = normalizeSeducText(String(val || ''));
  if (str.includes('4') || str.includes('quarto') || str.includes('4b')) return 4;
  if (str.includes('3') || str.includes('terceiro') || str.includes('3b')) return 3;
  if (str.includes('2') || str.includes('segundo') || str.includes('2b')) return 2;
  if (str.includes('1') || str.includes('primeiro') || str.includes('1b')) return 1;
  return 4; // Default para 4º Bimestre
}

/**
 * Algoritmo de Meeus/Jones/Butcher para cálculo da Páscoa Gregoriana em qualquer ano
 */
export function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = Março, 4 = Abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12, 0, 0);
}

/**
 * Gera dinamicamente o catálogo oficial de feriados e recessos SEDUC-SP para qualquer ano letivo
 */
export function getOfficialSeducHolidays(year: number): Array<{ date: string; name: string }> {
  const easter = getEasterDate(year);

  // Feriados móveis calculados a partir da Páscoa
  const carnavalSeg = new Date(easter.getTime());
  carnavalSeg.setDate(easter.getDate() - 48);

  const carnavalTer = new Date(easter.getTime());
  carnavalTer.setDate(easter.getDate() - 47);

  const cinzas = new Date(easter.getTime());
  cinzas.setDate(easter.getDate() - 46);

  const paixao = new Date(easter.getTime());
  paixao.setDate(easter.getDate() - 2);

  const corpusChristi = new Date(easter.getTime());
  corpusChristi.setDate(easter.getDate() + 60);

  const holidays: Array<{ date: string; name: string }> = [
    // Carnaval e Cinzas
    { date: formatBrDate(carnavalSeg), name: 'Recesso de Carnaval (Segunda-feira)' },
    { date: formatBrDate(carnavalTer), name: 'Feriado de Carnaval (Terça-feira)' },
    { date: formatBrDate(cinzas), name: 'Quarta-feira de Cinzas (Recesso até 12h)' },

    // Sexta-feira Santa
    { date: formatBrDate(paixao), name: 'Sexta-feira Santa / Paixão de Cristo' },

    // Tiradentes e Dia do Trabalho
    { date: `21/04/${year}`, name: 'Tiradentes (Feriado Nacional)' },
    { date: `01/05/${year}`, name: 'Dia do Trabalho (Feriado Nacional)' },

    // Corpus Christi
    { date: formatBrDate(corpusChristi), name: 'Corpus Christi (Quinta-feira)' },

    // Feriado Estadual SP e Recesso de Julho
    { date: `09/07/${year}`, name: 'Revolução Constitucionalista (Feriado Estadual SP)' },
    { date: `10 a 23/07/${year}`, name: 'Recesso Escolar de Julho (Alunos e Professores)' },

    // Segundo Semestre
    { date: `07/09/${year}`, name: 'Independência do Brasil (Feriado Nacional)' },
    { date: `12/10/${year}`, name: 'Nossa Senhora Aparecida (Feriado Nacional)' },
    { date: `15/10/${year}`, name: 'Dia do Professor (Suspensão Oficial de Aulas)' },
    { date: `02/11/${year}`, name: 'Finados (Feriado Nacional)' },
    { date: `15/11/${year}`, name: 'Proclamação da República (Feriado Nacional)' },
    { date: `20/11/${year}`, name: 'Dia Nacional da Consciência Negra (Feriado Nacional)' }
  ];

  // Adiciona pontes se o feriado cair em quinta-feira
  const diaTrabalhoDate = parseBrDate(`01/05/${year}`);
  if (diaTrabalhoDate.getDay() === 4) {
    holidays.push({ date: `02/05/${year}`, name: 'Ponte do Dia do Trabalho (Sexta-feira)' });
  }

  const corpusChristiNextDay = new Date(corpusChristi.getTime());
  corpusChristiNextDay.setDate(corpusChristi.getDate() + 1);
  holidays.push({ date: formatBrDate(corpusChristiNextDay), name: 'Ponte de Corpus Christi (Sexta-feira)' });

  const conscienciaDate = parseBrDate(`20/11/${year}`);
  if (conscienciaDate.getDay() === 4) {
    holidays.push({ date: `21/11/${year}`, name: 'Ponte da Consciência Negra (Sexta-feira)' });
  }

  return holidays;
}

/**
 * Detecta dinamicamente o ano letivo do calendário a partir do Slot 3, metadados ou sistema
 */
export function detectAcademicYear(
  calendarData?: CalendarSummary | null,
  fileName?: string,
  planMetadataYear?: string | number
): number {
  if (calendarData && typeof calendarData.year === 'number' && calendarData.year >= 2020) {
    return calendarData.year;
  }
  if (planMetadataYear) {
    const parsed = parseInt(String(planMetadataYear).replace(/\D+/g, ''), 10);
    if (!isNaN(parsed) && parsed >= 2020 && parsed <= 2040) {
      return parsed;
    }
  }
  if (fileName) {
    const m = fileName.match(/\b(202\d|203\d)\b/);
    if (m) {
      return parseInt(m[1], 10);
    }
  }
  const currentYear = new Date().getFullYear();
  return currentYear >= 2020 ? currentYear : 2026;
}

/**
 * Converte intervalos de período como "24 de Julho a 03 de Outubro" ou "24/07 a 03/10"
 * em datas estritas DD/MM/YYYY com o ano especificado.
 */
export function parsePeriodoRange(
  periodoStr: string,
  defaultYear: number
): { startDate: string; endDate: string } {
  const cleaned = String(periodoStr || '').trim();

  // "DD/MM/YYYY a DD/MM/YYYY" ou "DD/MM a DD/MM"
  const slashMatch = cleaned.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\s*(?:a|até|-)\s*(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/i);
  if (slashMatch) {
    const d1 = slashMatch[1].padStart(2, '0');
    const m1 = slashMatch[2].padStart(2, '0');
    const y1 = slashMatch[3] ? (slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3]) : defaultYear;
    const d2 = slashMatch[4].padStart(2, '0');
    const m2 = slashMatch[5].padStart(2, '0');
    const y2 = slashMatch[6] ? (slashMatch[6].length === 2 ? `20${slashMatch[6]}` : slashMatch[6]) : defaultYear;
    return {
      startDate: `${d1}/${m1}/${y1}`,
      endDate: `${d2}/${m2}/${y2}`
    };
  }

  // Meses por extenso em português
  const monthNames: Record<string, string> = {
    janeiro: '01', fevereiro: '02', marco: '03', março: '03', abril: '04',
    maio: '05', junho: '06', julho: '07', agosto: '08',
    setembro: '09', outubro: '10', novembro: '11', dezembro: '12'
  };
  const textMatch = cleaned.match(/(\d{1,2})(?:\s+de\s+([a-zA-ZçÇãÃ]+))?(?:\s+de\s+(\d{4}))?\s*(?:a|até|-)\s*(\d{1,2})\s+de\s+([a-zA-ZçÇãÃ]+)(?:\s+de\s+(\d{4}))?/i);
  if (textMatch) {
    const d1 = textMatch[1].padStart(2, '0');
    const rawM1 = normalizeSeducText(textMatch[2] || textMatch[5]);
    const m1 = monthNames[rawM1] || '01';
    const y1 = textMatch[3] || textMatch[6] || defaultYear;
    const d2 = textMatch[4].padStart(2, '0');
    const rawM2 = normalizeSeducText(textMatch[5]);
    const m2 = monthNames[rawM2] || '12';
    const y2 = textMatch[6] || defaultYear;
    return {
      startDate: `${d1}/${m1}/${y1}`,
      endDate: `${d2}/${m2}/${y2}`
    };
  }

  return {
    startDate: `05/02/${defaultYear}`,
    endDate: `18/12/${defaultYear}`
  };
}

export interface DayScanEntry {
  date: string;               // DD/MM/YYYY
  dayOfWeek: number;          // 0 a 6
  dayOfWeekName: string;      // Segunda-feira, etc.
  isWeekend: boolean;         // true para Sábado (6) ou Domingo (0)
  isWeekday: boolean;         // true para Segunda a Sexta (1 a 5)
  isHolidayOrBreak: boolean;  // Coincide com feriado/recesso
  holidayName?: string;
  isSchoolDay: boolean;       // Dia letivo útil contabilizado em J7
}

export interface CalendarRangeScanResult {
  startDate: string;
  endDate: string;
  totalCalendarDays: number;
  totalWeekdaysMonFri: number;        // Exclusivamente segunda a sexta-feira
  totalWeekendDaysIgnored: number;    // Sábados e domingos eliminados
  weekdaysDeductedHolidays: Array<{ date: string; name: string; dayOfWeekName: string }>;
  weekendHolidaysIgnored: Array<{ date: string; name: string; dayOfWeekName: string }>;
  diasLetivosJ7: number;              // Saldo final Célula J7
  dailyLog: DayScanEntry[];
}

/**
 * Executa a varredura dia a dia do calendário entre startDate e endDate,
 * considerando ESTRITAMENTE dias de segunda a sexta-feira (dayOfWeek 1 a 5)
 * e ignorando por padrão sábados (dayOfWeek === 6) e domingos (dayOfWeek === 0).
 */
export function scanBimestreWeekdays(
  startDateStr: string,
  endDateStr: string,
  holidaysAndBreaks: Array<{ date: string; name: string }> = []
): CalendarRangeScanResult {
  const startDate = parseBrDate(startDateStr);
  const endDate = parseBrDate(endDateStr);

  // Mapeia feriados por chave DD/MM/YYYY
  const holidayMap = new Map<string, string>();
  holidaysAndBreaks.forEach(h => {
    if (h.date) {
      const rangeMatch = h.date.match(/(\d{1,2})\s*a\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
      if (rangeMatch) {
        const startD = parseInt(rangeMatch[1], 10);
        const endD = parseInt(rangeMatch[2], 10);
        const m = parseInt(rangeMatch[3], 10);
        const y = parseInt(rangeMatch[4], 10);
        for (let day = startD; day <= endD; day++) {
          const dateKey = `${String(day).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
          holidayMap.set(dateKey, h.name);
        }
      } else {
        const key = normalizeDateKey(h.date, startDate.getFullYear());
        holidayMap.set(key, h.name);
      }
    }
  });

  let totalCalendarDays = 0;
  let totalWeekdaysMonFri = 0;
  let totalWeekendDaysIgnored = 0;
  const weekdaysDeductedHolidays: Array<{ date: string; name: string; dayOfWeekName: string }> = [];
  const weekendHolidaysIgnored: Array<{ date: string; name: string; dayOfWeekName: string }> = [];
  const dailyLog: DayScanEntry[] = [];

  const curr = new Date(startDate.getTime());
  while (curr.getTime() <= endDate.getTime()) {
    totalCalendarDays++;
    const data = curr;

    // TRAVA ESTRITA: Nenhum sábado ou domingo pode ser somado em hipótese alguma aos dias letivos
    if (data.getDay() === 0 || data.getDay() === 6) {
      totalWeekendDaysIgnored++;
      const dow = data.getDay();
      const dateFormatted = formatBrDate(data);
      const dayName = getDayOfWeekName(dow);
      const holidayFound = holidayMap.get(dateFormatted);
      if (holidayFound) {
        weekendHolidaysIgnored.push({
          date: dateFormatted,
          name: holidayFound,
          dayOfWeekName: dayName
        });
      }
      dailyLog.push({
        date: dateFormatted,
        dayOfWeek: dow,
        dayOfWeekName: dayName,
        isWeekend: true,
        isWeekday: false,
        isHolidayOrBreak: !!holidayFound,
        holidayName: holidayFound,
        isSchoolDay: false // Sábados e domingos NUNCA são letivos
      });
      curr.setDate(curr.getDate() + 1);
      continue;
    }

    // REGRA ESTRITA 2: Dias de segunda a sexta-feira (dayOfWeek entre 1 e 5)
    totalWeekdaysMonFri++;
    const dow = data.getDay();
    const dateFormatted = formatBrDate(data);
    const dayName = getDayOfWeekName(dow);
    const holidayFound = holidayMap.get(dateFormatted);

    if (holidayFound) {
      weekdaysDeductedHolidays.push({
        date: dateFormatted,
        name: holidayFound,
        dayOfWeekName: dayName
      });
      dailyLog.push({
        date: dateFormatted,
        dayOfWeek: dow,
        dayOfWeekName: dayName,
        isWeekend: false,
        isWeekday: true,
        isHolidayOrBreak: true,
        holidayName: holidayFound,
        isSchoolDay: false
      });
    } else {
      dailyLog.push({
        date: dateFormatted,
        dayOfWeek: dow,
        dayOfWeekName: dayName,
        isWeekend: false,
        isWeekday: true,
        isHolidayOrBreak: false,
        isSchoolDay: true
      });
    }

    curr.setDate(curr.getDate() + 1);
  }

  const diasLetivosJ7 = totalWeekdaysMonFri - weekdaysDeductedHolidays.length;

  return {
    startDate: startDateStr,
    endDate: endDateStr,
    totalCalendarDays,
    totalWeekdaysMonFri,
    totalWeekendDaysIgnored,
    weekdaysDeductedHolidays,
    weekendHolidaysIgnored,
    diasLetivosJ7,
    dailyLog
  };
}

/**
 * Obtém dinamicamente os detalhes e métricas do Bimestre para qualquer ano letivo,
 * tomando como base OBRIGATÓRIA o arquivo de calendário fornecido no Slot 3.
 */
export function getSeducBimestreDetails(
  bimestreNum: number | string,
  targetYearOrCalendar?: number | CalendarSummary,
  calendarDataInput?: CalendarSummary
): BimestreCalendarDetails {
  const bimNum = extractBimestreNum(bimestreNum);

  let targetYear = new Date().getFullYear();
  let calData: CalendarSummary | undefined;

  if (typeof targetYearOrCalendar === 'number') {
    targetYear = targetYearOrCalendar;
    calData = calendarDataInput;
  } else if (targetYearOrCalendar && typeof targetYearOrCalendar === 'object') {
    calData = targetYearOrCalendar;
    targetYear = calData.year || new Date().getFullYear();
  } else if (calendarDataInput) {
    calData = calendarDataInput;
    targetYear = calData.year || new Date().getFullYear();
  }

  // 1. Extração dinâmica das datas do bimestre
  let startDStr = '';
  let endDStr = '';

  const customBim = calData?.bimestres?.find(b => extractBimestreNum(b.bimestre) === bimNum);
  if (customBim) {
    if (customBim.startDate && customBim.endDate) {
      startDStr = customBim.startDate;
      endDStr = customBim.endDate;
    } else if (customBim.periodo) {
      const parsed = parsePeriodoRange(customBim.periodo, targetYear);
      startDStr = parsed.startDate;
      endDStr = parsed.endDate;
    }
  }

  // Se não estiver especificado no calendário, aplica as datas oficiais da SEDUC para o ano letivo
  if (!startDStr || !endDStr) {
    switch (bimNum) {
      case 1:
        startDStr = `05/02/${targetYear}`;
        endDStr = `18/04/${targetYear}`;
        break;
      case 2:
        startDStr = `22/04/${targetYear}`;
        endDStr = `04/07/${targetYear}`;
        break;
      case 3:
        // OBRIGATORIAMENTE 24/07 (Início oficial das aulas do 3º Bimestre)
        startDStr = `24/07/${targetYear}`;
        endDStr = `03/10/${targetYear}`;
        break;
      case 4:
      default:
        startDStr = `05/10/${targetYear}`;
        endDStr = `18/12/${targetYear}`;
        break;
    }
  }

  // Ajusta limites para que nunca iniciem ou encerrem em fins de semana
  let sDate = parseBrDate(startDStr, targetYear);
  if (sDate.getDay() === 6) sDate.setDate(sDate.getDate() + 2); // Sábado -> Segunda
  else if (sDate.getDay() === 0) sDate.setDate(sDate.getDate() + 1); // Domingo -> Segunda

  let eDate = parseBrDate(endDStr, targetYear);
  if (eDate.getDay() === 6) eDate.setDate(eDate.getDate() - 1); // Sábado -> Sexta
  else if (eDate.getDay() === 0) eDate.setDate(eDate.getDate() - 2); // Domingo -> Sexta

  const normalizedStartStr = formatBrDate(sDate);
  const normalizedEndStr = formatBrDate(eDate);

  // 2. Feriados e Recessos do Ano
  const officialHolidays = getOfficialSeducHolidays(targetYear);
  const combinedHolidays = [...officialHolidays];

  if (calData?.holidaysAndBreaks && Array.isArray(calData.holidaysAndBreaks)) {
    calData.holidaysAndBreaks.forEach(hb => {
      if (hb && hb.date && !combinedHolidays.some(ch => normalizeDateKey(ch.date, targetYear) === normalizeDateKey(hb.date, targetYear))) {
        combinedHolidays.push(hb);
      }
    });
  }

  // 3. Varredura dia a dia estrita (segunda a sexta)
  const scan = scanBimestreWeekdays(normalizedStartStr, normalizedEndStr, combinedHolidays);

  // 4. Eventos e suspensões oficiais SEDUC
  let eventosSuspensoes: Array<{ name: string; dias: number; dateRange?: string }> = [];
  let totalDiasEventos = 3;

  switch (bimNum) {
    case 1:
      eventosSuspensoes = [
        { name: 'Aplicação da Prova Paulista Diagnóstica Oficial (Turnos Exclusivos)', dias: 2 },
        { name: 'Conselho de Classe / Bimestral do 1º Bimestre', dias: 1 }
      ];
      totalDiasEventos = 3;
      break;
    case 2:
      eventosSuspensoes = [
        { name: 'Aplicação da Prova Paulista Intermediária', dias: 2 },
        { name: 'Conselho de Classe e Fechamento Semestral SED', dias: 1 },
        { name: 'Feira de Ciências / Mostra Pedagógica Institucional', dias: 1 }
      ];
      totalDiasEventos = 4;
      break;
    case 3:
      eventosSuspensoes = [
        { name: 'Avaliação Formativa Bimestral SEDUC', dias: 2 },
        { name: 'Conselho de Classe Bimestral do 3º Bimestre', dias: 1 }
      ];
      totalDiasEventos = 3;
      break;
    case 4:
    default:
      eventosSuspensoes = [
        { name: 'Aplicação Oficial SARESP / Prova Paulista Final (Dias Exclusivos)', dias: 2 },
        { name: 'Conselhos de Classe Finais / Fechamento Bimestral / SEI', dias: 2 }
      ];
      totalDiasEventos = 4;
      break;
  }

  const diasEfetivosJ9 = Math.max(0, scan.diasLetivosJ7 - totalDiasEventos);

  return {
    bimestreNum: bimNum,
    bimestreLabel: `${bimNum}º Bimestre`,
    year: targetYear,
    startDate: normalizedStartStr,
    endDate: normalizedEndStr,
    periodText: `${normalizedStartStr} a ${normalizedEndStr}`,
    totalCalendarDays: scan.totalCalendarDays,
    totalSemanaDiasUteis: scan.totalWeekdaysMonFri,
    totalFimDeSemanaIgnorados: scan.totalWeekendDaysIgnored,
    feriadosERecessos: scan.weekdaysDeductedHolidays,
    diasLetivosJ7: scan.diasLetivosJ7,
    eventosSuspensoes,
    totalDiasEventos,
    diasEfetivosJ9,
    defaultPlannedClasses: 14
  };
}

/**
 * Proxy de retrocompatibilidade para referências antigas a SEDUC_2025_BIMESTRES
 */
export const SEDUC_2025_BIMESTRES: Record<number, BimestreCalendarDetails> = new Proxy({}, {
  get: (_target, prop) => {
    const bNum = Number(prop) || 4;
    return getSeducBimestreDetails(bNum, 2026);
  }
}) as Record<number, BimestreCalendarDetails>;

export interface CalculatedCellMetrics {
  bimestreNum: number;
  bimestreLabel: string;
  year: number;
  periodText: string;
  startDate: string;
  endDate: string;
  
  // Detalhes da Varredura Estrita (Segunda a Sexta)
  totalCalendarDays: number;
  totalWeekdaysMonFri: number;       // Segunda a sexta-feira
  weekendDaysIgnoredCount: number;   // Sábados e domingos eliminados
  
  // Célula J7
  j7DiasLetivos: number;
  j7FormulaExpl: string;
  j7FeriadosDescontados: Array<{ date: string; name: string }>;
  
  // Célula J8
  j8AulasPrevistas: number;
  j8TotalSemanas: number;
  j8OriginExpl: string;
  
  // Célula J9
  j9DiasEfetivos: number;
  j9EventosDescontados: Array<{ name: string; dias: number; dateRange?: string }>;
  j9FormulaExpl: string;
}

/**
 * Computa valores exatos para J7, J8 e J9 segundo a regra estrita de dias úteis
 * da SEDUC-SP (exclusivamente de segunda a sexta-feira), tomando como base OBRIGATÓRIA
 * o arquivo de calendário fornecido no Slot 3.
 */
export function computeSeducCellMetrics(options: {
  bimestre?: string | number;
  subject?: string;
  grade?: string;
  plannedClassesInput?: number | string;
  scopeSkills?: any[];
  calendarData?: CalendarSummary | any;
  year?: number | string;
  fileName?: string;
}): CalculatedCellMetrics {
  const bimNum = extractBimestreNum(options.bimestre);
  const targetYear = detectAcademicYear(options.calendarData, options.fileName, options.year);
  const calDetails = getSeducBimestreDetails(bimNum, targetYear, options.calendarData);

  // 1. CÉLULA J7: Varredura dia a dia do calendário oficial (Slot 3)
  const combinedHolidays = [...calDetails.feriadosERecessos];
  if (options.calendarData?.holidaysAndBreaks && Array.isArray(options.calendarData.holidaysAndBreaks)) {
    options.calendarData.holidaysAndBreaks.forEach((hb: any) => {
      if (hb && hb.date && !combinedHolidays.some(ch => normalizeDateKey(ch.date, targetYear) === normalizeDateKey(hb.date, targetYear))) {
        combinedHolidays.push({ date: hb.date, name: hb.name || 'Feriado/Recesso' });
      }
    });
  }

  const scanResult = scanBimestreWeekdays(calDetails.startDate, calDetails.endDate, combinedHolidays);

  const totalCalendarDays = scanResult.totalCalendarDays;
  const totalWeekdaysMonFri = scanResult.totalWeekdaysMonFri;
  const weekendDaysIgnoredCount = scanResult.totalWeekendDaysIgnored;
  const j7DiasLetivos = scanResult.diasLetivosJ7;
  const feriadosDescontados = scanResult.weekdaysDeductedHolidays;

  const j7FormulaExpl = `Varredura oficial de segunda a sexta-feira (${calDetails.periodText}): ${totalWeekdaysMonFri} dias úteis (dayOfWeek 1 a 5). ${weekendDaysIgnoredCount} sábados e domingos rigorosamente ignorados. Descontados ${feriadosDescontados.length} feriados/recessos que caíram em dias úteis. Total na Célula J7: ${j7DiasLetivos} dias letivos.`;

  // 2. CÉLULA J8: Total de Aulas do Escopo Apurado (Apuração dinâmica integral do Slot 2 sem valor fixo)
  let j8Aulas = 18;

  if (Array.isArray(options.scopeSkills) && options.scopeSkills.length > 0) {
    const validSkills = options.scopeSkills.filter((s: any) => {
      const b = extractBimestreNum(s.bimestre);
      return b === bimNum || b === 0 || !s.bimestre;
    });

    if (validSkills.length > 0) {
      // 1. Varredura do maior número de aula explícito no texto das habilidades (ex: "Aula 17 e 18" -> 18)
      let maxLessonInText = 0;
      validSkills.forEach((s: any) => {
        const text = `${s.lessonRange || ''} ${s.sourceReference || ''} ${s.description || ''}`;
        const matches = text.match(/\b(?:aula|aulas)\s*(\d+)(?:\s*(?:e|a|-|à)\s*(\d+))?/gi);
        if (matches) {
          matches.forEach((m: string) => {
            const digits = m.match(/\d+/g);
            if (digits) {
              digits.forEach((d: string) => {
                const n = parseInt(d, 10);
                if (!isNaN(n) && n < 100 && n > maxLessonInText) maxLessonInText = n;
              });
            }
          });
        }
      });

      // 2. Soma de estimatedClasses se informado na ementa
      const sumEstimated = validSkills.reduce((acc: number, s: any) => {
        const est = typeof s.estimatedClasses === 'number' ? s.estimatedClasses : parseInt(String(s.estimatedClasses || '0'), 10);
        return acc + (!isNaN(est) && est > 0 ? est : 0);
      }, 0);

      if (maxLessonInText > 0) {
        j8Aulas = maxLessonInText;
      } else if (sumEstimated > 0) {
        j8Aulas = sumEstimated;
      } else {
        // Contagem dos blocos de aula regulares (desconsiderando conselho) * 2
        const regularBlocks = validSkills.filter((s: any) => {
          const code = String(s.code || '').toUpperCase();
          const desc = String(s.description || s.desc || '').toLowerCase();
          return !code.includes('CONSELHO') && !desc.includes('conselho');
        });
        j8Aulas = regularBlocks.length * 2;
      }
    }
  } else if (options.plannedClassesInput !== undefined && options.plannedClassesInput !== null && options.plannedClassesInput !== '') {
    const parsed = parseInt(String(options.plannedClassesInput).replace(/\D+/g, ''), 10);
    if (!isNaN(parsed) && parsed > 0) {
      j8Aulas = parsed;
    }
  }

  const j8TotalSemanas = Math.ceil(j8Aulas / 2);
  const j8OriginExpl = `Total de Aulas do Escopo Apurado: ${j8Aulas} aulas (${j8TotalSemanas} semanas letivas). Apuração dinâmica do documento de Escopo e Sequência para o componente e bimestre selecionados (sem valor fixo).`;

  // 3. CÉLULA J9: Dias Letivos Efetivos com Desconto de Eventos
  const eventosDescontados = [...calDetails.eventosSuspensoes];
  const totalDiasEventos = calDetails.totalDiasEventos;

  const j9DiasEfetivos = Math.max(0, j7DiasLetivos - totalDiasEventos);
  const j9FormulaExpl = `Base líquida de dias úteis J7 (${j7DiasLetivos} dias) menos ${totalDiasEventos} dias úteis com suspensão de aulas regulares (Reuniões de Planejamento, Conselhos Bimestrais, Feiras e Provas Institucionais exclusivas). Saldo líquido na Célula J9: ${j9DiasEfetivos} dias efetivos.`;

  return {
    bimestreNum: bimNum,
    bimestreLabel: calDetails.bimestreLabel,
    year: targetYear,
    periodText: calDetails.periodText,
    startDate: calDetails.startDate,
    endDate: calDetails.endDate,
    totalCalendarDays,
    totalWeekdaysMonFri,
    weekendDaysIgnoredCount,
    j7DiasLetivos,
    j7FormulaExpl,
    j7FeriadosDescontados: feriadosDescontados,
    j8AulasPrevistas: j8Aulas,
    j8TotalSemanas,
    j8OriginExpl,
    j9DiasEfetivos,
    j9EventosDescontados: eventosDescontados,
    j9FormulaExpl
  };
}

export interface SeducWeekScheduleEntry {
  weekNumber: number;
  startDate: string;        // DD/MM
  endDate: string;          // DD/MM
  rangeText: string;        // "DD/MM a DD/MM"
  schoolDaysCount: number;  // N dias letivos estritamente seg a sex
  fullDateText: string;     // Padrão SEDUC: Semana X (DD/MM a DD/MM) - N dias letivos [nota]
  holidaysInWeek: Array<{ date: string; name: string }>;
  note?: string;
  isSEI?: boolean;
  isAvaliacao?: boolean;
}

/**
 * GERADOR DE INTERVALOS DE DATAS SEMANAIS (COLUNA B - "Data prevista")
 * 
 * Regras Obrigatórias SEDUC-SP:
 * 1. ENQUADRAMENTO ESTRITO DE SEGUNDA A SEXTA (Monday-to-Friday):
 *    - Cada bloco "Semana X" DEVE iniciar rigorosamente em uma SEGUNDA-FEIRA (dayOfWeek = 1)
 *      e terminar em uma SEXTA-FEIRA (dayOfWeek = 5).
 *    - NUNCA termina o intervalo em sábado (dayOfWeek = 6) ou domingo (dayOfWeek = 0).
 *    - Se o bimestre começar no meio de uma semana (ex.: quinta-feira 24/07),
 *      a Semana 1 compreende daquela data de início até a SEXTA-FEIRA imediata da mesma semana.
 *      A partir da Semana 2 em diante, todas as semanas iniciam na SEGUNDA e encerram na SEXTA.
 * 2. CÁLCULO DE DATAS E FÓRMULA DE TEXTO (COLUNA B):
 *    - Formato estrito: `Semana X (DD/MM a DD/MM) - N dias letivos`
 *    - O valor `N dias letivos` conta apenas os dias úteis desse intervalo (seg a sex),
 *      descontando feriados e pontes que recaiam de segunda a sexta.
 */
export function generateSeducWeeklySchedule(
  bimestreNum: number | string = 4,
  customHolidays: Array<{ date: string; name: string }> = [],
  calendarData?: CalendarSummary,
  targetYearInput?: number
): SeducWeekScheduleEntry[] {
  const bimNum = extractBimestreNum(bimestreNum);
  const targetYear = targetYearInput || (calendarData ? calendarData.year : new Date().getFullYear());
  const calDetails = getSeducBimestreDetails(bimNum, targetYear, calendarData);

  // Combina feriados oficiais com eventuais feriados do arquivo importado
  const allHolidays = [...calDetails.feriadosERecessos];
  if (Array.isArray(customHolidays)) {
    customHolidays.forEach(ch => {
      if (ch && ch.date && !allHolidays.some(h => normalizeDateKey(h.date, targetYear) === normalizeDateKey(ch.date, targetYear))) {
        allHolidays.push(ch);
      }
    });
  }

  const holidayMap = new Map<string, string>();
  allHolidays.forEach(h => {
    if (h.date) {
      const rangeMatch = h.date.match(/(\d{1,2})\s*a\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
      if (rangeMatch) {
        const startD = parseInt(rangeMatch[1], 10);
        const endD = parseInt(rangeMatch[2], 10);
        const m = parseInt(rangeMatch[3], 10);
        const y = parseInt(rangeMatch[4], 10);
        for (let day = startD; day <= endD; day++) {
          const dateKey = `${String(day).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
          holidayMap.set(dateKey, h.name);
        }
      } else {
        holidayMap.set(normalizeDateKey(h.date, targetYear), h.name);
      }
    }
  });

  const startDate = parseBrDate(calDetails.startDate, targetYear);
  const endDate = parseBrDate(calDetails.endDate, targetYear);

  const schedule: SeducWeekScheduleEntry[] = [];
  let curr = new Date(startDate.getTime());
  let weekNum = 1;

  while (curr.getTime() <= endDate.getTime()) {
    // Trava Estrita: Eliminação total de sábados e domingos
    if (curr.getDay() === 0 || curr.getDay() === 6) {
      curr.setDate(curr.getDate() + 1);
      continue;
    }

    // Toda semana subsequente à Semana 1 DEVE iniciar obrigatoriamente na segunda-feira (getDay() === 1)
    if (weekNum > 1 && curr.getDay() !== 1) {
      while (curr.getDay() !== 1) {
        curr.setDate(curr.getDate() + 1);
      }
    }
    if (curr.getTime() > endDate.getTime()) break;

    const weekStartDate = new Date(curr.getTime());
    const dow = curr.getDay(); // 1 = Segunda, 2 = Terça, ..., 5 = Sexta

    // Encontra a sexta-feira imediata da mesma semana letiva
    const daysUntilFriday = 5 - dow;
    const fridayDate = new Date(curr.getTime());
    fridayDate.setDate(fridayDate.getDate() + daysUntilFriday);

    // O final da semana é a sexta-feira ou a data final oficial do bimestre se esta for anterior
    let weekEndDate = fridayDate.getTime() > endDate.getTime() ? new Date(endDate.getTime()) : new Date(fridayDate.getTime());
    
    // Garante que weekEndDate NUNCA termine em sábado ou domingo
    if (weekEndDate.getDay() === 6) {
      weekEndDate.setDate(weekEndDate.getDate() - 1);
    } else if (weekEndDate.getDay() === 0) {
      weekEndDate.setDate(weekEndDate.getDate() - 2);
    }

    // Varredura estrita dia a dia da semana (exclusivamente de segunda a sexta)
    let schoolDaysCount = 0;
    const holidaysInWeek: Array<{ date: string; name: string }> = [];
    const scanDay = new Date(weekStartDate.getTime());

    while (scanDay.getTime() <= weekEndDate.getTime()) {
      if (scanDay.getDay() === 0 || scanDay.getDay() === 6) {
        scanDay.setDate(scanDay.getDate() + 1);
        continue;
      }
      const scanDow = scanDay.getDay();
      if (scanDow >= 1 && scanDow <= 5) {
        const dateKey = formatBrDate(scanDay);
        const holidayName = holidayMap.get(dateKey);
        if (holidayName) {
          holidaysInWeek.push({ date: dateKey, name: holidayName });
        } else {
          schoolDaysCount++;
        }
      }
      scanDay.setDate(scanDay.getDate() + 1);
    }

    const startDm = formatDayMonth(weekStartDate);
    const endDm = formatDayMonth(weekEndDate);
    const rangeText = `${startDm} a ${endDm}`;

    // Determina notas oficiais da semana (SEI, Avaliação, Feriados)
    let specialNote = '';
    let isSEI = false;
    let isAvaliacao = false;

    if (bimNum === 4) {
      if (weekNum === 9) {
        specialNote = 'SARESP Oficial / Avaliação Bimestral';
        isAvaliacao = true;
      } else if (weekNum === 10) {
        specialNote = 'SEI - Semana de Estudos Intensivos';
        isSEI = true;
      } else if (weekNum === 11) {
        specialNote = 'Conselho de Classe e Fechamento SED';
      }
    } else if (bimNum === 1) {
      if (weekNum === 9) {
        specialNote = 'Prova Paulista / Avaliação';
        isAvaliacao = true;
      } else if (weekNum === 10) {
        specialNote = 'SEI - Recuperação e Aprofundamento';
        isSEI = true;
      }
    } else if (bimNum === 2) {
      if (weekNum === 10) {
        specialNote = 'Prova Paulista / Avaliação';
        isAvaliacao = true;
      } else if (weekNum === 11) {
        specialNote = 'SEI - Recuperação e Aprofundamento';
        isSEI = true;
      }
    } else if (bimNum === 3) {
      // Grade oficial do 3º Bimestre SEDUC-SP:
      // Semana 1: Início das Aulas
      // Semana 6: SEI / Fechamento
      if (weekNum === 1) {
        specialNote = `${startDm} Início das Aulas`;
      } else if (weekNum === 6) {
        specialNote = 'SEI / Fechamento';
        isSEI = true;
      } else if (weekNum === 8 || weekNum === 9) {
        specialNote = 'Avaliação Formativa';
        isAvaliacao = true;
      } else if (weekNum === 10) {
        specialNote = 'SEI - Recuperação e Aprofundamento';
        isSEI = true;
      } else if (weekNum === 11) {
        specialNote = 'Fechamento do 3º Bimestre';
      }
    }

    // Monta texto de observações e notas entre colchetes
    const notesList: string[] = [];
    if (holidaysInWeek.length > 0) {
      holidaysInWeek.forEach(h => {
        const cleanName = h.name.replace(/\s*\([^\)]*\)/g, '').trim();
        notesList.push(`${h.date.slice(0, 5)} ${cleanName}`);
      });
    }
    if (specialNote) {
      notesList.push(specialNote);
    }

    const noteSuffix = notesList.length > 0 ? ` [${notesList.join(' • ')}]` : '';
    const fullDateText = `Semana ${weekNum} (${rangeText}) - ${schoolDaysCount} ${schoolDaysCount === 1 ? 'dia letivo' : 'dias letivos'}${noteSuffix}`;

    schedule.push({
      weekNumber: weekNum,
      startDate: startDm,
      endDate: endDm,
      rangeText,
      schoolDaysCount,
      fullDateText,
      holidaysInWeek,
      note: specialNote,
      isSEI,
      isAvaliacao
    });

    // Toda semana subsequente DEVE iniciar obrigatoriamente na segunda-feira
    curr = new Date(fridayDate.getTime());
    curr.setDate(curr.getDate() + 3);
    while (curr.getDay() === 0 || curr.getDay() === 6) {
      curr.setDate(curr.getDate() + 1);
    }
    weekNum++;
  }

  return schedule;
}

export interface TeacherScheduleConfig {
  classDays?: number[];          // 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex (padrão [4] = Quintas)
  classesPerDay?: number;        // Aulas por dia lecionado: 1, 2 (bloco geminado), 3
  plannedClasses?: number;       // Teto total de aulas J8 (ex: 12 ou 14)
  rowCount?: number;             // Quantidade de linhas/semanas na grade (ex: 10)
}

export interface TeacherAllocatedWeek {
  weekNumber: number;
  rowNumber: number;
  datesText: string;             // ex: "30/07" ou "28/07 e 30/07"
  status: 'regular' | 'displaced' | 'closing_accumulated' | 'suspension' | 'sei' | 'closing';
  fullDateText: string;          // Padrão SEDUC: Semana X (DD/MM) - Aulas regulares / transferida / Fechamento
  lessonStart: number;
  lessonEnd: number;
  lessonRange: string;           // ex: "Aulas 1 e 2"
  classesCount: number;
  displacedFromDates?: string[];
  holidayReason?: string;
  isSEI?: boolean;
  isAvaliacao?: boolean;
  isClosing?: boolean;
  isTransferred?: boolean;       // Sinalizador estrito para destaque em vermelho claro (#FEE2E2)
}

/**
 * MOTOR DE ALOCAÇÃO E DESLOCAMENTO REAL POR CALENDÁRIO (COLUNA B - LINHA 28 EM DIANTE)
 * 
 * Regras Estritas da SEDUC-SP (v2.1.6):
 * 1. Deslocamento Integral do Bloco Pedagógico:
 *    - Cada linha da grade é uma unidade pedagógica indivisível da aula (Aulas 1 e 2, Aulas 3 e 4...).
 *    - Quando um dia de aula cair em feriado/suspensão (ex: 15/10 - Dia do Professor):
 *      NÃO há aula nessa data. O bloco pedagógico completo é transferido para o próximo
 *      dia letivo disponível em que o professor atende a turma.
 * 2. Eliminação de Duplicação de Rótulos:
 *    - O aviso de feriado (ex.: [Feriado em 15/10]) aparece EXCLUSIVAMENTE na data em que a aula
 *      foi efetivamente reposta/transferida, sem se propagar de forma redundante para as semanas seguintes.
 * 3. Destaque Visual em Vermelho Claro:
 *    - A linha da aula transferida recebe isTransferred: true para preenchimento em vermelho claro
 *      (#FEE2E2 / ARGB FFFFE4E4) no Excel e bg-red-50 no visualizador.
 */
export function generateTeacherClassSchedule(options: {
  bimestreNum: number | string;
  calendarData?: CalendarSummary;
  targetYear?: number;
  classDays?: number[];
  classesPerDay?: number;
  plannedClasses?: number;
  rowCount?: number;
}): TeacherAllocatedWeek[] {
  const bim = extractBimestreNum(options.bimestreNum);
  const targetYear = options.targetYear || (options.calendarData ? options.calendarData.year : new Date().getFullYear());
  const calDetails = getSeducBimestreDetails(bim, targetYear, options.calendarData);

  // 1. Dias da semana selecionados (1=Segunda a 5=Sexta)
  // Padrão oficial URE Taubaté / SEDUC: [4] (Quinta-feira com bloco geminado de 2 aulas)
  let rawDays = Array.isArray(options.classDays) && options.classDays.length > 0
    ? options.classDays.map(Number).filter(d => d >= 1 && d <= 5)
    : [4];
  if (rawDays.length === 0) rawDays = [4];
  const activeClassDays = Array.from(new Set(rawDays)).sort((a, b) => a - b);

  const classesPerDay = Number(options.classesPerDay) >= 1 && Number(options.classesPerDay) <= 4
    ? Number(options.classesPerDay)
    : 2;

  const totalPlannedClasses = Number(options.plannedClasses) >= 8
    ? Number(options.plannedClasses)
    : 18;

  // 2. Mapa de Feriados, Recessos e Suspensões
  const allHolidays = [...calDetails.feriadosERecessos];
  if (options.calendarData?.holidaysAndBreaks && Array.isArray(options.calendarData.holidaysAndBreaks)) {
    options.calendarData.holidaysAndBreaks.forEach(hb => {
      if (hb && hb.date && !allHolidays.some(h => normalizeDateKey(h.date, targetYear) === normalizeDateKey(hb.date, targetYear))) {
        allHolidays.push(hb);
      }
    });
  }

  const holidayMap = new Map<string, string>();
  allHolidays.forEach(h => {
    if (h.date) {
      const rangeMatch = h.date.match(/(\d{1,2})\s*a\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
      if (rangeMatch) {
        const startD = parseInt(rangeMatch[1], 10);
        const endD = parseInt(rangeMatch[2], 10);
        const m = parseInt(rangeMatch[3], 10);
        const y = parseInt(rangeMatch[4], 10);
        for (let day = startD; day <= endD; day++) {
          const dateKey = `${String(day).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
          holidayMap.set(dateKey, h.name);
        }
      } else {
        holidayMap.set(normalizeDateKey(h.date, targetYear), h.name);
      }
    }
  });

  // 3. Varredura das semanas de segunda a sexta do bimestre
  const weeklyBoundaries = generateSeducWeeklySchedule(bim, allHolidays, options.calendarData, targetYear);
  const bimStartDate = parseBrDate(calDetails.startDate, targetYear);
  const bimEndDate = parseBrDate(calDetails.endDate, targetYear);

  const totalGridRows = Math.max(
    Number(options.rowCount) >= 5 && Number(options.rowCount) <= 15 ? Number(options.rowCount) : 11,
    weeklyBoundaries.length
  );

  const pendingDisplacements: Array<{ originalDateDm: string; holidayName: string }> = [];
  const allocatedWeeks: TeacherAllocatedWeek[] = [];
  let currentLessonCounter = 1;
  let weekIndex = 1;

  // Varredura estritamente cronológica das semanas do bimestre
  weeklyBoundaries.forEach((wb) => {
    if (weekIndex > totalGridRows) return;

    const startW = parseBrDate(`${wb.startDate}/${targetYear}`);
    const endW = parseBrDate(`${wb.endDate}/${targetYear}`);

    let availableDatesInWeek: Date[] = [];
    let holidayDatesInWeek: Array<{ date: Date; name: string }> = [];

    let scanDay = new Date(startW.getTime());
    while (scanDay.getTime() <= endW.getTime()) {
      const dow = scanDay.getDay(); // 1 a 5 (Segunda a Sexta)
      if (activeClassDays.includes(dow) && scanDay.getTime() >= bimStartDate.getTime() && scanDay.getTime() <= bimEndDate.getTime()) {
        const key = formatBrDate(scanDay);
        const holiday = holidayMap.get(key);
        if (holiday) {
          holidayDatesInWeek.push({ date: new Date(scanDay.getTime()), name: holiday });
        } else {
          availableDatesInWeek.push(new Date(scanDay.getTime()));
        }
      }
      scanDay.setDate(scanDay.getDate() + 1);
    }

    // Se a turma teve feriado/suspensão em dia de aula nesta semana, enfileira para deslocamento
    holidayDatesInWeek.forEach(hd => {
      pendingDisplacements.push({
        originalDateDm: formatDayMonth(hd.date),
        holidayName: hd.name
      });
    });

    // CASO 1: A turma NÃO teve dias disponíveis nesta semana (ex: aula na quinta e caiu em feriado como 15/10 - Dia do Professor)
    // REGRA MANDATÓRIA: Não ministrar aula nesta data! Deslocar o bloco integral da aula para a data letiva seguinte e destacar em vermelho claro (#FEE2E2).
    if (availableDatesInWeek.length === 0) {
      const hDate = holidayDatesInWeek[0]?.date;
      const hDateStr = hDate ? formatBrDate(hDate) : `${wb.startDate}/${targetYear}`;
      const rawHName = holidayDatesInWeek[0]?.name || 'Suspensão de Aulas';
      const isProfessor = rawHName.toLowerCase().includes('professor') || hDateStr.includes('15/10');
      const eventName = isProfessor ? 'Dia do Professor' : rawHName.replace(/\s*\(.*?\)/g, '').trim();
      const reasonLabel = isProfessor ? 'Dia do Professor [Suspensão de Aulas]' : `${eventName} [Suspensão de Aulas]`;
      const fullDateText = `Semana ${wb.weekNumber} (${hDateStr}) - ${reasonLabel}`;

      allocatedWeeks.push({
        weekNumber: wb.weekNumber,
        rowNumber: 28 + (wb.weekNumber - 1),
        datesText: hDateStr,
        status: 'suspension',
        fullDateText,
        lessonStart: 0,
        lessonEnd: 0,
        lessonRange: 'Suspensão de Aulas',
        classesCount: 0,
        holidayReason: eventName,
        isSEI: false,
        isAvaliacao: false,
        isTransferred: true // Destaque visual obrigatório em vermelho claro (#FEE2E2 / bg-red-50)
      });

      weekIndex = wb.weekNumber + 1;
      return;
    }

    // CASO 2: Há dias letivos disponíveis nesta semana para o professor e a turma
    let datesText = '';
    if (availableDatesInWeek.length === 1) {
      datesText = formatBrDate(availableDatesInWeek[0]);
    } else if (activeClassDays.length === 5) {
      datesText = `${formatBrDate(availableDatesInWeek[0])} a ${formatBrDate(availableDatesInWeek[availableDatesInWeek.length - 1])}`;
    } else {
      datesText = availableDatesInWeek.map(d => formatBrDate(d)).join(' e ');
    }

    // REGRA DE OURO DA SEDUC-SP:
    // As Semanas 1 a 9 são EXCLUSIVAMENTE aulas de conteúdo curricular regular (ou reposição/transferência).
    // O rótulo [SEI / Recuperação] é atribuído EXCLUSIVAMENTE à Semana 10.
    // O rótulo [Conselho de Classe / Fechamento Bimestral] é atribuído EXCLUSIVAMENTE à Semana 11.
    const isSEI = wb.weekNumber === 10;
    const isClosing = wb.weekNumber === 11;

    // SEMANA 11: Conselho de Classe / Fechamento de Médias e Frequências (Linha 38)
    if (isClosing) {
      const fullDateText = `Semana ${wb.weekNumber} (${datesText}) - [Conselho de Classe / Fechamento de Médias e Frequências]`;
      allocatedWeeks.push({
        weekNumber: wb.weekNumber,
        rowNumber: 28 + (wb.weekNumber - 1),
        datesText,
        status: 'closing',
        fullDateText,
        lessonStart: 0,
        lessonEnd: 0,
        lessonRange: 'Conselho de Classe / Fechamento de Médias e Frequências',
        classesCount: 0,
        isSEI: false,
        isClosing: true,
        isTransferred: false
      });
      weekIndex = wb.weekNumber + 1;
      return;
    }

    // SEMANA 10: Semana de Estudos Intensivos (SEI) / Recuperação e Nivelamento (Linha 37)
    if (isSEI) {
      const fullDateText = `Semana ${wb.weekNumber} (${datesText}) - [Semana de Estudos Intensivos (SEI) / Recuperação e Nivelamento]`;
      allocatedWeeks.push({
        weekNumber: wb.weekNumber,
        rowNumber: 28 + (wb.weekNumber - 1),
        datesText,
        status: 'sei',
        fullDateText,
        lessonStart: 0,
        lessonEnd: 0,
        lessonRange: 'Semana de Estudos Intensivos (SEI) / Recuperação e Nivelamento',
        classesCount: classesPerDay,
        isSEI: true,
        isClosing: false,
        isTransferred: false
      });
      weekIndex = wb.weekNumber + 1;
      return;
    }

    // SEMANAS 1 A 9: AULAS REGULARES DE CONTEÚDO CURRICULAR
    // Se há aula deslocada de feriado/suspensão anterior (como 15/10), ela é ministrada integralmente aqui!
    if (pendingDisplacements.length > 0) {
      const disp = pendingDisplacements.shift()!;
      const lStart = currentLessonCounter;
      const lEnd = lStart + classesPerDay - 1;
      currentLessonCounter = lEnd + 1;

      // REGRA: O aviso de feriado (ex: [Feriado em 15/10]) aparece EXCLUSIVAMENTE nesta aula reposta
      const fullDateText = `Semana ${wb.weekNumber} (${datesText}) - Aula transferida/reposta [Feriado em ${disp.originalDateDm}]`;

      allocatedWeeks.push({
        weekNumber: wb.weekNumber,
        rowNumber: 28 + (wb.weekNumber - 1),
        datesText,
        status: 'displaced',
        fullDateText,
        lessonStart: lStart,
        lessonEnd: lEnd,
        lessonRange: `Aulas ${lStart} e ${lEnd}`,
        classesCount: classesPerDay,
        displacedFromDates: [disp.originalDateDm],
        holidayReason: disp.holidayName,
        isSEI: false,
        isAvaliacao: false,
        isTransferred: true // Destaque visual obrigatório em vermelho claro (#FEE2E2 / bg-red-50)
      });

      weekIndex = wb.weekNumber + 1;
      return;
    }

    // AULAS REGULARES CURRICULARES (Sem feriado pendente - Sem rótulos duplicados)
    const lStart = currentLessonCounter;
    const lEnd = lStart + classesPerDay - 1;
    currentLessonCounter = lEnd + 1;

    let fullDateText = `Semana ${wb.weekNumber} (${datesText}) - Aulas ${lStart} e ${lEnd}`;
    if (activeClassDays.length === 5 && holidayDatesInWeek.length > 0) {
      const hDateDm = formatDayMonth(holidayDatesInWeek[0].date);
      fullDateText = `Semana ${wb.weekNumber} (${datesText}) - ${availableDatesInWeek.length} dias letivos [${hDateDm} ${holidayDatesInWeek[0].name}]`;
    }

    allocatedWeeks.push({
      weekNumber: wb.weekNumber,
      rowNumber: 28 + (wb.weekNumber - 1),
      datesText,
      status: 'regular',
      fullDateText,
      lessonStart: lStart,
      lessonEnd: lEnd,
      lessonRange: `Aulas ${lStart} e ${lEnd}`,
      classesCount: classesPerDay,
      isSEI: false,
      isAvaliacao: false,
      isTransferred: false
    });

    weekIndex = wb.weekNumber + 1;
  });

  // Preenchimento de linhas remanescentes até totalGridRows (sem rótulo de fechamento curricular precoce)
  while (weekIndex <= totalGridRows) {
    const fallbackWb = weeklyBoundaries[weekIndex - 1] || weeklyBoundaries[weeklyBoundaries.length - 1];
    const dText = fallbackWb ? `${fallbackWb.startDate}/${targetYear}` : `Semana ${weekIndex}`;
    allocatedWeeks.push({
      weekNumber: weekIndex,
      rowNumber: 28 + (weekIndex - 1),
      datesText: dText,
      status: 'regular',
      fullDateText: `Semana ${weekIndex} (${dText})`,
      lessonStart: totalPlannedClasses,
      lessonEnd: totalPlannedClasses,
      lessonRange: 'Aulas regulares',
      classesCount: 0,
      isSEI: false,
      isClosing: false,
      isTransferred: false
    });
    weekIndex++;
  }

  return allocatedWeeks;
}

/**
 * Retorna o texto formatado estritamente no padrão SEDUC para a Coluna B
 * Ex: `Semana X (DD/MM) - Aulas regulares`
 *     `Semana X (DD/MM) - Aula transferida/reposta [Feriado em DD/MM]`
 *     `Semana N (DD/MM) - Fechamento / SEI / Aulas Acumuladas`
 */
export function getSeducWeekPeriodText(
  weekNum: number,
  bimestreNum: number | string = 4,
  isSEI?: boolean,
  isAvaliacao?: boolean,
  activeRowCount?: number,
  calendarData?: CalendarSummary,
  targetYearInput?: number,
  teacherScheduleInput?: TeacherScheduleConfig
): string {
  const bim = extractBimestreNum(bimestreNum);
  const targetYear = targetYearInput || (calendarData && calendarData.year >= 2020 ? calendarData.year : 2026);
  const rowCount = activeRowCount || 10;

  // Se houver configuração de grade semanal (ou padrão URE Taubaté)
  const teacherSchedule = generateTeacherClassSchedule({
    bimestreNum: bim,
    calendarData,
    targetYear,
    classDays: teacherScheduleInput?.classDays,
    classesPerDay: teacherScheduleInput?.classesPerDay,
    plannedClasses: teacherScheduleInput?.plannedClasses,
    rowCount
  });

  const matchingWeek = teacherSchedule.find(s => s.weekNumber === weekNum);
  if (matchingWeek) {
    return matchingWeek.fullDateText;
  }

  // Fallback seguro caso weekNum extrapole a contagem configurada
  const customHolidays = calendarData?.holidaysAndBreaks || [];
  const schedule = generateSeducWeeklySchedule(bim, customHolidays, calendarData, targetYear);
  const entry = schedule.find(s => s.weekNumber === weekNum);

  if (entry) {
    if (entry.fullDateText.includes('SEI') || entry.fullDateText.includes('Avalia') || entry.fullDateText.includes('Início') || entry.fullDateText.includes('Fechamento')) {
      return entry.fullDateText;
    }
    if (isSEI && !entry.fullDateText.includes('SEI')) {
      return `${entry.fullDateText} [SEI - Recuperação e Aprofundamento]`;
    }
    if (isAvaliacao && !entry.fullDateText.includes('Avalia')) {
      return `${entry.fullDateText} [Avaliação Bimestral]`;
    }
    return entry.fullDateText;
  }

  const fallbackSchoolDays = (isSEI || isAvaliacao) ? 4 : 5;
  let fallbackSuffix = '';
  if (isSEI) fallbackSuffix = ' [SEI - Recuperação e Aprofundamento]';
  else if (isAvaliacao) fallbackSuffix = ' [Avaliação Bimestral]';
  return `Semana ${weekNum} - ${fallbackSchoolDays} dias letivos${fallbackSuffix}`;
}

/**
 * Retorna as informações detalhadas de alocação da semana docente (incluindo status e isTransferred)
 */
export function getTeacherAllocatedWeekInfo(
  weekNum: number,
  bimestreNum: number | string = 4,
  activeRowCount?: number,
  calendarData?: CalendarSummary,
  targetYearInput?: number,
  teacherScheduleInput?: TeacherScheduleConfig
): TeacherAllocatedWeek | undefined {
  const bim = extractBimestreNum(bimestreNum);
  const targetYear = targetYearInput || (calendarData && calendarData.year >= 2020 ? calendarData.year : 2026);
  const rowCount = activeRowCount || 10;

  const teacherSchedule = generateTeacherClassSchedule({
    bimestreNum: bim,
    calendarData,
    targetYear,
    classDays: teacherScheduleInput?.classDays,
    classesPerDay: teacherScheduleInput?.classesPerDay,
    plannedClasses: teacherScheduleInput?.plannedClasses,
    rowCount
  });

  return teacherSchedule.find(s => s.weekNumber === weekNum);
}

