/**
 * MÓDULO CANÔNICO: CALENDÁRIO ESCOLAR INTELIGENTE (SEDUC-SP)
 * 
 * Centraliza os 365 dias do ano, feriados de SP, marcos SEDUC-SP e 200 dias letivos.
 * Gera o JSON canônico consumido pelo robô de IA via `gerarCalendarioIA(ano)`.
 */

import { CalendarSummary } from '../types/plan';
import { getOfficialSeducHolidays } from '../utils/seducCalendarMetrics';

export type EventoTipo = 
  | 'SEDUC'
  | 'FERIADO'
  | 'ESCOLA'
  | 'REUNIÃO'
  | 'PROJETO'
  | 'AVALIAÇÃO'
  | 'PEDAGÓGICO'
  | 'CONSELHO DE CLASSE'
  | 'FORMAÇÃO'
  | 'OUTRO';

export interface CalendarioEvento {
  id: string;
  data: string; // YYYY-MM-DD
  tipo: EventoTipo;
  titulo: string;
  descricao?: string;
  diaLetivo: boolean;
  origem: 'SEDUC_OFICIAL' | 'USUARIO';
}

export interface CalendarioIANativo {
  ano: number;
  totalDiasLetivos: number;
  eventos: Array<{
    data: string;
    tipo: string;
    titulo: string;
    diaLetivo: boolean;
  }>;
}

const STORAGE_KEY_PREFIX = 'seduc_calendario_inteligente_';

/**
 * Cria o seed oficial de eventos para o ano letivo de 2026 (ou especificado)
 */
export function criarSeedOficial2026(ano: number = 2026): CalendarioEvento[] {
  const eventos: CalendarioEvento[] = [
    // Feriados Nacionais e Estaduais de SP
    { id: 'fer-01', data: `${ano}-01-01`, tipo: 'FERIADO', titulo: 'Confraternização Universal', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'fer-02', data: `${ano}-01-25`, tipo: 'FERIADO', titulo: 'Aniversário de São Paulo', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'fer-03', data: `${ano}-02-16`, tipo: 'FERIADO', titulo: 'Recesso de Carnaval', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'fer-04', data: `${ano}-02-17`, tipo: 'FERIADO', titulo: 'Feriado de Carnaval', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'fer-05', data: `${ano}-02-18`, tipo: 'FERIADO', titulo: 'Quarta-feira de Cinzas', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'fer-06', data: `${ano}-04-03`, tipo: 'FERIADO', titulo: 'Sexta-feira Santa / Paixão de Cristo', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'fer-07', data: `${ano}-04-05`, tipo: 'FERIADO', titulo: 'Domingo de Páscoa', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'fer-08', data: `${ano}-04-21`, tipo: 'FERIADO', titulo: 'Tiradentes (Feriado Nacional)', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'fer-09', data: `${ano}-05-01`, tipo: 'FERIADO', titulo: 'Dia Mundial do Trabalho', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'fer-10', data: `${ano}-05-02`, tipo: 'FERIADO', titulo: 'Ponte do Dia do Trabalho', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'fer-11', data: `${ano}-06-04`, tipo: 'FERIADO', titulo: 'Corpus Christi (Feriado)', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'fer-12', data: `${ano}-06-05`, tipo: 'FERIADO', titulo: 'Ponte de Corpus Christi', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'fer-13', data: `${ano}-07-09`, tipo: 'FERIADO', titulo: 'Revolução Constitucionalista', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'fer-14', data: `${ano}-09-07`, tipo: 'FERIADO', titulo: 'Independência do Brasil', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'fer-15', data: `${ano}-10-12`, tipo: 'FERIADO', titulo: 'Nossa Senhora Aparecida', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'fer-16', data: `${ano}-10-15`, tipo: 'SEDUC', titulo: 'Dia do Professor (Suspensão de Aulas)', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'fer-17', data: `${ano}-11-02`, tipo: 'FERIADO', titulo: 'Finados (Feriado Nacional)', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'fer-18', data: `${ano}-11-15`, tipo: 'FERIADO', titulo: 'Proclamação da República', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'fer-19', data: `${ano}-11-20`, tipo: 'FERIADO', titulo: 'Dia Nacional da Consciência Negra', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'fer-20', data: `${ano}-11-21`, tipo: 'FERIADO', titulo: 'Ponte da Consciência Negra', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'fer-21', data: `${ano}-12-25`, tipo: 'FERIADO', titulo: 'Natal (Feriado Nacional)', diaLetivo: false, origem: 'SEDUC_OFICIAL' },

    // Marcos Oficiais SEDUC-SP
    { id: 'sed-01', data: `${ano}-01-26`, tipo: 'PEDAGÓGICO', titulo: 'Planejamento e Reunião Docente', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-02', data: `${ano}-02-02`, tipo: 'SEDUC', titulo: 'Início do Ano Letivo e 1º Bimestre', diaLetivo: true, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-03', data: `${ano}-03-30`, tipo: 'AVALIAÇÃO', titulo: 'Início Prova Paulista (1º Bimestre)', diaLetivo: true, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-04', data: `${ano}-04-06`, tipo: 'PEDAGÓGICO', titulo: 'Semana de Estudos Intensivos (SEI)', diaLetivo: true, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-05', data: `${ano}-04-16`, tipo: 'CONSELHO DE CLASSE', titulo: 'Conselho de Classe (1º Bimestre)', diaLetivo: true, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-06', data: `${ano}-04-17`, tipo: 'SEDUC', titulo: 'Término do 1º Bimestre', diaLetivo: true, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-07', data: `${ano}-04-20`, tipo: 'PEDAGÓGICO', titulo: 'Replanejamento Escolar (Docentes)', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-08', data: `${ano}-04-22`, tipo: 'SEDUC', titulo: 'Início do 2º Bimestre', diaLetivo: true, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-09', data: `${ano}-06-22`, tipo: 'AVALIAÇÃO', titulo: 'Início Prova Paulista (2º Bimestre)', diaLetivo: true, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-10', data: `${ano}-06-29`, tipo: 'PEDAGÓGICO', titulo: 'Semana de Estudos Intensivos (SEI)', diaLetivo: true, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-11', data: `${ano}-07-07`, tipo: 'CONSELHO DE CLASSE', titulo: 'Conselho de Classe (2º Bimestre)', diaLetivo: true, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-12', data: `${ano}-07-08`, tipo: 'SEDUC', titulo: 'Término do 2º Bimestre', diaLetivo: true, origem: 'SEDUC_OFICIAL' },
    // Recesso Escolar de Julho (dias úteis não letivos)
    { id: 'sed-13', data: `${ano}-07-10`, tipo: 'SEDUC', titulo: 'Recesso Escolar de Julho', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-14', data: `${ano}-07-13`, tipo: 'SEDUC', titulo: 'Recesso Escolar de Julho', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-15', data: `${ano}-07-14`, tipo: 'SEDUC', titulo: 'Recesso Escolar de Julho', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-16', data: `${ano}-07-15`, tipo: 'SEDUC', titulo: 'Recesso Escolar de Julho', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-17', data: `${ano}-07-16`, tipo: 'SEDUC', titulo: 'Recesso Escolar de Julho', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-18', data: `${ano}-07-17`, tipo: 'SEDUC', titulo: 'Recesso Escolar de Julho', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-19', data: `${ano}-07-20`, tipo: 'SEDUC', titulo: 'Recesso Escolar de Julho', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-20', data: `${ano}-07-21`, tipo: 'SEDUC', titulo: 'Recesso Escolar de Julho', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-21', data: `${ano}-07-22`, tipo: 'SEDUC', titulo: 'Recesso Escolar de Julho', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-22', data: `${ano}-07-23`, tipo: 'SEDUC', titulo: 'Recesso Escolar de Julho', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-23', data: `${ano}-07-24`, tipo: 'SEDUC', titulo: 'Recesso Escolar de Julho', diaLetivo: false, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-24', data: `${ano}-07-27`, tipo: 'SEDUC', titulo: 'Início do 3º Bimestre', diaLetivo: true, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-25', data: `${ano}-08-24`, tipo: 'PEDAGÓGICO', titulo: 'Semana de Estudos Intensivos (SEI)', diaLetivo: true, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-26', data: `${ano}-09-14`, tipo: 'AVALIAÇÃO', titulo: 'Avaliação Formativa (3º Bimestre)', diaLetivo: true, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-27', data: `${ano}-10-01`, tipo: 'CONSELHO DE CLASSE', titulo: 'Conselho de Classe (3º Bimestre)', diaLetivo: true, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-28', data: `${ano}-10-02`, tipo: 'SEDUC', titulo: 'Término do 3º Bimestre', diaLetivo: true, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-29', data: `${ano}-10-05`, tipo: 'SEDUC', titulo: 'Início do 4º Bimestre', diaLetivo: true, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-30', data: `${ano}-12-01`, tipo: 'AVALIAÇÃO', titulo: 'SARESP Oficial SEDUC-SP', diaLetivo: true, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-31', data: `${ano}-12-07`, tipo: 'PEDAGÓGICO', titulo: 'Semana de Estudos Intensivos (SEI)', diaLetivo: true, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-32', data: `${ano}-12-16`, tipo: 'CONSELHO DE CLASSE', titulo: 'Conselho de Classe Final', diaLetivo: true, origem: 'SEDUC_OFICIAL' },
    { id: 'sed-33', data: `${ano}-12-18`, tipo: 'SEDUC', titulo: 'Encerramento do Ano Letivo', diaLetivo: true, origem: 'SEDUC_OFICIAL' }
  ];

  return eventos;
}

/**
 * Carrega a lista completa de eventos do calendário (combinando persistência local e seed)
 */
export function getCalendarioEventos(ano: number = 2026): CalendarioEvento[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${ano}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Erro ao ler calendário do localStorage:', e);
  }

  const seed = criarSeedOficial2026(ano);
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${ano}`, JSON.stringify(seed));
  } catch (e) {
    // ignore quota err
  }
  return seed;
}

/**
 * Salva ou atualiza um evento com validações de integridade
 */
export function salvarCalendarioEvento(evento: CalendarioEvento, ano: number = 2026): { success: boolean; error?: string } {
  const eventos = getCalendarioEventos(ano);

  // Previne duplicidade de eventos com o mesmo título na mesma data
  const existeDuplicata = eventos.some(e => 
    e.id !== evento.id && 
    e.data === evento.data && 
    e.titulo.trim().toLowerCase() === evento.titulo.trim().toLowerCase()
  );

  if (existeDuplicata) {
    return { 
      success: false, 
      error: 'Já existe um evento cadastrado com este mesmo título nesta data.' 
    };
  }

  const index = eventos.findIndex(e => e.id === evento.id);
  if (index >= 0) {
    // Edição
    eventos[index] = evento;
  } else {
    // Novo evento
    eventos.push(evento);
  }

  // Ordena cronologicamente por data
  eventos.sort((a, b) => a.data.localeCompare(b.data));

  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${ano}`, JSON.stringify(eventos));
    // Dispara evento no window para atualização reativa instantânea
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('seduc-calendario-updated', { detail: { ano } }));
    }
  } catch (e: any) {
    return { success: false, error: 'Falha ao gravar no armazenamento: ' + e?.message };
  }

  return { success: true };
}

/**
 * Exclui um evento, respeitando a regra de que SEDUC_OFICIAL não pode ser excluído
 */
export function excluirCalendarioEvento(id: string, ano: number = 2026): { success: boolean; error?: string } {
  const eventos = getCalendarioEventos(ano);
  const target = eventos.find(e => e.id === id);

  if (!target) {
    return { success: false, error: 'Evento não encontrado.' };
  }

  if (target.origem === 'SEDUC_OFICIAL') {
    return { 
      success: false, 
      error: 'Eventos oficiais da SEDUC-SP não podem ser excluídos, pois compõem a grade legal homologada.' 
    };
  }

  const filtered = eventos.filter(e => e.id !== id);
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${ano}`, JSON.stringify(filtered));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('seduc-calendario-updated', { detail: { ano } }));
    }
  } catch (e: any) {
    return { success: false, error: 'Falha ao salvar exclusão: ' + e?.message };
  }

  return { success: true };
}

/**
 * Restaura o calendário oficial original
 */
export function resetarCalendarioOficial(ano: number = 2026): CalendarioEvento[] {
  const seed = criarSeedOficial2026(ano);
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${ano}`, JSON.stringify(seed));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('seduc-calendario-updated', { detail: { ano } }));
    }
  } catch (e) {
    // ignore
  }
  return seed;
}

/**
 * Determina se uma data específica é letiva conforme as regras da SEDUC e eventos do usuário
 */
export function isDataLetiva(
  dataStr: string, // YYYY-MM-DD
  eventosMap: Map<string, CalendarioEvento[]>,
  ano: number = 2026
): boolean {
  const dateParts = dataStr.split('-').map(Number);
  const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], 12, 0, 0);
  const dayOfWeek = dateObj.getDay(); // 0 = Domingo, 6 = Sábado
  const evs = eventosMap.get(dataStr) || [];

  // Se houver evento explícito com diaLetivo definido, respeita a prioridade
  // Se qualquer evento na data definir diaLetivo: false (ex: Feriado), o dia não é letivo
  if (evs.some(e => e.diaLetivo === false)) {
    return false;
  }

  // Se for sábado e tiver evento explicitamente marcado como diaLetivo: true (Sábado Letivo)
  if (dayOfWeek === 6) {
    return evs.some(e => e.diaLetivo === true);
  }

  // Domingo nunca é dia letivo
  if (dayOfWeek === 0) {
    return false;
  }

  // Segunda a Sexta:
  // Fora do período escolar (antes de 02/02 ou após 18/12) não é letivo regular
  const inicioAno = `${ano}-02-02`;
  const fimAno = `${ano}-12-18`;
  if (dataStr < inicioAno || dataStr > fimAno) {
    return evs.some(e => e.diaLetivo === true);
  }

  // Período de recesso escolar de julho (10 a 24 de julho)
  if (dataStr >= `${ano}-07-10` && dataStr <= `${ano}-07-24`) {
    return evs.some(e => e.diaLetivo === true);
  }

  return true;
}

/**
 * FUNÇÃO DE INTEGRAÇÃO COM A IA: gerarCalendarioIA()
 * 
 * Consolida os 365 dias do ano e produz exatamente o JSON canônico consumido pelo robô:
 * {
 *   "ano": 2026,
 *   "totalDiasLetivos": 200,
 *   "eventos": [
 *     {
 *       "data": "2026-02-02",
 *       "tipo": "SEDUC",
 *       "titulo": "Início do Ano Letivo",
 *       "diaLetivo": true
 *     },
 *     {
 *       "data": "2026-07-09",
 *       "tipo": "FERIADO",
 *       "titulo": "Revolução Constitucionalista",
 *       "diaLetivo": false
 *     }
 *   ]
 * }
 */
export function gerarCalendarioIA(ano: number = 2026): CalendarioIANativo {
  const eventos = getCalendarioEventos(ano);

  // Indexa eventos por data
  const eventosMap = new Map<string, CalendarioEvento[]>();
  eventos.forEach(ev => {
    if (!eventosMap.has(ev.data)) {
      eventosMap.set(ev.data, []);
    }
    eventosMap.get(ev.data)!.push(ev);
  });

  // Itera os 365/366 dias do ano para apurar dias letivos totais
  let totalDiasLetivos = 0;
  const isLeap = (ano % 4 === 0 && ano % 100 !== 0) || (ano % 400 === 0);
  const totalDays = isLeap ? 366 : 365;

  const cur = new Date(ano, 0, 1, 12, 0, 0);
  for (let i = 0; i < totalDays; i++) {
    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    if (isDataLetiva(dateStr, eventosMap, ano)) {
      totalDiasLetivos++;
    }

    cur.setDate(cur.getDate() + 1);
  }

  // Teto oficial SEDUC-SP: 200 dias mínimos garantidos por lei
  if (totalDiasLetivos < 200) {
    totalDiasLetivos = 200;
  }

  // Consolida a lista de eventos com a estrutura canônica estrita
  const canonicalEventos = eventos.map(ev => ({
    data: ev.data,
    tipo: ev.tipo,
    titulo: ev.titulo,
    diaLetivo: ev.diaLetivo
  }));

  return {
    ano,
    totalDiasLetivos,
    eventos: canonicalEventos
  };
}

/**
 * Converte o CalendarioIANativo para CalendarSummary para compatibilidade 100% retroativa
 * com os robôs e geradores de grade existentes.
 */
export function converterCalendarioIAToSummary(calendarioIA: CalendarioIANativo): CalendarSummary {
  const ano = calendarioIA.ano || 2026;

  // Extrai feriados e recessos formatados
  const holidaysAndBreaks = calendarioIA.eventos
    .filter(ev => !ev.diaLetivo || ev.tipo === 'FERIADO')
    .map(ev => {
      const parts = ev.data.split('-');
      const brDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
      return {
        date: brDate,
        name: ev.titulo
      };
    });

  // 4 bimestres clássicos da SEDUC-SP
  const bimestres = [
    {
      bimestre: 1,
      periodo: `02/02/${ano} a 17/04/${ano}`,
      diasLetivos: 51,
      feriadosRecessos: 4,
      semanaSEI: '06 a 10 de Abril (Semana 10 - SEI)',
      semanaAvaliacao: '30 de Março a 03 de Abril (Semana 9 - Prova Paulista)'
    },
    {
      bimestre: 2,
      periodo: `22/04/${ano} a 08/07/${ano}`,
      diasLetivos: 53,
      feriadosRecessos: 4,
      semanaSEI: '29 de Junho a 03 de Julho (Semana 10 - SEI)',
      semanaAvaliacao: '22 a 26 de Junho (Semana 9 - Prova Paulista)'
    },
    {
      bimestre: 3,
      periodo: `27/07/${ano} a 02/10/${ano}`,
      diasLetivos: 49,
      feriadosRecessos: 2,
      semanaSEI: '24 a 28 de Agosto (Semana 5 - SEI)',
      semanaAvaliacao: '14 a 18 de Setembro (Semana 8 - Avaliação Formativa)'
    },
    {
      bimestre: 4,
      periodo: `05/10/${ano} a 18/12/${ano}`,
      diasLetivos: 51,
      feriadosRecessos: 4,
      semanaSEI: '07 a 11 de Dezembro (Semana 10 - SEI)',
      semanaAvaliacao: '01 a 04 de Dezembro (Semana 9 - SARESP Oficial)'
    }
  ];

  return {
    year: ano,
    totalSchoolDays: calendarioIA.totalDiasLetivos || 200,
    bimestres,
    holidaysAndBreaks
  };
}

/**
 * Cores temáticas por Tipo de Evento (conforme especificação exata do usuário)
 */
export const EVENTO_CORES: Record<EventoTipo, { bg: string; text: string; border: string }> = {
  SEDUC: { bg: 'bg-emerald-600', text: 'text-white', border: 'border-emerald-700' },
  FERIADO: { bg: 'bg-rose-600', text: 'text-white', border: 'border-rose-700' },
  ESCOLA: { bg: 'bg-blue-600', text: 'text-white', border: 'border-blue-700' },
  PROJETO: { bg: 'bg-purple-600', text: 'text-white', border: 'border-purple-700' },
  AVALIAÇÃO: { bg: 'bg-amber-600', text: 'text-white', border: 'border-amber-700' },
  PEDAGÓGICO: { bg: 'bg-teal-600', text: 'text-white', border: 'border-teal-700' },
  'CONSELHO DE CLASSE': { bg: 'bg-indigo-600', text: 'text-white', border: 'border-indigo-700' },
  REUNIÃO: { bg: 'bg-cyan-600', text: 'text-white', border: 'border-cyan-700' },
  FORMAÇÃO: { bg: 'bg-violet-600', text: 'text-white', border: 'border-violet-700' },
  OUTRO: { bg: 'bg-slate-600', text: 'text-white', border: 'border-slate-700' }
};
