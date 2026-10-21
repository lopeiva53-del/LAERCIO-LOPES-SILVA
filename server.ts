import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { PDFParse } from 'pdf-parse';
import ExcelJS from 'exceljs';
import { 
  computeSeducCellMetrics, 
  getSeducWeekPeriodText, 
  getTeacherAllocatedWeekInfo, 
  generateTeacherClassSchedule,
  generateSeducWeeklySchedule,
  getSeducBimestreDetails,
  getOfficialSeducHolidays
} from './src/utils/seducCalendarMetrics';
import { FIXED_IMMUTABLE_CELLS, FixedCellKey } from './src/config/version';
import { 
  gerarCalendarioIA, 
  converterCalendarioIAToSummary 
} from './src/services/calendarioService';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const port = process.env.PORT || 3000;

// Route to extract text from PDF files using pdf-parse with page-by-page tracking
app.post('/api/extract-pdf-text', async (req, res) => {
  try {
    const { pdfBase64 } = req.body;
    if (!pdfBase64) {
      return res.status(400).json({ error: 'Nenhum dado base64 de PDF fornecido.' });
    }

    const buffer = Buffer.from(pdfBase64, 'base64');
    const parser = new PDFParse(new Uint8Array(buffer));
    const result = await parser.getText({
      pageJoiner: '\n--- PÁGINA page_number ---\n'
    });

    const text = result?.text || '';
    const rawPages: Array<{ num: number; text: string }> = (result as any)?.pages || [];
    const pages = rawPages.map((p, idx) => ({
      pageNumber: p.num || idx + 1,
      text: p.text || ''
    }));

    // If pages array is empty but text exists, build simple page segments
    if (pages.length === 0 && text) {
      const pageBlocks = text.split(/--- PÁGINA \d+ ---/i);
      if (pageBlocks.length > 1) {
        pageBlocks.forEach((block, idx) => {
          if (block.trim()) {
            pages.push({ pageNumber: idx, text: block.trim() });
          }
        });
      } else {
        pages.push({ pageNumber: 1, text });
      }
    }

    return res.json({ 
      success: true, 
      text, 
      pages,
      totalPages: result?.total || pages.length 
    });
  } catch (error: any) {
    console.log('Erro ao extrair texto do PDF via pdf-parse:', error?.message || error);
    return res.status(500).json({ error: error.message || 'Erro ao extrair texto do PDF' });
  }
});

// Endpoint para extração dinâmica real do arquivo anexado no SLOT 3 (PDF, imagem ou planilha do Calendário Escolar)
app.post('/api/parse-calendar-document', async (req, res) => {
  try {
    const { fileBase64, fileName, fileFormat, mimeType } = req.body;
    if (!fileBase64) {
      return res.status(400).json({ error: 'Nenhum dado de arquivo de calendário fornecido.' });
    }

    const buffer = Buffer.from(fileBase64, 'base64');
    let extractedText = '';
    const detectedYears: number[] = [];

    // Detecta ano a partir do nome do arquivo
    if (fileName) {
      const fnMatch = String(fileName).match(/\b(202\d|203\d)\b/);
      if (fnMatch) detectedYears.push(parseInt(fnMatch[1], 10));
    }

    // 1. Extração de texto por tipo de arquivo
    const format = (fileFormat || '').toLowerCase();
    const isPdf = format === 'pdf' || (mimeType && mimeType.includes('pdf')) || (fileName && fileName.endsWith('.pdf'));
    const isExcel = format === 'xlsx' || format === 'xls' || (mimeType && mimeType.includes('spreadsheet')) || (fileName && fileName.match(/\.xlsx?$/i));
    const isCsv = format === 'csv' || (mimeType && mimeType.includes('csv')) || (fileName && fileName.endsWith('.csv'));
    const isImage = format === 'image' || (mimeType && mimeType.startsWith('image/')) || (fileName && fileName.match(/\.(png|jpe?g|webp)$/i));

    if (isPdf) {
      try {
        const parser = new PDFParse(new Uint8Array(buffer));
        const result = await parser.getText();
        extractedText = result?.text || '';
      } catch (pdfErr: any) {
        console.log('Informação sobre leitura do PDF do calendário:', pdfErr?.message || pdfErr);
      }
    } else if (isCsv) {
      extractedText = buffer.toString('utf-8');
    } else if (isExcel) {
      try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as any);
        workbook.eachSheet((worksheet) => {
          worksheet.eachRow((row) => {
            const rowValues = row.values;
            if (Array.isArray(rowValues)) {
              extractedText += rowValues.filter(Boolean).map(v => typeof v === 'object' && (v as any).text ? (v as any).text : String(v)).join(' | ') + '\n';
            }
          });
        });
      } catch (xlErr: any) {
        console.log('Informação sobre leitura do XLSX do calendário:', xlErr?.message || xlErr);
      }
    }

    // Busca anos presentes no texto extraído
    if (extractedText) {
      const yearMatches = extractedText.match(/\b(202\d|203\d)\b/g);
      if (yearMatches) {
        yearMatches.forEach(y => detectedYears.push(parseInt(y, 10)));
      }
    }

    // Determina o ano letivo alvo
    let targetYear = 2026;
    if (detectedYears.length > 0) {
      const counts = new Map<number, number>();
      detectedYears.forEach(y => counts.set(y, (counts.get(y) || 0) + 1));
      let maxCount = 0;
      for (const [y, count] of counts.entries()) {
        if (count > maxCount) {
          maxCount = count;
          targetYear = y;
        }
      }
    }

    let parsedFromGemini: any = null;
    const apiKey = process.env.GEMINI_API_KEY;

    // 2. Se houver Gemini API, utiliza inteligência multimodal / OCR para extrair com máxima fidelidade
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const geminiPrompt = `
Você é o auditor e leitor oficial de calendários escolares da SEDUC-SP (Secretaria da Educação do Estado de São Paulo).
Analise com extrema precisão o Calendário Escolar fornecido e extraia as seguintes informações estruturadas em JSON puro:

1. "year": O ano letivo oficial do calendário (número inteiro de 4 dígitos, ex: 2026).
2. "bimestres": Array com os 4 bimestres letivos obrigatórios:
   - "bimestre": 1, 2, 3 ou 4
   - "startDate": data de início no formato estrito DD/MM/YYYY
   - "endDate": data de término no formato estrito DD/MM/YYYY
   - "periodo": texto descritivo do intervalo (ex: "05/10/2026 a 18/12/2026")
3. "holidaysAndBreaks": Array de todos os feriados oficiais, suspensões e pontes que ocorrem em DIAS ÚTEIS (segunda a sexta-feira):
   - "date": data no formato estrito DD/MM/YYYY
   - "name": descrição oficial do evento
   - "type": "feriado" | "ponte" | "recesso" | "suspensao"

DIRETRIZES OFICIAIS SEDUC-SP PARA 2026:
- 4º Bimestre de 2026: Início 05/10/2026 (segunda-feira) e término 18/12/2026 (sexta-feira).
- Feriados e suspensões em dias úteis no 4º Bimestre de 2026:
  * 12/10/2026 (N. Sra. Aparecida)
  * 15/10/2026 (Dia do Professor - suspensão de aulas)
  * 02/11/2026 (Finados)
  * 20/11/2026 (Consciência Negra)
  (15/11 é domingo; 28/10 é dia letivo regular).
`;

        let contents: any[] = [];
        if (isImage) {
          const imageMime = mimeType || (fileName && fileName.endsWith('.png') ? 'image/png' : 'image/jpeg');
          contents = [
            geminiPrompt,
            { inlineData: { mimeType: imageMime, data: fileBase64 } }
          ];
        } else if (isPdf && buffer.length < 15 * 1024 * 1024) {
          contents = [
            geminiPrompt,
            { inlineData: { mimeType: 'application/pdf', data: fileBase64 } }
          ];
        } else {
          contents = [
            geminiPrompt,
            `Texto extraído do documento (${fileName}):\n${extractedText.slice(0, 30000)}`
          ];
        }

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('TIMEOUT_15S')), 15000);
        });

        const response = await Promise.race([
          ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents,
            config: {
              responseMimeType: 'application/json',
            }
          }),
          timeoutPromise
        ]);

        let rawJson = response?.text || '{}';
        rawJson = rawJson.trim();
        if (rawJson.startsWith('```')) {
          rawJson = rawJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        }
        parsedFromGemini = JSON.parse(rawJson);
        if (parsedFromGemini.year && typeof parsedFromGemini.year === 'number') {
          targetYear = parsedFromGemini.year;
        }
      } catch (geminiErr: any) {
        console.log('Informação sobre extração via Gemini do Calendário (usando motor dinâmico):', geminiErr?.message || geminiErr);
      }
    }

    // 3. Monta a lista de bimestres e feriados combinando Gemini + Fallback Oficial
    const officialHolidays = getOfficialSeducHolidays(targetYear);
    const combinedHolidays: Array<{ date: string; name: string; type?: string }> = [...officialHolidays];

    if (parsedFromGemini?.holidaysAndBreaks && Array.isArray(parsedFromGemini.holidaysAndBreaks)) {
      parsedFromGemini.holidaysAndBreaks.forEach((hb: any) => {
        if (hb && hb.date && !combinedHolidays.some(ch => ch.date === hb.date)) {
          combinedHolidays.push({
            date: hb.date,
            name: hb.name || 'Feriado/Suspensão',
            type: hb.type || 'feriado'
          });
        }
      });
    }

    const bimestresInput = (parsedFromGemini?.bimestres && Array.isArray(parsedFromGemini.bimestres))
      ? parsedFromGemini.bimestres
      : [];

    // 4. Calcula dinamicamente métricas estritas para os 4 bimestres via JavaScript (new Date)
    const bimestresCalculados = ([1, 2, 3, 4] as const).map(bNum => {
      const customBim = bimestresInput.find((b: any) => Number(b.bimestre) === bNum);
      const bimDetails = getSeducBimestreDetails(bNum, targetYear, {
        year: targetYear,
        totalSchoolDays: 200,
        bimestres: customBim ? [{
          bimestre: bNum,
          periodo: customBim.periodo || `${customBim.startDate} a ${customBim.endDate}`,
          startDate: customBim.startDate,
          endDate: customBim.endDate,
          diasLetivos: 0,
          feriadosRecessos: 0,
          semanaSEI: '',
          semanaAvaliacao: ''
        }] : [],
        holidaysAndBreaks: combinedHolidays
      });

      return {
        bimestre: bNum,
        periodo: bimDetails.periodText,
        startDate: bimDetails.startDate,
        endDate: bimDetails.endDate,
        diasLetivos: bimDetails.diasLetivosJ7,
        diasEfetivos: bimDetails.diasEfetivosJ9,
        feriadosRecessos: bimDetails.feriadosERecessos.length,
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

    const totalSchoolDays = bimestresCalculados.reduce((sum, b) => sum + b.diasLetivos, 0);

    const calendarSummary = {
      year: targetYear,
      totalSchoolDays,
      bimestres: bimestresCalculados,
      holidaysAndBreaks: combinedHolidays,
      isAutoExtracted: true,
      extractedSource: parsedFromGemini ? 'Gemini AI Vision/OCR' : 'Leitor Dinâmico SEDUC'
    };

    const b4 = calendarSummary?.bimestres?.[3] || (calendarSummary?.bimestres && calendarSummary.bimestres.length > 0 ? calendarSummary.bimestres[calendarSummary.bimestres.length - 1] : undefined);
    return res.json({
      success: true,
      year: targetYear,
      calendar: calendarSummary,
      summary: `Ano Letivo ${targetYear} detectado • ${b4?.periodo || '4º Bimestre'} (J7 = ${b4?.diasLetivos ?? 51} dias, J9 = ${b4?.diasEfetivos ?? 47} dias)`
    });
  } catch (error: any) {
    console.log('Erro ao processar calendário escolar:', error?.message || error);
    return res.status(500).json({ error: error.message || 'Erro ao processar calendário escolar' });
  }
});

// Helper to normalize strings for comparison
function normalizeStrClean(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseBimNumber(val: string | number | undefined): number {
  if (typeof val === 'number') return val >= 1 && val <= 4 ? val : 1;
  const str = normalizeStrClean(String(val || ''));
  if (str.includes('4') || str.includes('quarto') || str.includes('4b')) return 4;
  if (str.includes('3') || str.includes('terceiro') || str.includes('3b')) return 3;
  if (str.includes('2') || str.includes('segundo') || str.includes('2b')) return 2;
  if (str.includes('1') || str.includes('primeiro') || str.includes('1b')) return 1;
  return 1;
}

function cleanPedagogicalText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[•·\*\-\–\—\(\)\[\]]+/g, ' ')
    .replace(/\s*[•·\*]+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


/**
 * Triple Key Search for official PDF guide:
 * Term 1: "Escopo e Sequência" / "Sequência Didática" / "Quadro de Distribuição"
 * Term 2: Série ({grade}, ex: "1ª Série" / "1º EM")
 * Term 3: Bimestre ({bimestre}, ex: "4º Bimestre") + Disciplina ({subject}, ex: "Química")
 */
function extractTripleKeyPdfWindow(fullText: string, subject: string, grade: string, bimestre: string): string {
  if (!fullText || typeof fullText !== 'string') return '';
  const norm = normalizeStrClean(fullText);
  const targetBimNum = parseBimNumber(bimestre);
  const normSub = normalizeStrClean(subject);
  const normGrade = normalizeStrClean(grade);

  const term1Keywords = [
    'escopo e sequencia', 'sequencia didatica', 'distribuicao semanal',
    'quadro de distribuicao', 'semana', 'aulas previstas', 'semanas letivas',
    'plano de aulas', 'organizacao semanal'
  ];

  const term2Keywords: string[] = [];
  if (normGrade.includes('1') || normGrade.includes('em') || normGrade.includes('medio')) {
    term2Keywords.push('1ª serie', '1a serie', '1 serie', '1º ano', '1o ano', '1 ano', '1º em', '1 em', 'ensino medio');
  } else if (normGrade.includes('2')) {
    term2Keywords.push('2ª serie', '2a serie', '2 serie', '2º ano', '2o ano', '2 ano');
  } else if (normGrade.includes('3')) {
    term2Keywords.push('3ª serie', '3a serie', '3 serie', '3º ano', '3o ano', '3 ano');
  } else if (normGrade.includes('9')) {
    term2Keywords.push('9º ano', '9o ano', '9 ano');
  }

  const bimKeywords = [
    `${targetBimNum}º bimestre`, `${targetBimNum}o bimestre`,
    `${targetBimNum}º bim`, `${targetBimNum}o bim`, `${targetBimNum}b`,
    `${targetBimNum} bimestre`, `${targetBimNum} bim`, 'quarto bimestre'
  ];
  const subKeywords = normSub ? [normSub, normSub.slice(0, 4)] : ['quimica', 'quim'];

  let bestScore = -1;
  let bestPos = 0;
  const windowSize = 3500;
  const step = 600;

  for (let pos = 0; pos < norm.length; pos += step) {
    const chunk = norm.slice(pos, pos + windowSize);
    let score = 0;
    if (term1Keywords.some(k => chunk.includes(k))) score += 15;
    if (term2Keywords.length === 0 || term2Keywords.some(k => chunk.includes(k))) score += 10;
    if (bimKeywords.some(k => chunk.includes(k))) score += 15;
    if (subKeywords.some(k => chunk.includes(k))) score += 15;

    if (targetBimNum === 4) {
      if (chunk.includes('1º bimestre') || chunk.includes('1o bimestre')) score -= 14;
      if (chunk.includes('2º bimestre') || chunk.includes('2o bimestre')) score -= 10;
      if (chunk.includes('3º bimestre') || chunk.includes('3o bimestre')) score -= 8;
    }

    if (score > bestScore) {
      bestScore = score;
      bestPos = pos;
    }
  }

  if (bestScore >= 20) {
    const startIdx = Math.max(0, bestPos - 300);
    return fullText.slice(startIdx, startIdx + 30000);
  }

  return fullText.slice(0, 30000);
}

/**
 * Detects the PDF page number where the target section or skill is located in text
 */
function findPdfPageForText(fullText: string, searchSnippet: string): number | undefined {
  if (!fullText || !searchSnippet) return undefined;
  const pos = fullText.indexOf(searchSnippet);
  if (pos === -1) return undefined;

  // Search backwards for the last "--- PÁGINA X ---" marker
  const textBefore = fullText.substring(0, pos);
  const matches = [...textBefore.matchAll(/---\s*(?:PÁGINA|PAGINA|PAGE)\s*(\d+)\s*---/gi)];
  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1];
    return parseInt(lastMatch[1], 10);
  }
  return undefined;
}

/**
 * Sanitizes cell text to completely eliminate placeholder bullets (• •) and enforce authentic dates
 */
function sanitizeCellFillValue(val: string, origField: any, targetBimNum: number): string {
  let text = String(val || '').trim();
  const colLet = (origField.colLetter || origField.address?.replace(/\d+/g, '') || '').toUpperCase();
  const labelLower = (origField.label || '').toLowerCase();
  const typeLower = (origField.expectedType || '').toLowerCase();

  const isDateCol = labelLower.includes('período') || labelLower.includes('semana') || labelLower.includes('data prevista') || typeLower.includes('week') || typeLower.includes('periodo') || colLet === 'B';

  // 1. Column B: Date / Week calculation validation (Strictly Monday-to-Friday)
  if (isDateCol) {
    const weekNum = origField.weekNumber || (origField.row && origField.row >= 28 ? origField.row - 27 : 1);
    return getSeducWeekPeriodText(weekNum, targetBimNum, origField.isSEI, origField.isAvaliacao);
  }

  // 2. Eliminate stray bullets and empty placeholders like "• •", "•"
  text = text.replace(/•\s*•/g, ' - ');
  text = text.replace(/\s*•\s*/g, ' - ');
  text = text.replace(/conceitos fundamentais de\s*[-•]\s*em situações/gi, 'conceitos fundamentais e aplicações práticas dos objetos de conhecimento em situações contextualizadas');
  text = text.replace(/\([A-Z0-9]+\)\s*[-•]\s*[-•]\s*Tema:\s*Habilidade prioritária/gi, (match) => {
    return `${match.split(')')[0]}) Habilidade essencial do ${targetBimNum}º Bimestre - Objeto de Conhecimento: Conteúdo curricular estruturante`;
  });

  return text.trim();
}

// API Route for Gemini processing
app.post('/api/process-plan', async (req, res) => {
  try {
    const { fields, scopeData, calendarData, planInfo, guidePdfText, prioritizedGuideSkills, slot2DocMode, calendarioIA } = req.body;

    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo fornecido para preenchimento.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    // Header identification data received from frontend
    const subject = (planInfo?.subject || '').trim() || 'Componente Curricular';
    const grade = (planInfo?.grade || '').trim() || 'Turma / Série';
    const bimestre = (planInfo?.bimestre || '').trim() || '4º Bimestre';
    const school = (planInfo?.school || '').trim();
    const teacher = (planInfo?.teacherName || '').trim();

    const normSubject = normalizeStrClean(subject);
    const targetBimNum = parseBimNumber(bimestre);
    const isMath = normSubject.includes('matem');

    // Filter scopeData dynamically by subject and bimestre
    let filteredScopeData = Array.isArray(scopeData) ? [...scopeData] : [];

    // If subject is NOT math, purge any math mock skills (EF09MA01 etc.)
    if (!isMath) {
      filteredScopeData = filteredScopeData.filter((s: any) => {
        const code = String(s.code || '').toUpperCase();
        return !code.startsWith('EF09MA') && !code.startsWith('EF08MA') && !code.startsWith('EF07MA');
      });
    }

    // Filter by subject if specified in items
    if (normSubject && filteredScopeData.length > 0) {
      const subjectMatches = filteredScopeData.filter((s: any) => {
        const itemSub = normalizeStrClean(s.subject || s.unit || '');
        return itemSub.includes(normSubject) || normSubject.includes(itemSub);
      });
      if (subjectMatches.length > 0) {
        filteredScopeData = subjectMatches;
      }
    }

    // Filter by bimestre if specified
    if (targetBimNum > 0 && filteredScopeData.length > 0) {
      const bimMatches = filteredScopeData.filter((s: any) => {
        const itemBim = parseBimNumber(s.bimestre);
        return itemBim === targetBimNum;
      });
      if (bimMatches.length > 0) {
        filteredScopeData = bimMatches;
      }
    }

    // Guide PDF specific priority text and skills
    const hasGuidePdf = Boolean(guidePdfText || (prioritizedGuideSkills && prioritizedGuideSkills.length > 0));
    const isBothSources = slot2DocMode === 'both' || (hasGuidePdf && filteredScopeData.length > 0);

    // Extract generous relevant window of up to 30,000 characters using Triple Key Search:
    // Term 1: Escopo e Sequência / Distribuição Semanal
    // Term 2: Série informada (ex: 1ª Série)
    // Term 3: Bimestre (ex: 4º Bimestre) + Disciplina (ex: Química)
    const guidePdfContext = guidePdfText && typeof guidePdfText === 'string'
      ? extractTripleKeyPdfWindow(guidePdfText, subject, grade, bimestre)
      : '';

    let guidePdfInstructionBlock = '';
    if (hasGuidePdf && isBothSources) {
      guidePdfInstructionBlock = `
========================================================================
CRITÉRIO DE CRUZA E PRIORIDADE MÁXIMA (GUIA DE HABILIDADES PRIORIZADAS PDF + ESCOPO XLSX):
- ATENÇÃO: Utilize como critério de prioridade máxima as habilidades e orientações extraídas do 'Guia de Habilidades Priorizadas (PDF)' para a Disciplina ${subject} e ${bimestre}.
- Cruze as duas matrizes fornecidas: dê ênfase primordial às habilidades prioritárias indicadas no PDF integradas à sequência temporal e à distribuição semanal do Escopo (.xlsx).
- Assegure que as habilidades com maior peso diagnóstico (Prova Paulista e SARESP) identificadas no Guia Priorizado ocupem as semanas centrais de desenvolvimento e aprofundamento.
========================================================================`;
    } else if (hasGuidePdf) {
      guidePdfInstructionBlock = `
========================================================================
CRITÉRIO DE PRIORIDADE MÁXIMA (GUIA DE HABILIDADES PRIORIZADAS PDF):
- ATENÇÃO: Utilize como critério de prioridade máxima as habilidades e orientações extraídas do 'Guia de Habilidades Priorizadas (PDF)' para a Disciplina ${subject} e ${bimestre}.
- Extraia os descritores, focos pedagógicos e objetos de conhecimento do documento priorizado.
========================================================================`;
    }

    const literalFields = fields.filter((f: any) => f.injectionMode === 'literal');
    // Bloquear terminantemente B13, B15 e B17 e Coluna B contra processamento ou adivinhação por IA
    const aiFields = fields.filter((f: any) => {
      if (f.isDisabled || f.disabledByUser) {
        return false;
      }
      const addrUpper = (f.address || '').toUpperCase().trim();
      const colLet = (f.colLetter || addrUpper.replace(/\d+/g, '') || '').toUpperCase();
      const labelLower = (f.label || '').toLowerCase();
      const typeLower = (f.expectedType || '').toLowerCase();
      const isDateCol = colLet === 'B' || labelLower.includes('período') || labelLower.includes('semana') || labelLower.includes('data prevista') || typeLower.includes('week') || typeLower.includes('periodo');

      if (['B13', 'B15', 'B17'].includes(addrUpper) || f.id?.includes('B13') || f.id?.includes('B15') || f.id?.includes('B17') || isDateCol) {
        return false;
      }
      return f.injectionMode !== 'literal';
    });

    const effectiveYear = (planInfo?.year ? parseInt(String(planInfo.year), 10) : undefined) || calendarData?.year || (calendarioIA?.ano) || 2026;

    // Conexão direta com o robô de injeção: se calendarioIA for fornecido ou se calendarData estiver ausente/incompleto,
    // consome diretamente o JSON canônico gerado por gerarCalendarioIA()
    let activeCalendar = calendarData;
    if (calendarioIA && (!activeCalendar || !activeCalendar.bimestres)) {
      activeCalendar = converterCalendarioIAToSummary(calendarioIA);
    } else if (!activeCalendar || !activeCalendar.bimestres) {
      activeCalendar = converterCalendarioIAToSummary(gerarCalendarioIA(effectiveYear));
    }

    // Strict calculation of cells J7, J8, and J9 according to official SEDUC-SP guidelines:
    // J7: Dias Letivos do Bimestre (Calendário Inteligente Oficial descontados feriados e recessos)
    // J8: Total de Aulas do Escopo Apurado (Apuração dinâmica integral do Slot 2 - Escopo e Sequência)
    // J9: Dias Letivos Efetivos com Desconto de Eventos (J7 menos Reuniões de Planejamento, Conselhos, Provas exclusivas e Feiras)
    const cellMetrics = computeSeducCellMetrics({
      bimestre,
      subject,
      grade,
      plannedClassesInput: planInfo?.plannedClasses,
      scopeSkills: filteredScopeData,
      calendarData: activeCalendar
    });

    const plannedClasses = cellMetrics.j8AulasPrevistas;
    const totalWeeks = Math.max(11, cellMetrics.j8TotalSemanas);
    const diasLetivosJ7 = cellMetrics.j7DiasLetivos;
    const diasEfetivosJ9 = cellMetrics.j9DiasEfetivos;

    const teacherSchedConfig = {
      classDays: planInfo?.classDays || planInfo?.teacherSchedule?.classDays || [4],
      classesPerDay: planInfo?.classesPerDay || planInfo?.teacherSchedule?.classesPerDay || 2,
      plannedClasses: plannedClasses,
      rowCount: totalWeeks
    };
    const teacherSchedule = generateTeacherClassSchedule({
      bimestreNum: targetBimNum,
      targetYear: effectiveYear,
      classDays: teacherSchedConfig.classDays,
      classesPerDay: teacherSchedConfig.classesPerDay,
      plannedClasses: plannedClasses,
      rowCount: totalWeeks,
      calendarData: activeCalendar
    });

    const weeklyDistributionText = teacherSchedule.map((tw: any) => {
      if (tw.status === 'suspension') {
        return `- Semana ${tw.weekNumber} (${tw.datesText}): [${tw.holidayReason || 'Dia do Professor'} - Suspensão de Aulas] -> ATENÇÃO: NÃO ministrar aula nesta data! Coluna D = "Evento Oficial / Suspensão de Aulas", Coluna E = "Sem expediente pedagógico presencial conforme calendário escolar oficial SEDUC-SP.", Coluna G = "Suspensão das atividades letivas em virtude de ${tw.holidayReason || 'Dia do Professor'}. Conteúdo didático reprogramado para o próximo encontro letivo.", Coluna I = "-".`;
      }
      if (tw.status === 'closing') {
        return `- Semana ${tw.weekNumber} (${tw.datesText}): [Conselho de Classe / Fechamento Bimestral]`;
      }
      if (tw.isSEI) {
        return `- Semana ${tw.weekNumber} (${tw.datesText}): [Semana de Estudos Intensivos - SEI / Recuperação e Aprofundamento]`;
      }
      if (tw.status === 'displaced') {
        return `- Semana ${tw.weekNumber} (${tw.datesText}): ${tw.lessonRange} (Aula transferida/reposta do feriado anterior - Ministra integralmente o conteúdo pedagógico previsto!)`;
      }
      return `- Semana ${tw.weekNumber} (${tw.datesText}): ${tw.lessonRange} (Conteúdo curricular regular)`;
    }).join('\n');

    // Build educational context for SEDUC-SP
    const prompt = `
Você é o especialista sênior em gestão pedagógica e planejamento curricular da Secretaria da Educação do Estado de São Paulo (SEDUC-SP).
Sua tarefa é cruzar os dados dos documentos pedagógicos de referência ("Escopo e Sequência" e/ou "Guia de Habilidades Priorizadas") com os dias letivos reais do "Calendário Escolar SEDUC-SP" e preencher rigorosamente as células/campos vazios do "Formulário Padrão" fornecido.

========================================================================
SISTEMÁTICA OFICIAL DAS CÉLULAS J7, J8 E J9 NO FORMULÁRIO:
1. Célula J7 (Dias Letivos do Bimestre): ${diasLetivosJ7} dias (${cellMetrics.j7FormulaExpl}).
2. Célula J8 (Total de Aulas do Escopo Apurado): ${plannedClasses} aulas (${cellMetrics.j8OriginExpl}).
3. Célula J9 (Dias Letivos Efetivos com Desconto de Eventos): ${diasEfetivosJ9} dias (${cellMetrics.j9FormulaExpl}).
========================================================================

========================================================================
ATENÇÃO MANDATÓRIA: Gere o planejamento estritamente para a Disciplina: ${subject} | Turma/Série: ${grade} | Bimestre: ${bimestre}.
Você DEVE extrair as habilidades, objetos de conhecimento e metodologias EXCLUSIVAMENTE do bloco correspondente a essa disciplina e bimestre dentro do material enviado.

INSTRUÇÃO MANDATÓRIA DE EXTRAÇÃO DO PDF (CHAVE TRIPLA OBRIGATÓRIA):
Localize dentro do Guia Priorizado a interseção estrita dos TRÊS TERMOS:
- Termo 1: 'Escopo e Sequência' (ou 'Sequência Didática Semanal' / 'Quadro de Distribuição')
- Termo 2: A Série informada (${grade}, ex: '1ª Série' / '1º EM')
- Termo 3: O Bimestre informado (${bimestre}, ex: '4º Bimestre' / '4º BIM') combinada à Disciplina (${subject}, ex: 'Química').
Apenas o conteúdo dessa tabela/seção interna específica do PDF deve ser considerado para preencher as linhas de aula (linhas 28 em diante).

PROIBIÇÃO ESTRITA: O usuário selecionou o ${bimestre} (${grade} - ${subject}).
NÃO utilize conteúdos de bimestres anteriores (ex: Modelos Atômicos, Tabela Periódica ou Ligações Químicas que pertencem ao 1º bimestre; Leis Ponderais/Estequiometria do 2º bimestre; Soluções/Cinética do 3º bimestre).
Utilize EXCLUSIVAMENTE as habilidades e objetos de conhecimento listados para o ${bimestre}.

========================================================================
CARGA HORÁRIA E PREENCHIMENTO CONTÍNUO DA GRADE SEMANAL:
TOTAL DE AULAS DO ESCOPO APURADO: ${plannedClasses} AULAS (CÉLULA J8).
DISTRIBUIÇÃO CONTÍNUA EM TODAS AS SEMANAS DA GRADE (LINHAS 28 EM DIANTE):
- O preenchimento das linhas da grade DEVE cobrir todas as aulas do documento de Escopo e Sequência:
  * Não pare de preencher na Linha 33 / Semana 6.
  * Distribua os pares de aulas (Aulas 11 e 12 na Semana 7, Aulas 13 e 14 na Semana 8, Aulas 15 e 16 na Semana 9, etc.) até esgotar o conteúdo previsto no Escopo.
  * Apenas as semanas que caírem na Semana de Estudos Intensivos (SEI / Recuperação) e no Conselho de Classe / Fechamento Bimestral (Semanas 10 e 11) recebem as atividades de nivelamento e fechamento.
- NUNCA deixe linhas vazias nem com avisos indevidos de corte curricular!

DISTRIBUIÇÃO DOS PARES GEMINADOS POR SEMANA:
${weeklyDistributionText}

INJEÇÃO NAS COLUNAS A PARTIR DA LINHA 28:
1. Coluna D (Habilidade / Aulas): DEVE conter explicitamente o prefixo do bloco de aulas no formato:
   "Aula 1 e 2 • (Código Habilidade) - Objeto de Conhecimento: [Tema integrado das 2 aulas]"
   (e assim sucessivamente até a Semana 9, Aulas 15 e 16, cobrindo exatamente as 16 aulas curriculares regulares do Escopo).
   * A Semana 10 (10/12/2026 - Linha 37) DEVE ser categorizada EXCLUSIVAMENTE como:
     "Semana de Estudos Intensivos (SEI) / Recuperação e Nivelamento • (SEI-RECUPERACAO) - Objeto de Conhecimento: Retomada e consolidação das aprendizagens prioritárias do 4º Bimestre"
     (Atenção: NÃO rotular como Aulas 17 e 18 nem conteúdo novo; foco na retomada e nivelamento).
   * A Semana 11 (17/12/2026 - Linha 38) DEVE ser categorizada EXCLUSIVAMENTE como:
     "Conselho de Classe / Fechamento de Médias e Frequências • (CONSELHO-FECHAMENTO) - Objeto de Conhecimento: Fechamento bimestral, apuração de frequência e análise colegiada de rendimento escolar"
     (Atenção: NUNCA rotular como "Aula 17 e 22" nem duplicar habilidades; as colunas de desenvolvimento devem registrar as atividades institucionais de fechamento).
2. Coluna E (Objetivos): Contemplar os objetivos pedagógicos articulados das 2 aulas daquela semana (nas semanas 10 e 11, objetivos de recuperação/fechamento).
3. Coluna F e G (Metodologia e Passo a Passo): Estruturar a dinâmica cobrindo o tempo total das 2 aulas geminadas (90 a 100 minutos no total, com transição clara entre a 1ª e a 2ª aula).
4. Semanas de SEI e Conselho: Posicionar a SEI na Semana 10 (Linha 37) e o Conselho de Classe na Semana 11 (Linha 38) respeitando o calendário oficial SEDUC-SP.
5. AUDITORIA E RASTREABILIDADE: O campo "sourceReference" DEVE indicar: "Aulas X e Y • Pág. [página] - Guia Priorizado PDF" ou "Aulas X e Y • Base Curricular Oficial SEDUC-SP" (para Semana 10: "Base Curricular Oficial SEDUC-SP • SEI"; para Semana 11: "Regulamento Escolar SEDUC-SP • Conselho de Classe").
========================================================================

DIFERENCIAÇÃO ESTRITA DE CADA COLUNA NA INJEÇÃO (PROIBIÇÃO ABSOLUTA DE CLONES OU REPETIÇÃO):
É TERMINANTEMENTE PROIBIDO repetir a mesma frase em semanas distintas ou copiar textos entre colunas:
- Coluna B: Período semanal do calendário escolar real (Outubro a Dezembro para o 4º Bimestre). Proibido datas de Fevereiro!
- Coluna D (Habilidade / Aulas): Prefixo "Aula X e Y • (Código) - Objeto de Conhecimento: [Tema integrado]".
- Coluna E (Objetivos de Aprendizagem): Objetivos articulados das 2 aulas da semana (NÃO repita o texto da Coluna D nem copie de outras semanas).
- Coluna F (Metodologia): Estratégia de ensino cobrindo as 2 aulas geminadas (90-100 min). NUNCA clone com a Coluna G!
- Coluna G (Passo a Passo / Desenvolvimento): Desenvolvimento prático detalhado com minutagem cobrindo Aula 1 (45-50 min) e Aula 2 (45-50 min) com transição clara. NUNCA clone com a Coluna F!
- Coluna H (Avaliação): Instrumento de acompanhamento formativo das 2 aulas da semana. NUNCA clone com a Coluna I!
- Coluna I (Recuperação Contínua): Intervenção pontual para defasagens das 2 aulas daquela semana. NUNCA clone com a Coluna H!

REGRAS MANDATÓRIAS DE DATAS DO CALENDÁRIO LETIVO SEDUC-SP (COLUNA B):
- O cabeçalho foi selecionado como ${bimestre} (${grade} - ${subject}).
- Para a Coluna B (Período / Semana Letiva), utilize ESTRITAMENTE datas reais alinhadas ao ${bimestre}:
  Quando for o 4º Bimestre, as semanas ocorrem ESTRITAMENTE de OUTUBRO a DEZEMBRO (05/10/2026 a 18/12/2026):
  - Semana 1: (05/10 a 09/10) - 5 dias letivos (Quinta 08/10: Aulas 1 e 2)
  - Semana 2: (12/10 a 16/10) - 3 dias letivos [12/10 N. Sra. Aparecida, 15/10 Dia do Professor - Suspensão de Aulas]
  - Semana 3: (19/10 a 23/10) - 5 dias letivos [Quinta 22/10: Aulas 3 e 4 - Reposição/Transferência de 15/10]
  - Semana 4: (26/10 a 30/10) - 5 dias letivos (Quinta 29/10: Aulas 5 e 6)
  - Semana 5: (02/11 a 06/11) - 4 dias letivos [02/11 Finados] (Quinta 05/11: Aulas 7 e 8)
  - Semana 6: (09/11 a 13/11) - 5 dias letivos (Quinta 12/11: Aulas 9 e 10)
  - Semana 7: (16/11 a 20/11) - 4 dias letivos [20/11 Consciência Negra] (Quinta 19/11: Aulas 11 e 12)
  - Semana 8: (23/11 a 27/11) - 5 dias letivos (Quinta 26/11: Aulas 13 e 14)
  - Semana 9: (30/11 a 04/12) - 5 dias letivos (Quinta 03/12: Aulas 15 e 16 - Término das 16 aulas de conteúdo regular do Escopo)
  - Semana 10: (07/12 a 11/12) - [Semana de Estudos Intensivos (SEI) / Recuperação e Nivelamento] (Atenção: NÃO rotular como Aulas 17 e 18 nem conteúdo novo; foco na retomada e nivelamento das aprendizagens prioritárias)
  - Semana 11: (14/12 a 18/12) - [Conselho de Classe / Fechamento de Médias e Frequências] (Atenção: NÃO rotular como "Aula 17 e 22" nem duplicar habilidades; foco no fechamento institucional, apuração de notas/frequências e conselho colegiado)
- É EXPRESSAMENTE PROIBIDO utilizar datas de Fevereiro, Março ou do 1º Bimestre ao processar o 4º Bimestre!

PROIBIÇÃO ABSOLUTA DE MARCADORES VAZIOS OU BULLETS SOLTOS (• •):
- NUNCA preencha qualquer célula com marcadores vazios ou bullet points soltos como "•", "• •", "-", "conceitos fundamentais de • em situações" ou "(EM13CNT105) • • Tema: Habilidade prioritária".
- Todos os campos DEVEM ser redigidos com o nome completo e detalhado do Objeto de Conhecimento e da Habilidade do 4º Bimestre da disciplina.
========================================================================
${guidePdfInstructionBlock}

REGRAS ESTRITAS DE PREENCHIMENTO POR COLUNA (A PARTIR DA LINHA 28):
- Coluna B (Período / Semana): Período semanal do calendário escolar real (Outubro a Dezembro para o 4º Bimestre).
- Coluna D (Habilidade / Aulas): "Aula X e Y • (Código) - Objeto de Conhecimento: [Tema estruturante das 2 aulas]".
- Coluna E (Objetivos): Metas cognitivas articuladas das 2 aulas da semana.
- Coluna F / G (Metodologia e Passo a Passo): Bloco de 2 aulas geminadas (90-100 min no total), com dinâmica e transição explícitas.
- Coluna H / I (Avaliação e Recuperação): Instrumentos formativos e de nivelamento das 2 aulas daquela semana.
- Coluna H / I (Avaliação e Recuperação Contínua): Instrumentos formativos e diagnósticos (rubricas, observação, diário de bordo) e práticas de recuperação contínua das defasagens.

REGRAS ESTRITAS DA SEDUC-SP:
1. DIAS LETIVOS:
   - Desconte rigorosamente feriados nacionais, feriados estaduais de SP (como 9 de Julho, 20 de Novembro), pontos facultativos e recessos escolares.
   - Não programe aulas regulares em dias de Planejamento/Replanejamento Escolar nem em dias de Conselho de Classe/Série.
   - O ano letivo segue a meta de 200 dias letivos distribuídos em 4 bimestres.

2. AVALIAÇÕES E RECUPERAÇÃO:
   - Reserve semanas específicas (geralmente as penúltimas ou últimas de cada bimestre) para Avaliações Estaduais (Prova Paulista, SARESP) e Avaliações Diagnósticas/Formativas.
   - Reserve a Semana de Estudos Intensivos (SEI / Recuperação e Aprofundamento) ao final de cada bimestre para consolidação de habilidades com defasagem da disciplina ${subject}.

3. DISTRIBUIÇÃO DAS HABILIDADES:
   - Distribua as habilidades e objetos de conhecimento de forma progressiva e coerente com as semanas letivas úteis de cada bimestre para ${subject} (${bimestre}).

DADOS RECEBIDOS:
- Disciplina Selecionada: ${subject}
- Turma / Série: ${grade}
- Bimestre Letivo: ${bimestre}
- Modo de Documento do Slot 2: ${slot2DocMode || 'Padrão'}
- Informações do Cabeçalho: ${JSON.stringify({ school, teacher, subject, grade, bimestre })}
- Resumo do Calendário SEDUC: ${JSON.stringify(calendarData || {})}
${hasGuidePdf ? `- Excerto do Guia de Habilidades Priorizadas (PDF): ${guidePdfContext || String(guidePdfText || '').slice(0, 5000)}` : ''}
${prioritizedGuideSkills && prioritizedGuideSkills.length > 0 ? `- Sequência e Habilidades Priorizadas Estruturadas do PDF: ${JSON.stringify(prioritizedGuideSkills.slice(0, 30))}` : ''}
- Grade Semanal Calculada para Distribuição em Lote Único (Batch):
${JSON.stringify(teacherSchedule.map((tw: any) => ({
  semana: tw.weekNumber,
  periodo: tw.datesText,
  status: tw.status,
  aulas: tw.lessonRange,
  isSuspension: tw.status === 'suspension',
  evento: tw.holidayReason
})))}

- Habilidades e Objetos de Conhecimento Disponíveis para ${subject} (${bimestre}):
${JSON.stringify(filteredScopeData.slice(0, 25).map((s: any) => ({
  codigo: s.code,
  objetoConhecimento: s.knowledgeObject || s.theme || s.topic,
  descricaoHabilidade: s.description || s.name
})))}

RESPOSTA OBRIGATÓRIA (ESTRUTURA EM LOTE ÚNICO / BATCH JSON):
Retorne EXCLUSIVAMENTE um objeto JSON válido (sem formatação markdown fora do JSON) estruturado por semanas:
{
  "weeks": [
    {
      "weekNumber": 1,
      "skillCode": "Código oficial da habilidade",
      "skillText": "Aula 1 e 2 • (Código) - Objeto de Conhecimento: [Nome completo do objeto]",
      "objectivesText": "Metas pedagógicas articuladas das 2 aulas da semana",
      "methodologyText": "Estratégia metodológica integrada das 2 aulas geminadas",
      "developmentText": "Aula 1 (45 min): Introdução conceitual. Transição. Aula 2 (45 min): Prática e consolidação.",
      "evaluationText": "Instrumento formativo de acompanhamento da semana",
      "recoveryText": "Intervenção contínua para defasagens identificadas",
      "sourcePage": 42,
      "sourceReference": "Aulas 1 e 2 • Pág. 42 - Guia Priorizado PDF"
    }
  ]
}
`;

    if (apiKey) {
      try {
        const geminiPromise = (async () => {
          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: {
              headers: { 'User-Agent': 'aistudio-build' }
            }
          });
          return await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
            },
          });
        })();

        // Timeout estrito de segurança de 15 segundos
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('TIMEOUT_15S')), 15000);
        });

        const response = await Promise.race([geminiPromise, timeoutPromise]);

        let rawText = response?.text || '{}';
        rawText = rawText.trim();
        if (rawText.startsWith('```')) {
          rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        }

        const parsed = JSON.parse(rawText);

        const geminiWeeksMap = new Map<number, any>();
        if (parsed.weeks && Array.isArray(parsed.weeks)) {
          parsed.weeks.forEach((w: any) => {
            if (w && typeof w.weekNumber === 'number') {
              geminiWeeksMap.set(w.weekNumber, w);
            }
          });
        }

        const geminiMap = new Map<string, any>();
        if (parsed.fills && Array.isArray(parsed.fills)) {
          parsed.fills.forEach((gf: any) => {
            if (gf && gf.id) {
              geminiMap.set(gf.id, gf);
            }
          });
        }

        if (geminiWeeksMap.size > 0 || geminiMap.size > 0) {

          const fallbackList = generateSeducPlanFills(fields, scopeData, calendarData, planInfo);
          const fallbackMap = new Map<string, any>();
          fallbackList.forEach((fb: any) => fallbackMap.set(fb.id, fb));

          // Track values seen per column category to forbid duplicate cloning across rows
          const seenByColType = new Map<string, Set<string>>();

          const sanitizedFills = fields.map((origField: any, idx: number) => {
            const addrUpper = (origField.address || '').toUpperCase().trim();

            // Priority 0.4: Células Fixas Imutáveis B13, B15 e B17 (Bloqueio estrito de IA e preenchimento literal exato)
            if (['B13', 'B15', 'B17'].includes(addrUpper) || origField.id?.includes('B13') || origField.id?.includes('B15') || origField.id?.includes('B17')) {
              const fixedKey = (['B13', 'B15', 'B17'].includes(addrUpper) ? addrUpper : (origField.id?.includes('B13') ? 'B13' : origField.id?.includes('B15') ? 'B15' : 'B17')) as FixedCellKey;
              const def = FIXED_IMMUTABLE_CELLS[fixedKey];
              return {
                id: origField.id,
                address: def.address,
                sheet: origField.sheet,
                fillValue: def.text,
                justification: `Texto Fixo Imutável (${def.address}): ${def.label}`,
                isSEI: false,
                isAvaliacao: false
              };
            }

            // Priority 0.45: Columns F and H MUST strictly remain empty / blank in weekly grid (row >= 28)
            const colLetCheck = (origField.colLetter || origField.address?.replace(/\d+/g, '') || '').toUpperCase();
            if ((origField.row >= 28 || origField.id?.startsWith('GRID_')) && (colLetCheck === 'F' || colLetCheck === 'H')) {
              return {
                id: origField.id,
                address: origField.address,
                sheet: origField.sheet,
                fillValue: '',
                justification: `Coluna ${colLetCheck} mantida estritamente vazia/em branco conforme modelo oficial`,
                isDisabled: true,
                disabledByUser: true,
                isSEI: false,
                isAvaliacao: false
              };
            }

            // Priority 0.5: Specific fixed evaluation cells C21:C24 and J21:J24
            // Garante que tanto a Coluna C (Instrumentos) quanto a Coluna J (Pesos/Porcentagens) tenham seus valores fixos injetados na íntegra
            if (['C21', 'C22', 'C23', 'C24', 'J21', 'J22', 'J23', 'J24'].includes(addrUpper)) {
              const fixedMap: Record<string, { val: string; just: string }> = {
                'C21': { val: 'Prova Paulista', just: 'Instrumento de Avaliação: Prova Paulista (C21)' },
                'J21': { val: '30%', just: 'Peso de Avaliação: 30% (J21)' },
                'C22': { val: 'Atividades em Sala e Caderno', just: 'Instrumento de Avaliação: Atividades em Sala e Caderno (C22)' },
                'J22': { val: '30%', just: 'Peso de Avaliação: 30% (J22)' },
                'C23': { val: 'Trabalhos e Práticas em Grupo', just: 'Instrumento de Avaliação: Trabalhos e Práticas em Grupo (C23)' },
                'J23': { val: '20%', just: 'Peso de Avaliação: 20% (J23)' },
                'C24': { val: 'Avaliação Formativa e SEI', just: 'Instrumento de Avaliação: Avaliação Formativa e SEI (C24)' },
                'J24': { val: '20%', just: 'Peso de Avaliação: 20% (J24)' },
              };
              const def = fixedMap[addrUpper];
              const userVal = origField.fillValue || origField.label;
              const finalVal = (userVal && userVal !== addrUpper) ? userVal : def.val;
              return {
                id: origField.id,
                address: origField.address,
                sheet: origField.sheet,
                fillValue: String(finalVal).trim() || def.val,
                justification: def.just,
                isSEI: addrUpper === 'C24',
                isAvaliacao: true
              };
            }

            // Priority 0.6: Células J7, J8 e J9 (Sistemática Oficial SEDUC)
            if (['J7', 'J8', 'J9'].includes(addrUpper)) {
              if (addrUpper === 'J7') {
                return { id: origField.id, address: origField.address, sheet: origField.sheet, fillValue: String(cellMetrics.j7DiasLetivos), justification: 'Dias Letivos do Bimestre (Célula J7 - Calendário SEDUC)' };
              }
              if (addrUpper === 'J8') {
                return { id: origField.id, address: origField.address, sheet: origField.sheet, fillValue: String(cellMetrics.j8AulasPrevistas), justification: 'Total de Aulas do Escopo Apurado (Célula J8 - Escopo e Sequência)' };
              }
              if (addrUpper === 'J9') {
                return { id: origField.id, address: origField.address, sheet: origField.sheet, fillValue: String(cellMetrics.j9DiasEfetivos), justification: 'Dias Letivos Efetivos com Desconto de Eventos (Célula J9 - SEDUC)' };
              }
            }

            // Priority 0.8: Coluna B (Data prevista / Período Semanal - Grade do Professor SEDUC-SP)
            const labelLower = (origField.label || '').toLowerCase();
            const typeLower = (origField.expectedType || '').toLowerCase();
            const colLetUpper = (origField.colLetter || origField.address?.replace(/\d+/g, '') || '').toUpperCase();
            const isDateCol = colLetUpper === 'B' || labelLower.includes('período') || labelLower.includes('semana') || labelLower.includes('data prevista') || typeLower.includes('week') || typeLower.includes('periodo');

            const teacherSchedConfig = {
              classDays: planInfo?.classDays || planInfo?.teacherSchedule?.classDays,
              classesPerDay: planInfo?.classesPerDay || planInfo?.teacherSchedule?.classesPerDay,
              plannedClasses: plannedClasses,
              rowCount: totalWeeks
            };

            if (isDateCol) {
              const weekNum = origField.weekNumber || (origField.row && origField.row >= 28 ? origField.row - 27 : (origField.row && origField.row >= 16 ? origField.row - 15 : 1));
              const isSEIWeek = (weekNum === 10);
              const isClosingWeek = (weekNum === 11 || weekNum === totalWeeks);
              const isEvalWeek = isClosingWeek;
              const effectiveYear = (planInfo?.year ? parseInt(String(planInfo.year), 10) : undefined) || calendarData?.year || 2026;
              const weekAlloc = getTeacherAllocatedWeekInfo(weekNum, targetBimNum, totalWeeks, calendarData, effectiveYear, teacherSchedConfig);
              const computedDate = weekAlloc?.fullDateText || getSeducWeekPeriodText(weekNum, targetBimNum, isSEIWeek, isEvalWeek, totalWeeks, calendarData, effectiveYear, teacherSchedConfig);
              return {
                id: origField.id,
                address: origField.address,
                sheet: origField.sheet,
                fillValue: computedDate,
                justification: `Semana ${weekNum} calculada com base na grade horária do professor e calendário oficial SEDUC-SP (${targetBimNum}º Bimestre)`,
                isSEI: weekAlloc?.isSEI !== undefined ? weekAlloc.isSEI : isSEIWeek,
                isAvaliacao: weekAlloc?.isAvaliacao !== undefined ? weekAlloc.isAvaliacao : isEvalWeek,
                isTransferred: weekAlloc?.isTransferred || false,
                holidayReason: weekAlloc?.holidayReason
              };
            }

            // Priority 1: Direct literal / fixed mode mappings (e.g. 30%, Prova Paulista)
            if (origField.injectionMode === 'literal') {
              const literalVal = String(origField.fillValue || origField.label || origField.currentValue || '').trim();
              return {
                id: origField.id,
                address: origField.address,
                sheet: origField.sheet,
                fillValue: literalVal,
                justification: 'Texto literal / fixo configurado pelo usuário',
                isSEI: false,
                isAvaliacao: false
              };
            }

            // Priority 2: Direct manual identification header inputs from planInfo
            if (origField.id?.startsWith('HDR_') || origField.expectedType === 'identificacao') {
              if (origField.id.includes('schoolCell') && planInfo.school) {
                return { id: origField.id, address: origField.address, sheet: origField.sheet, fillValue: planInfo.school, justification: 'Unidade escolar informada no cabeçalho' };
              }
              if (origField.id.includes('teacherCell') && planInfo.teacherName) {
                return { id: origField.id, address: origField.address, sheet: origField.sheet, fillValue: planInfo.teacherName, justification: 'Docente informado no cabeçalho' };
              }
              if (origField.id.includes('subjectCell') && planInfo.subject) {
                return { id: origField.id, address: origField.address, sheet: origField.sheet, fillValue: planInfo.subject, justification: 'Disciplina informada no cabeçalho' };
              }
              if (origField.id.includes('gradeCell') && planInfo.grade) {
                return { id: origField.id, address: origField.address, sheet: origField.sheet, fillValue: planInfo.grade, justification: 'Turma informada no cabeçalho' };
              }
              if (origField.id.includes('bimestreCell') && planInfo.bimestre) {
                return { id: origField.id, address: origField.address, sheet: origField.sheet, fillValue: planInfo.bimestre, justification: 'Bimestre informado no cabeçalho' };
              }
              const addrUpper = (origField.address || '').toUpperCase().trim();
              if (origField.id.includes('diasLetivosCell') || addrUpper === 'J7') {
                return { id: origField.id, address: origField.address, sheet: origField.sheet, fillValue: String(cellMetrics.j7DiasLetivos), justification: 'Dias Letivos do Bimestre (Célula J7 - Calendário SEDUC)' };
              }
              if (origField.id.includes('plannedClassesCell') || addrUpper === 'J8') {
                return { id: origField.id, address: origField.address, sheet: origField.sheet, fillValue: String(cellMetrics.j8AulasPrevistas), justification: 'Total de Aulas do Escopo Apurado (Célula J8 - Escopo e Sequência)' };
              }
              if (origField.id.includes('diasEfetivosCell') || addrUpper === 'J9') {
                return { id: origField.id, address: origField.address, sheet: origField.sheet, fillValue: String(cellMetrics.j9DiasEfetivos), justification: 'Dias Letivos Efetivos com Desconto de Eventos (Célula J9 - SEDUC)' };
              }
            }

            const targetWeek = origField.weekNumber || (origField.row && origField.row >= 28 ? origField.row - 27 : (origField.row && origField.row >= 16 ? origField.row - 15 : 1));

            const colLet = colLetUpper;

            const effectiveYear = (planInfo?.year ? parseInt(String(planInfo.year), 10) : undefined) || calendarData?.year || 2026;
            const rowAlloc = getTeacherAllocatedWeekInfo(targetWeek, targetBimNum, totalWeeks, calendarData, effectiveYear, teacherSchedConfig);

            const isSuspensionWeek = (targetWeek === 2) || (rowAlloc?.status === 'suspension');
            const eventName = rowAlloc?.holidayReason || 'Dia do Professor';

            if (isSuspensionWeek) {
              let suspVal = '-';
              if (colLet === 'B' || isDateCol) {
                suspVal = rowAlloc?.fullDateText || `Semana ${targetWeek} (${rowAlloc?.datesText || '15/10/2026'}) - ${eventName} [Suspensão de Aulas]`;
              } else if (colLet === 'D') {
                suspVal = 'Evento Oficial / Suspensão de Aulas';
              } else if (colLet === 'E') {
                suspVal = 'Sem expediente pedagógico presencial conforme calendário escolar oficial SEDUC-SP.';
              } else if (colLet === 'G') {
                suspVal = `Suspensão das atividades letivas em virtude de ${eventName}. Conteúdo didático reprogramado para o próximo encontro letivo.`;
              } else if (colLet === 'I') {
                suspVal = '-';
              } else {
                suspVal = '-';
              }

              return {
                id: origField.id,
                address: origField.address,
                sheet: origField.sheet,
                fillValue: suspVal,
                justification: `Evento Oficial / Suspensão de Aulas (${eventName}) - Conteúdo didático reprogramado para o próximo encontro letivo`,
                isSEI: false,
                isAvaliacao: false,
                isTransferred: true,
                holidayReason: eventName,
                lessonRange: 'Suspensão de Aulas'
              };
            }

            const isSEIWeek = (targetWeek === 10) || (origField.row === 37) || (rowAlloc?.isSEI === true);
            const isClosingWeek = (targetWeek === 11) || (origField.row === 38) || (rowAlloc?.isClosing === true);

            let startLesson = 0;
            let endLesson = 0;
            let lessonRange = '';
            let lessonRangePlural = '';

            if (isSuspensionWeek) {
              lessonRange = 'Suspensão de Aulas';
              lessonRangePlural = 'Suspensão de Aulas';
            } else if (isSEIWeek) {
              lessonRange = 'Semana de Estudos Intensivos (SEI) / Recuperação e Nivelamento';
              lessonRangePlural = 'SEI / Recuperação e Nivelamento';
            } else if (isClosingWeek) {
              lessonRange = 'Conselho de Classe / Fechamento de Médias e Frequências';
              lessonRangePlural = 'Conselho de Classe / Fechamento';
            } else {
              startLesson = (rowAlloc?.lessonStart && rowAlloc.lessonStart > 0) ? rowAlloc.lessonStart : (targetWeek === 1 ? 1 : ((targetWeek - 1) * 2 - 1));
              endLesson = (rowAlloc?.lessonEnd && rowAlloc.lessonEnd > 0) ? rowAlloc.lessonEnd : (targetWeek === 1 ? 2 : ((targetWeek - 1) * 2));
              if (startLesson > 16) startLesson = 15;
              if (endLesson > 16) endLesson = 16;
              lessonRange = `Aula ${startLesson} e ${endLesson}`;
              lessonRangePlural = `Aulas ${startLesson} e ${endLesson}`;
            }

            const isEvalWeek = isClosingWeek;
            const fallbackItem = fallbackMap.get(origField.id);

            const weekObj = geminiWeeksMap.get(targetWeek);
            let geminiFill = geminiMap.get(origField.id);

            if (isSEIWeek) {
              let seiVal = '';
              if (colLet === 'D') seiVal = 'Semana de Estudos Intensivos (SEI) / Recuperação e Nivelamento • (SEI-RECUPERACAO) - Objeto de Conhecimento: Retomada e consolidação das habilidades essenciais com defasagem do 4º Bimestre';
              else if (colLet === 'E') seiVal = 'Retomar, nivelar e consolidar as habilidades essenciais do 4º Bimestre que apresentaram maior índice de defasagem nas avaliações formativas e Prova Paulista.';
              else if (colLet === 'F') seiVal = 'Estratégia para bloco de recuperação intensiva (90-100 min): Rotação por estações de aprendizagem com agrupamentos produtivos e monitoria entre pares, apoiada no Material Digital SEDUC-SP.';
              else if (colLet === 'G') seiVal = 'Bloco 1 (45-50 min): 1. Acolhida e devolutiva pedagógica das defasagens diagnósticas (15 min). 2. Oficinas práticas em duplas produtivas por descritores críticos (30 min). 3. Síntese intermediária (5 min). | Transição e Bloco 2 (45-50 min): 4. Desafios de nivelamento e aplicação contextualizada (30 min). 5. Autoavaliação e registro no diário de bordo (15 min) (Tempo Total: 90-100 min).';
              else if (colLet === 'H') seiVal = 'Avaliação processual formativa com rubricas de nivelamento e registro de superação de defasagens na Secretaria Escolar Digital (SED).';
              else if (colLet === 'I') seiVal = 'Atendimento individualizado para estudantes com defasagens conceituais remanescentes e roteiro personalizado de estudos.';
              geminiFill = {
                id: origField.id,
                address: origField.address,
                fillValue: seiVal,
                justification: `Semana 10: Atividades exclusivas de nivelamento e recuperação contínua (SEI) da disciplina ${subject}`,
                isSEI: true,
                isAvaliacao: false
              };
            } else if (isClosingWeek) {
              let closeVal = '';
              if (colLet === 'D') closeVal = 'Conselho de Classe / Fechamento de Médias e Frequências • (CONSELHO-FECHAMENTO) - Objeto de Conhecimento: Fechamento bimestral, apuração de frequência e análise colegiada de rendimento escolar';
              else if (colLet === 'E') closeVal = 'Consolidar os registros de aproveitamento escolar, realizar o fechamento de médias e frequências e participar colegiadamente das deliberações do Conselho de Classe final.';
              else if (colLet === 'F') closeVal = 'Reunião pedagógica e institucional de Conselho de Classe, análise colegiada de dados de desempenho escolar na plataforma SED e alinhamento pedagógico.';
              else if (colLet === 'G') closeVal = 'Etapa 1 (45-50 min): 1. Apuração final e conferência de frequências e notas no Diário Digital / SED (30 min). 2. Lançamento e consolidação das médias finais e menções do 4º Bimestre (20 min). | Transição e Etapa 2 (45-50 min): 3. Participação no Conselho de Classe e deliberações colegiadas de progressão (35 min). 4. Registro em ata institucional e encerramento do ano letivo (15 min) (Tempo Total: 90-100 min).';
              else if (colLet === 'H') closeVal = 'Validação das médias bimestrais finais, análise da taxa de frequência e deliberação institucional em ata de Conselho de Classe.';
              else if (colLet === 'I') closeVal = 'Registro dos encaminhamentos e pareceres pedagógicos finais para o ciclo seguinte na Secretaria Escolar Digital (SED).';
              geminiFill = {
                id: origField.id,
                address: origField.address,
                fillValue: closeVal,
                justification: `Semana 11: Fechamento institucional de notas, frequências e Conselho de Classe`,
                isSEI: false,
                isAvaliacao: true
              };
            } else if (!geminiFill && weekObj) {
              let fillVal: string | undefined = undefined;
              if (colLet === 'D') {
                fillVal = weekObj.skillText || (weekObj.skillCode ? `${lessonRange} • (${weekObj.skillCode}) - Objeto de Conhecimento: ${weekObj.knowledgeObject || weekObj.skillDescription || ''}` : undefined);
              } else if (colLet === 'E') {
                fillVal = weekObj.objectivesText;
              } else if (colLet === 'F') {
                fillVal = weekObj.methodologyText || weekObj.developmentText;
              } else if (colLet === 'G') {
                fillVal = weekObj.developmentText;
              } else if (colLet === 'H') {
                fillVal = weekObj.evaluationText;
              } else if (colLet === 'I') {
                fillVal = weekObj.recoveryText;
              }

              if (fillVal) {
                geminiFill = {
                  id: origField.id,
                  address: origField.address,
                  fillValue: fillVal,
                  justification: `Cruzamento em lote da Semana ${targetWeek} (${lessonRange}) alinhado ao Currículo Paulista SEDUC-SP`,
                  sourcePage: weekObj.sourcePage,
                  sourceReference: weekObj.sourceReference,
                  isSEI: isSEIWeek,
                  isAvaliacao: isEvalWeek
                };
              }
            }

            if (geminiFill && geminiFill.fillValue) {
              let cleanedValue = sanitizeCellFillValue(geminiFill.fillValue, origField, targetBimNum);

              // Enforce Coluna D format: "Aula X e Y • (Código) - Objeto de Conhecimento: ..."
              if (colLet === 'D' && !origField.id?.startsWith('HDR_') && (origField.row >= 28 || origField.id?.startsWith('GRID_'))) {
                if (isSuspensionWeek) {
                  cleanedValue = 'Evento Oficial / Suspensão de Aulas';
                } else if (isSEIWeek) {
                  cleanedValue = 'Semana de Estudos Intensivos (SEI) / Recuperação e Nivelamento • (SEI-RECUPERACAO) - Objeto de Conhecimento: Retomada e consolidação das habilidades essenciais com defasagem do 4º Bimestre';
                } else if (isClosingWeek) {
                  cleanedValue = 'Conselho de Classe / Fechamento de Médias e Frequências • (CONSELHO-FECHAMENTO) - Objeto de Conhecimento: Fechamento bimestral, apuração de frequência e análise colegiada de rendimento escolar';
                } else if (!cleanedValue.toLowerCase().startsWith('aula')) {
                  cleanedValue = `${lessonRange} • ${cleanedValue}`;
                }
              }

              // Detect and prevent repetition/cloning for columns D, E, F, G, H, I
              if (['D', 'E', 'F', 'G', 'H', 'I'].includes(colLet)) {
                if (!seenByColType.has(colLet)) seenByColType.set(colLet, new Set());
                const seenSet = seenByColType.get(colLet)!;
                const normVal = cleanedValue.toLowerCase().trim();

                // If this column already saw this exact text or if it has placeholders, use the distinct week fallback
                if ((seenSet.has(normVal) || normVal.length < 10) && fallbackItem) {
                  cleanedValue = fallbackItem.fillValue;
                } else {
                  seenSet.add(normVal);
                }
              }

              const sourcePage = geminiFill.sourcePage || fallbackItem?.sourcePage;
              let sourceReference = '';
              if (isSEIWeek) {
                sourceReference = 'Base Curricular Oficial SEDUC-SP • SEI';
              } else if (isClosingWeek) {
                sourceReference = 'Regulamento Escolar SEDUC-SP • Conselho de Classe';
              } else if (isSuspensionWeek) {
                sourceReference = 'Calendário Escolar Oficial SEDUC-SP';
              } else {
                sourceReference = geminiFill.sourceReference && geminiFill.sourceReference.toLowerCase().includes('aula')
                  ? geminiFill.sourceReference
                  : (sourcePage ? `${lessonRangePlural} • Pág. ${sourcePage} - Guia Priorizado PDF` : `${lessonRangePlural} • Base Curricular Oficial SEDUC-SP`);
              }

              return {
                id: origField.id,
                address: origField.address,
                sheet: origField.sheet,
                fillValue: cleanedValue,
                justification: String(geminiFill.justification || 'Planejamento alinhado ao Currículo Paulista SEDUC-SP').trim(),
                isSEI: isSEIWeek || geminiFill.isSEI || false,
                isAvaliacao: isEvalWeek || geminiFill.isAvaliacao || false,
                isTransferred: rowAlloc?.isTransferred || geminiFill.isTransferred || false,
                holidayReason: rowAlloc?.holidayReason,
                lessonRange,
                sourcePage,
                sourceReference
              };
            }
            // Fallback for this field if Gemini omitted it
            return fallbackItem || generateSeducPlanFills([origField], scopeData, calendarData, planInfo, guidePdfText, plannedClasses)[0];
          });

          return res.json({ success: true, fills: sanitizedFills });
        }
      } catch (geminiError: any) {
        console.log('Gemini API indisponível (cota excedida ou offline). Acionando motor inteligente pedagógico SEDUC-SP.');
      }
    }

    // High fidelity fallback pedagogical engine for SEDUC-SP
    const fallbackFills = generateSeducPlanFills(fields, scopeData, calendarData, planInfo, guidePdfText, plannedClasses);
    return res.json({ success: true, fills: fallbackFills, engine: 'seduc-engine-v1' });

  } catch (error: any) {
    console.log('Erro na rota /api/process-plan:', error?.message || error);
    res.status(500).json({ error: error.message || 'Falha ao processar planejamento com Gemini' });
  }
});

// Deterministic Brazilian Educational Scheduler Fallback for SEDUC-SP
function generateSeducPlanFills(
  fields: any[],
  scopeData: any[] = [],
  calendarData: any = {},
  planInfo: any = {},
  guidePdfText?: string,
  plannedClassesCount: number = 14
) {
  const normSubject = normalizeStrClean(planInfo.subject || '');
  const isMath = normSubject.includes('matem');

  const targetBimNum = parseBimNumber(planInfo.bimestre || 4);

  const cellMetrics = computeSeducCellMetrics({
    bimestre: planInfo?.bimestre,
    subject: planInfo?.subject,
    grade: planInfo?.grade,
    plannedClassesInput: planInfo?.plannedClasses || plannedClassesCount,
    scopeSkills: scopeData,
    calendarData
  });

  const plannedClasses = cellMetrics.j8AulasPrevistas;
  const totalWeeks = Math.max(11, cellMetrics.j8TotalSemanas);
  const diasLetivosJ7 = cellMetrics.j7DiasLetivos;
  const diasEfetivosJ9 = cellMetrics.j9DiasEfetivos;

  let defaultSkills: any[];
  if (normSubject.includes('financ')) {
    const finByBim: Record<number, Array<{ code: string; desc: string; obj: string }>> = {
      1: [
        { code: 'EM13MAT311', desc: 'Identificar e analisar a relação entre receitas, despesas e a elaboração do orçamento pessoal e familiar.', obj: 'Orçamento pessoal e familiar: controle financeiro e planilha de fluxo de caixa' },
        { code: 'EM13MAT312', desc: 'Avaliar situações de consumo consciente, diferenciando necessidades básicas de impulsos de consumo.', obj: 'Consumo consciente, sustentabilidade e publicidade financeira' },
      ],
      2: [
        { code: 'EM13MAT313', desc: 'Compreender o impacto da inflação no poder de compra e o funcionamento dos juros simples e compostos.', obj: 'Juros simples e compostos aplicados a compras parceladas e empréstimos' },
        { code: 'EM13MAT314', desc: 'Analisar diferentes modalidades de investimento de renda fixa e a importância da reserva de emergência.', obj: 'Reserva de emergência e modalidades de investimento (Tesouro Direto, CDB, Poupança)' },
      ],
      3: [
        { code: 'EM13MAT315', desc: 'Reconhecer os riscos do superendividamento e explorar estratégias para renegociação de dívidas.', obj: 'Prevenção ao superendividamento e planejamento financeiro de longo prazo' },
        { code: 'EM13MAT316', desc: 'Utilizar ferramentas digitais seguras e meios de pagamento contemporâneos (Pix, cartões e open banking).', obj: 'Segurança financeira digital e meios eletrônicos de pagamento' },
      ],
      4: [
        { code: 'EM13MAT317', desc: 'Elaborar um plano de metas financeiras (curto, médio e longo prazo) com projeções orçamentárias e previdência.', obj: 'Projeto de vida financeiro, planejamento de metas e decisões de consumo responsável' },
        { code: 'EM13MAT317', desc: 'Construir planilhas orçamentárias pessoais e familiares, identificando fluxo de caixa e fontes de economia.', obj: 'Orçamento pessoal e familiar: gestão de receitas, despesas fixas e variáveis' },
        { code: 'EM13MAT318', desc: 'Compreender o impacto da inflação no poder de compra ao longo do tempo e o cálculo de juros.', obj: 'Inflação, perda de poder aquisitivo e valor do dinheiro no tempo' },
        { code: 'EM13MAT318', desc: 'Analisar a cidadania fiscal, a estrutura tributária brasileira e o papel dos impostos diretos e indiretos.', obj: 'Cidadania fiscal, tributação sobre renda e consumo no Brasil' },
        { code: 'EM13MAT318', desc: 'Comparar modalidades de investimentos de renda fixa e a necessidade da constituição de reserva de emergência.', obj: 'Renda fixa (Tesouro Direto, CDB, LCI/LCA) e reserva de emergência' },
        { code: 'EM13MAT319', desc: 'Reconhecer o funcionamento do mercado de capitais, ações e fundos imobiliários com gestão de risco.', obj: 'Investimentos em renda variável, fundos imobiliários e diversificação patrimonial' },
        { code: 'EM13MAT319', desc: 'Desenvolver plano de negócios sustentável e estratégias de empreendedorismo jovem.', obj: 'Empreendedorismo jovem: proposta de valor, custos e sustentabilidade financeira' },
        { code: 'EM13MAT319', desc: 'Concluir projeto de sustentabilidade financeira pessoal e comunitária, integrando tomada de decisão ética.', obj: 'Projeto financeiro sustentável comunitário e encerramento do conteúdo curricular' },
        { code: 'SEI-RECUPERACAO', desc: 'Semana de Estudos Intensivos (SEI): Retomada, recuperação contínua e nivelamento das aprendizagens prioritárias de Educação Financeira.', obj: 'Recuperação Contínua (SEI): superação de defasagens em planejamento financeiro e tomada de decisão econômica' },
        { code: 'CONSELHO-FECHAMENTO', desc: 'Conselho de Classe e Série / Fechamento Bimestral: Consolidação final de médias, apuração de frequência e análise colegiada de rendimento escolar.', obj: 'Fechamento Bimestral e Conselho de Classe: análise de rendimento escolar e registros no SEDUC-SED' }
      ]
    };
    defaultSkills = finByBim[targetBimNum] || finByBim[4];
  } else if (normSubject.includes('quim') || normSubject.includes('quím')) {
    // Química do Ensino Médio SEDUC-SP - Rigorosamente estruturada por Semana e Bimestre:
    const quimByBim: Record<number, Array<{
      code: string;
      desc: string;
      obj: string;
      learningObjectives?: string;
      methodology?: string;
      stepByStep?: string;
      assessment?: string;
      recovery?: string;
    }>> = {
      1: [
        { code: 'EM13CNT101', desc: 'Analisar e representar transformações químicas e fenômenos cotidianos com base nos modelos atômicos clássicos e modernos.', obj: 'Modelos atômicos (Dalton, Thomson, Rutherford, Bohr) e distribuição eletrônica' },
        { code: 'EM13CNT102', desc: 'Explicar a formação de substâncias a partir das ligações químicas (iônica, covalente e metálica) e suas propriedades.', obj: 'Tabela Periódica, propriedades periódicas e ligações químicas interatômicas' },
        { code: 'EM13CNT103', desc: 'Investigar as forças intermoleculares e relacioná-las com pontos de fusão, ebulição e solubilidade.', obj: 'Geometria molecular, polaridade e interações intermoleculares' },
      ],
      2: [
        { code: 'EM13CNT201', desc: 'Aplicar leis ponderais de Lavoisier e Proust no balanceamento de equações químicas e relações molares.', obj: 'Leis ponderais e estequiometria: cálculo de massa, mol e volume molar' },
        { code: 'EM13CNT202', desc: 'Calcular rendimento e pureza de reações químicas em processos industriais e laboratoriais.', obj: 'Reações químicas com reagente limitante, pureza e rendimento reacional' },
        { code: 'EM13CNT203', desc: 'Classificar as reações inorgânicas fundamentais (síntese, decomposição, simples e dupla troca).', obj: 'Funções inorgânicas (ácidos, bases, sais e óxidos) e suas reações' },
      ],
      3: [
        { code: 'EM13CNT204', desc: 'Investigar soluções aquosas calculando concentração comum, título e concentração molar.', obj: 'Soluções químicas: solubilidade, curvas de saturação e concentração molar' },
        { code: 'EM13CNT301', desc: 'Avaliar a cinética das reações químicas identificando fatores que alteram a velocidade (temperatura, concentração, superfície de contato, catalisador).', obj: 'Cinética química: velocidade média, energia de ativação e catalisadores' },
        { code: 'EM13CNT302', desc: 'Interpretar a lei de velocidade para reações elementares e não elementares e gráficos cinéticos.', obj: 'Mecanismos de reação e fatores determinantes da rapidez das transformações' },
      ],
      4: [
        // Semana 1: Equilíbrio Químico Dinâmico
        {
          code: 'EM13CNT303',
          desc: 'Analisar e caracterizar o estado de equilíbrio químico dinâmico em transformações reversíveis a partir de aspectos macroscópicos e microscópicos.',
          obj: 'Equilíbrio químico dinâmico: reversibilidade e igualdade das velocidades direta e inversa',
          learningObjectives: 'Reconhecer que no equilíbrio químico as concentrações de reagentes e produtos permanecem constantes e as velocidades direta e inversa se igualam.',
          methodology: 'Ensino por Investigação com experimento demonstrativo da garrafa de refrigerante sob pressão e análise de gráficos de concentração versus tempo.',
          stepByStep: '1. Acolhida e pergunta disparadora: "Todas as reações químicas chegam ao fim?" (10 min). 2. Demonstração prática do desprendimento e dissolução de CO2 (15 min). 3. Interpretação em duplas dos gráficos de velocidade e concentração (15 min). 4. Fechamento e registro no diário de bordo (10 min).',
          assessment: 'Rubrica formativa de interpretação de gráficos cinéticos e resolução orientada de duas situações-problema conceituais.',
          recovery: 'Atendimento individualizado com analogia mecânica da escada rolante para superar a confusão entre igualdade de velocidades e igualdade de concentrações.'
        },
        // Semana 2: Constante de Equilíbrio Kc e Kp
        {
          code: 'EM13CNT303',
          desc: 'Deduzir e aplicar a lei de ação das massas no cálculo das constantes de equilíbrio em função de concentrações (Kc) e pressões parciais (Kp).',
          obj: 'Constante de equilíbrio Kc e Kp: dedução matemática, rendimento e tabela I.R.E.',
          learningObjectives: 'Calcular o valor numérico de Kc e Kp a partir de dados experimentais em sistemas homogêneos e heterogêneos, interpretando a extensão do rendimento reacional.',
          methodology: 'Aprendizagem Baseada em Resolução de Problemas (ABP) com apoio do Material Digital SEDUC e estruturação de tabelas I.R.E. (Início, Reagiu, Equilíbrio).',
          stepByStep: '1. Retomada breve com quiz diagnóstico (5 min). 2. Dedução coletiva da expressão de Kc no quadro (15 min). 3. Resolução guiada da tabela I.R.E. para a síntese da amônia (20 min). 4. Sistematização das regras de exclusão de sólidos e líquidos puros (10 min).',
          assessment: 'Análise das produções escritas na montagem da tabela I.R.E. e precisão do cálculo algébrico da constante Kc.',
          recovery: 'Material de apoio visual com roteiro de cálculo passo a passo para estudantes com defasagens em álgebra e notação científica.'
        },
        // Semana 3: Princípio de Le Chatelier
        {
          code: 'EM13CNT303',
          desc: 'Prever e justificar o sentido de deslocamento do equilíbrio químico frente a perturbações de concentração e pressão total no sistema.',
          obj: 'Princípio de Le Chatelier: perturbações por concentração e pressão em sistemas gasosos',
          learningObjectives: 'Aplicar o Princípio de Le Chatelier para prever como um sistema em equilíbrio responde à adição ou remoção de componentes e à variação de volume/pressão.',
          methodology: 'Simulação computacional interativa PhET ("Reversible Reactions") em grupos de trabalho colaborativo mediado por roteiro de exploração.',
          stepByStep: '1. Contextualização: o processo industrial Haber-Bosch e a produção mundial de alimentos (10 min). 2. Rotação em bancadas virtuais alterando volume e quantidade de matéria (20 min). 3. Debate orientador sobre as respostas do sistema (15 min). 4. Conclusão coletiva no caderno (5 min).',
          assessment: 'Relatório de simulação investigativa preenchido em duplas e autoavaliação guiada de compreensão dos efeitos de pressão.',
          recovery: 'Intervenção com duplas produtivas para reforço da regra: o aumento da pressão sempre desloca o equilíbrio para o lado de menor volume gasoso.'
        },
        // Semana 4: Influência da Temperatura e Catalisadores
        {
          code: 'EM13CNT303',
          desc: 'Avaliar a influência da temperatura em equilíbrios endotérmicos e exotérmicos e o papel cinético de catalisadores.',
          obj: 'Influência da temperatura (ΔH) no valor de Kc e papel cinético dos catalisadores',
          learningObjectives: 'Compreender que a temperatura é o único fator que altera o valor numérico da constante de equilíbrio e que o catalisador apenas reduz o tempo reacional sem alterar o rendimento.',
          methodology: 'Demonstração investigativa de equilíbrio térmico entre dióxido de nitrogênio (NO2 castanho) e dinitróxido de nitrogênio (N2O4 incolor) em banhos térmicos.',
          stepByStep: '1. Pergunta disparadora: "O catalisador aumenta a quantidade final de produto obtido?" (10 min). 2. Demonstração de equilíbrio térmico em seringas graduadas (15 min). 3. Análise dos gráficos endotérmico versus exotérmico (15 min). 4. Síntese conceitual fundamentada (10 min).',
          assessment: 'Ficha de verificação rápida (Exit Ticket) com questões conceituais sobre a não alteração do Kc por catalisadores.',
          recovery: 'Revisão do conceito de entalpia (ΔH positivo/negativo) com esquemas comparativos ilustrados no Material Digital SEDUC.'
        },
        // Semana 5: Equilíbrio Iônico da Água, pH e pOH
        {
          code: 'EM13CNT304',
          desc: 'Compreender o equilíbrio iônico da água e a relação entre as concentrações hidrogeniônica [H+] e hidroxiliônica [OH-] com a escala de pH e pOH.',
          obj: 'Autoionização da água, produto iônico Kw, escala logarítmica de pH e pOH',
          learningObjectives: 'Calcular o pH e o pOH de soluções aquosas a 25°C e relacionar os valores numéricos com o caráter ácido, básico ou neutro de soluções do cotidiano.',
          methodology: 'Prática laboratorial com extrato vegetal de repolho roxo, fitas universais de pH e produtos cotidianos (vinagre, café, sabonete, leite de magnésia).',
          stepByStep: '1. Acolhida e teste prático com cores de indicadores em tubos de ensaio (15 min). 2. Introdução à escala de 0 a 14 e à fórmula matemática pH = -log[H+] (15 min). 3. Resolução guiada de cálculos de pH neutro, ácido e alcalino (15 min). 4. Fechamento e sistematização (5 min).',
          assessment: 'Tabela de classificação das soluções cotidianas conforme valores de pH e mapa conceitual de acidez/basicidade.',
          recovery: 'Exercícios graduados de revisão de logaritmos na base 10 e potências de base 10 aplicadas a concentrações molares.'
        },
        // Semana 6: Hidrólise Salina, Soluções Tampão e Chuva Ácida
        {
          code: 'EM13CNT304',
          desc: 'Investigar o fenômeno da hidrólise salina, a ação reguladora de soluções tampão em sistemas biológicos e os impactos ambientais da chuva ácida.',
          obj: 'Hidrólise salina, soluções tampão no sangue e ecologia da chuva ácida',
          learningObjectives: 'Identificar o caráter ácido ou básico de soluções salinas e explicar a importância do sistema tampão carbonato/bicarbonato no equilíbrio homeostático e na preservação de solos e oceanos.',
          methodology: 'Estudo de Caso e Aprendizagem Cooperativa (Jigsaw) sobre a acidificação de corpos d\'água e a fisiologia da respiração e tampão sanguíneo.',
          stepByStep: '1. Exibição de caso real sobre os efeitos da chuva ácida em florestas e construções (10 min). 2. Trabalho em grupos especialistas (sangue, solo, oceanos) (20 min). 3. Compartilhamento das análises químicas (15 min). 4. Registro das reações de hidrólise no caderno (5 min).',
          assessment: 'Rubrica de argumentação científica sobre a ação tamponante contra variações bruscas de pH.',
          recovery: 'Atendimento individualizado para reforço na identificação da força de ácidos e bases formadores do sal.'
        },
        // Semana 7: Introdução à Química Orgânica e Cadeias Carbônicas
        {
          code: 'EM13CNT305',
          desc: 'Reconhecer as propriedades singulares do átomo de carbono (postulados de Kekulé, tetravalência e hibridização) e classificar cadeias carbônicas.',
          obj: 'Introdução à Química Orgânica: tetravalência do carbono e classificação de cadeias carbônicas',
          learningObjectives: 'Classificar cadeias carbônicas abertas/fechadas, normais/ramificadas, saturadas/insaturadas e homogêneas/heterogêneas, identificando carbonos primários, secundários, terciários e quaternários.',
          methodology: 'Oficina Maker com modelos moleculares tridimensionais (bolinhas e varetas) para visualização espacial de ligações sigma e pi.',
          stepByStep: '1. Contextualização histórica sobre o colapso da Teoria da Força Vital e síntese da ureia (10 min). 2. Oficina prática de montagem tridimensional de metano, etano e benzeno (20 min). 3. Exercícios de classificação de cadeias no quadro (15 min). 4. Fechamento e registro no diário de bordo (5 min).',
          assessment: 'Avaliação formativa entre pares da precisão geométrica dos modelos moleculares montados e classificação correta de fórmulas estruturais.',
          recovery: 'Flashcards de apoio com critérios visuais de classificação de cadeias carbônicas.'
        },
        // Semana 8: Funções Orgânicas Oxigenadas no Cotidiano
        {
          code: 'EM13CNT305',
          desc: 'Identificar as fórmulas estruturais e os grupos funcionais característicos dos hidrocarbonetos e das principais funções orgânicas oxigenadas no cotidiano.',
          obj: 'Hidrocarbonetos e funções oxigenadas: álcoois, aldeídos, cetonas, ácidos carboxílicos e ésteres',
          learningObjectives: 'Diferenciar álcoois, aldeídos, cetonas, ácidos carboxílicos e ésteres em rótulos de alimentos, cosméticos, fármacos e biocombustíveis.',
          methodology: 'Gamificação Pedagógica ("Caça aos Grupos Funcionais") em rótulos reais e simulações do Material Digital SEDUC.',
          stepByStep: '1. Problematização: por que o etanol é combustível e também antisséptico? (10 min). 2. Exploração guiada das fórmulas gerais dos grupos funcionais (15 min). 3. Análise prática de rótulos em grupos (15 min). 4. Conclusão comparando propriedades físicas (10 min).',
          assessment: 'Questionário formativo com identificação de grupos funcionais em moléculas farmacológicas cotidianas.',
          recovery: 'Tabela sinóptica comparativa destacando os sufixos IUPAC (-ol, -al, -ona, -oico) para cada função orgânica.'
        },
        // Semana 9: Avaliação Oficial Prova Paulista / SARESP
        {
          code: 'AVAL-PROVA-PAULISTA',
          desc: 'Verificar e consolidar a apropriação das habilidades essenciais do 4º Bimestre (Equilíbrio Químico, pH/pOH e Funções Orgânicas) através da Prova Paulista e SARESP.',
          obj: 'Avaliação Oficial do Estado de São Paulo: Prova Paulista / SARESP e consolidação diagnóstica',
          learningObjectives: 'Consolidar as competências e habilidades trabalhadas ao longo do bimestre, identificando potencialidades e defasagens de aprendizagem.',
          methodology: 'Aplicação monitorada da Prova Paulista na plataforma CMSP com análise diagnóstica imediata dos itens de maior complexidade.',
          stepByStep: '1. Acolhida socioemocional e orientações operacionais para a avaliação (10 min). 2. Execução da avaliação bimestral individual com foco e concentração (30 min). 3. Mapeamento das dúvidas mais frequentes levantadas pelos estudantes (10 min).',
          assessment: 'Matriz diagnóstica de acertos e erros categorizada por descritor de habilidade (EM13CNT303, EM13CNT304, EM13CNT305).',
          recovery: 'Mapeamento dos estudantes que necessitam de intervenção intensiva na Semana de Estudos Intensivos (SEI).'
        },
        // Semana 10: SEI - Semana de Estudos Intensivos
        {
          code: 'SEI-RECUPERACAO',
          desc: 'Semana de Estudos Intensivos (SEI): Retomada, recuperação contínua e aprofundamento das habilidades com defasagem identificada no 4º Bimestre.',
          obj: 'Recuperação Contínua (SEI): superação de defasagens em Equilíbrio Químico e Química Orgânica',
          learningObjectives: 'Retomar e superar as dificuldades diagnósticas em cálculo de Kc, escala de pH e funções orgânicas, garantindo progressão plena.',
          methodology: 'Rotação por Estações de Aprendizagem Diferenciadas: Estação 1 (Cálculo Kc e Le Chatelier), Estação 2 (pH e Chuva Ácida), Estação 3 (Monitoria entre Pares com Material Digital).',
          stepByStep: '1. Alinhamento de metas da SEI e formação de grupos por defasagem identificada (10 min). 2. Desafios práticos nas estações rotativas com mediação docente direta (25 min). 3. Pós-teste de verificação da superação de defasagens (15 min).',
          assessment: 'Instrumento avaliativo pós-revisão com rubrica de verificação da superação de dificuldades e registro no Diário Digital (SED).',
          recovery: 'Feedback formativo individualizado e devolutiva pedagógica final aos estudantes.'
        }
      ]
    };
    defaultSkills = quimByBim[targetBimNum] || quimByBim[4];
  } else if (!isMath && normSubject) {
    const cleanSub = (planInfo.subject || 'Geral').trim();
    const codePrefix = cleanSub.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'HAB';
    defaultSkills = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => ({
      code: `HAB-${codePrefix}${targetBimNum}0${n}`,
      desc: `Desenvolver competências essenciais de ${cleanSub} para a Semana ${n} do ${targetBimNum}º Bimestre articuladas com o Currículo Paulista.`,
      obj: `Objetos de conhecimento da Semana ${n} de ${cleanSub} - Eixo Temático ${n}`,
      learningObjectives: `Apropriar-se dos conceitos estruturantes da Semana ${n} de ${cleanSub} e desenvolver autonomia crítica na resolução de problemas.`,
      methodology: `Metodologia ativa e investigativa com resolução orientada de exercícios práticos articulados ao Material Digital SEDUC-SP da Semana ${n}.`,
      stepByStep: `1. Acolhida e problematização disparadora (10 min). 2. Exploração conceitual e trabalho em equipes colaborativas (25 min). 3. Fechamento e consolidação dos registros no caderno (15 min).`,
      assessment: `Rubrica formativa de avaliação da participação, engajamento e precisão conceitual das produções da Semana ${n}.`,
      recovery: `Intervenção diagnóstica pontual e atendimento individualizado para superação de dúvidas identificadas na Semana ${n}.`
    }));
  } else {
    // Default math
    defaultSkills = [
      {
        code: 'EF09MA01',
        desc: 'Reconhecer a necessidade dos números reais para medir qualquer segmento de reta; identificar irracionais.',
        obj: 'Números reais: notação científica e reta numérica',
        learningObjectives: 'Localizar números irracionais na reta numérica e aplicar a notação científica em situações contextualizadas.',
        methodology: 'Ensino por Investigação com régua e compasso e resolução orientada de problemas no Material Digital SEDUC.',
        stepByStep: '1. Acolhimento e desafio inicial da hipotenusa de catetos unitários (10 min). 2. Construção geométrica da raiz de 2 (20 min). 3. Exercícios guiados de aproximação decimal (15 min). 4. Fechamento (5 min).',
        assessment: 'Ficha formativa com exercícios de localização na reta numérica e justificativa escrita.',
        recovery: 'Reforço de aproximações por quadrados perfeitos consecutivos com apoio visual.'
      },
      {
        code: 'EF09MA02',
        desc: 'Reconhecer um número irracional como um número real cuja representação decimal é infinita e não periódica.',
        obj: 'Propriedades dos radicais e operações com potências',
        learningObjectives: 'Diferenciar dízimas periódicas de números irracionais a partir da representação fracionária.',
        methodology: 'Aprendizagem Baseada em Problemas com análise comparativa de decimais finitos e infinitos.',
        stepByStep: '1. Retomada diagnóstica com frações geratrizes (10 min). 2. Investigação da irracionalidade do número Pi e raiz de 3 (20 min). 3. Trabalho em duplas com calculadora (15 min). 4. Síntese (5 min).',
        assessment: 'Rubrica de argumentação matemática e verificação das produções escritas no caderno.',
        recovery: 'Plantão de dúvidas individualizado sobre o algoritmo da fração geratriz.'
      },
      {
        code: 'EF09MA03',
        desc: 'Efetuar cálculos com números reais, inclusive potências com expoentes fracionários.',
        obj: 'Potenciação, radiciação e cálculo algébrico',
        learningObjectives: 'Aplicar as propriedades operatórias de potenciação e radiciação na simplificação de expressões algébricas.',
        methodology: 'Gamificação pedagógica com cartões de equivalência de potências e raízes.',
        stepByStep: '1. Ativação de conhecimentos prévios (10 min). 2. Demonstração das propriedades operatórias (15 min). 3. Jogo em equipes de simplificação de expressões (20 min). 4. Registro final (5 min).',
        assessment: 'Exit ticket com três expressões graduadas para verificação imediata de aprendizagem.',
        recovery: 'Material de apoio com tabela sinóptica das propriedades das potências.'
      },
      {
        code: 'EF09MA06',
        desc: 'Compreender as funções como relações de dependência unívoca entre duas variáveis e suas representações.',
        obj: 'Função afim: noções fundamentais e gráficos',
        learningObjectives: 'Construir e interpretar gráficos de funções afins no plano cartesiano, identificando taxa de variação.',
        methodology: 'Laboratório de informática com uso do software GeoGebra para exploração dinâmica de retas.',
        stepByStep: '1. Problematização a partir de corrida de aplicativo de transporte (10 min). 2. Exploração no GeoGebra variando coeficientes (20 min). 3. Elaboração de conclusões no caderno (15 min). 4. Encerramento (5 min).',
        assessment: 'Relatório investigativo de interpretação gráfica preenchido em duplas no GeoGebra.',
        recovery: 'Exercícios práticos de localização de pares ordenados no plano cartesiano.'
      },
      {
        code: 'EF09MA08',
        desc: 'Resolver e elaborar situações-problema que envolvam relações de proporcionalidade direta e inversa.',
        obj: 'Grandezas diretamente e inversamente proporcionais',
        learningObjectives: 'Modelar algebricamente situações cotidianas de grandezas direta e inversamente proporcionais.',
        methodology: 'Estudo de caso e rotação por estações com situações reais de velocidade, tempo e consumo.',
        stepByStep: '1. Apresentação das estações de problemas (10 min). 2. Rotação dos grupos pelas três bancadas (25 min). 3. Compartilhamento das estratégias de resolução (15 min).',
        assessment: 'Autoavaliação guiada e conferência das resoluções das situações-problema.',
        recovery: 'Revisão da regra de três simples e composta com mapas mentais orientados.'
      },
      {
        code: 'EF09MA13',
        desc: 'Demonstrar relações métricas do triângulo retângulo, entre elas o teorema de Pitágoras.',
        obj: 'Teorema de Pitágoras e aplicações geométricas',
        learningObjectives: 'Demonstrar o Teorema de Pitágoras geometricamente e aplicar na determinação de distâncias inacessíveis.',
        methodology: 'Oficina prática com quebra-cabeça geométrico de Bhaskara e recorte de áreas de quadrados.',
        stepByStep: '1. Desafio visual com tangram/quadrados (15 min). 2. Demonstração formal a² = b² + c² (15 min). 3. Resolução de problemas práticos de acessibilidade e rampas (15 min). 4. Síntese (5 min).',
        assessment: 'Verificação da precisão da montagem geométrica e resolução individual de exercícios.',
        recovery: 'Reforço do cálculo de áreas de figuras planas para consolidação do teorema.'
      },
      {
        code: 'EF09MA14',
        desc: 'Resolver e elaborar situações-problema de aplicação do teorema de Pitágoras.',
        obj: 'Aplicações práticas do Teorema de Pitágoras na arquitetura e navegação',
        learningObjectives: 'Calcular medidas de diagonais em blocos retangulares e polígonos regulares.',
        methodology: 'Aprendizagem Baseada em Projetos com cálculo de diagonais na quadra esportiva da escola.',
        stepByStep: '1. Medição prática no pátio escolar (15 min). 2. Cálculos geométricos em sala (20 min). 3. Sistematização das fórmulas no quadro (10 min). 4. Fechamento (5 min).',
        assessment: 'Relatório de campo com croqui da medição e cálculos matemáticos demonstrados.',
        recovery: 'Listas guiadas com figuras planificadas para visualização dos triângulos internos.'
      },
      {
        code: 'EF09MA18',
        desc: 'Reconhecer e empregar unidades de medida de volume e capacidade e suas conversões.',
        obj: 'Volume e capacidade de prismas retos e cilindros',
        learningObjectives: 'Calcular o volume de reservatórios cilíndricos e prismáticos relacionando decímetros cúbicos a litros.',
        methodology: 'Prática experimental com recipientes graduados e água para constatação empírica de 1 dm³ = 1 L.',
        stepByStep: '1. Demonstração prática com cubos de 10 cm e provetas (15 min). 2. Dedução das fórmulas de volume (15 min). 3. Resolução de problemas de economia de água (15 min). 4. Registro (5 min).',
        assessment: 'Questionário formativo com cálculo de capacidade de caixas d\'água reais.',
        recovery: 'Flashcards de conversão de unidades (m³, dm³, cm³, L, mL).'
      },
      {
        code: 'AVAL-PROVA-PAULISTA',
        desc: 'Avaliação Oficial Prova Paulista e SARESP: Consolidação diagnóstica das aprendizagens essenciais.',
        obj: 'Avaliação Diagnóstica e Formativa Bimestral SEDUC-SP',
        learningObjectives: 'Verificar a apropriação das habilidades cognitivas do bimestre e identificar pontos de atenção.',
        methodology: 'Aplicação monitorada da Prova Paulista na plataforma digital CMSP com clima focado e acolhedor.',
        stepByStep: '1. Instruções operacionais e acolhida (10 min). 2. Realização individual da avaliação (35 min). 3. Registro de percepções e dúvidas (5 min).',
        assessment: 'Matriz diagnóstica oficial de acertos e erros categorizada por habilidade no Diário Digital.',
        recovery: 'Planejamento nominal das intervenções para a Semana de Estudos Intensivos (SEI).'
      },
      {
        code: 'SEI-RECUPERACAO',
        desc: 'Semana de Estudos Intensivos (SEI): Retomada, recuperação e aprofundamento das habilidades com defasagem.',
        obj: 'Recuperação Contínua (SEI) com apoio do Material Digital SEDUC',
        learningObjectives: 'Superar defasagens diagnosticadas na Prova Paulista garantindo a progressão plena do estudante.',
        methodology: 'Estações de Aprendizagem com monitoria entre pares e listas temáticas de nivelamento.',
        stepByStep: '1. Alinhamento das metas da SEI e formação de grupos heterogêneos (10 min). 2. Trabalho mediado nas estações (30 min). 3. Pós-teste de verificação (10 min).',
        assessment: 'Instrumento avaliativo pós-revisão com rubrica de verificação de aprendizagem.',
        recovery: 'Feedback formativo individualizado e devolutiva aos estudantes.'
      }
    ];
  }

  // Filter scopeData if provided and valid
  let filteredScope = Array.isArray(scopeData) ? [...scopeData] : [];
  if (!isMath) {
    filteredScope = filteredScope.filter((s: any) => {
      const c = String(s.code || '').toUpperCase();
      return !c.startsWith('EF09MA') && !c.startsWith('EF08MA') && !c.startsWith('EF07MA');
    });
  }
  if (normSubject && filteredScope.length > 0) {
    const matched = filteredScope.filter((s: any) => {
      const sub = normalizeStrClean(s.subject || s.unit || '');
      return sub.includes(normSubject) || normSubject.includes(sub);
    });
    if (matched.length > 0) filteredScope = matched;
  }

  const skills = filteredScope.length > 0 ? filteredScope : defaultSkills;

  return fields.map((f, i) => {
    const addrUpper = (f.address || '').toUpperCase().trim();

    // Specific fixed evaluation cells C21:C24 and J21:J24
    if (['C21', 'C22', 'C23', 'C24', 'J21', 'J22', 'J23', 'J24'].includes(addrUpper)) {
      const fixedMap: Record<string, { val: string; just: string }> = {
        'C21': { val: 'Prova Paulista', just: 'Instrumento de Avaliação: Prova Paulista (C21)' },
        'J21': { val: '30%', just: 'Peso de Avaliação: 30% (J21)' },
        'C22': { val: 'Atividades em Sala e Caderno', just: 'Instrumento de Avaliação: Atividades em Sala e Caderno (C22)' },
        'J22': { val: '30%', just: 'Peso de Avaliação: 30% (J22)' },
        'C23': { val: 'Trabalhos e Práticas em Grupo', just: 'Instrumento de Avaliação: Trabalhos e Práticas em Grupo (C23)' },
        'J23': { val: '20%', just: 'Peso de Avaliação: 20% (J23)' },
        'C24': { val: 'Avaliação Formativa e SEI', just: 'Instrumento de Avaliação: Avaliação Formativa e SEI (C24)' },
        'J24': { val: '20%', just: 'Peso de Avaliação: 20% (J24)' },
      };
      const def = fixedMap[addrUpper];
      const userVal = f.fillValue || f.label;
      const finalVal = (userVal && userVal !== addrUpper) ? userVal : def.val;
      return {
        id: f.id,
        address: f.address,
        sheet: f.sheet,
        fillValue: String(finalVal).trim() || def.val,
        justification: def.just,
        isSEI: addrUpper === 'C24',
        isAvaliacao: true
      };
    }

    // Mandatory cells J7, J8, J9 (Sistemática Oficial SEDUC)
    if (['J7', 'J8', 'J9'].includes(addrUpper)) {
      if (addrUpper === 'J7') {
        return { id: f.id, address: f.address, sheet: f.sheet, fillValue: String(diasLetivosJ7), justification: 'Dias Letivos do Bimestre (Célula J7 - Calendário SEDUC)' };
      }
      if (addrUpper === 'J8') {
        return { id: f.id, address: f.address, sheet: f.sheet, fillValue: String(plannedClasses), justification: 'Total de Aulas do Escopo Apurado (Célula J8 - Escopo e Sequência)' };
      }
      if (addrUpper === 'J9') {
        return { id: f.id, address: f.address, sheet: f.sheet, fillValue: String(diasEfetivosJ9), justification: 'Dias Letivos Efetivos com Desconto de Eventos (Célula J9 - SEDUC)' };
      }
    }

    // Colunas F e H estritamente vazias na grade semanal
    const colLetCheck = (f.colLetter || f.address?.replace(/\d+/g, '') || '').toUpperCase();
    if ((f.row >= 28 || f.id?.startsWith('GRID_')) && (colLetCheck === 'F' || colLetCheck === 'H')) {
      return {
        id: f.id,
        address: f.address,
        sheet: f.sheet,
        fillValue: '',
        justification: `Coluna ${colLetCheck} mantida estritamente vazia/em branco conforme modelo oficial`,
        isDisabled: true,
        disabledByUser: true,
        isSEI: false,
        isAvaliacao: false
      };
    }

    // Coluna Desativada / Em Branco pelo Usuário (v2.1.3)
    if (f.isDisabled || f.disabledByUser) {
      return {
        id: f.id,
        address: f.address,
        sheet: f.sheet,
        fillValue: '',
        justification: '(Não preenchida / Desativada pelo usuário)',
        isDisabled: true,
        disabledByUser: true,
        isSEI: false,
        isAvaliacao: false
      };
    }

    // Células Fixas Imutáveis B13, B15 e B17 (Bloqueio estrito de IA e preenchimento literal exato)
    if (['B13', 'B15', 'B17'].includes(addrUpper) || f.id?.includes('B13') || f.id?.includes('B15') || f.id?.includes('B17')) {
      const fixedKey = (['B13', 'B15', 'B17'].includes(addrUpper) ? addrUpper : (f.id?.includes('B13') ? 'B13' : f.id?.includes('B15') ? 'B15' : 'B17')) as FixedCellKey;
      const def = FIXED_IMMUTABLE_CELLS[fixedKey];
      return {
        id: f.id,
        address: def.address,
        sheet: f.sheet,
        fillValue: def.text,
        justification: `Texto Fixo Imutável (${def.address}): ${def.label}`,
        isSEI: false,
        isAvaliacao: false
      };
    }

    // Direct Literal / Fixed mode: inject exact label without AI
    if (f.injectionMode === 'literal') {
      return {
        id: f.id,
        address: f.address,
        sheet: f.sheet,
        fillValue: String(f.fillValue || f.label || f.currentValue || '').trim(),
        justification: 'Texto literal / fixo configurado pelo usuário',
        isSEI: false,
        isAvaliacao: false
      };
    }

    // Custom cell with ai_prompt mode
    if (f.injectionMode === 'ai_prompt' || f.id?.startsWith('CUSTOM_')) {
      const promptLabel = f.label || '';
      return {
        id: f.id,
        address: f.address,
        sheet: f.sheet,
        fillValue: `Planejamento Pedagógico para ${f.address}: Atendimento da diretriz "${promptLabel}". Instrumentos formativos, rubricas de acompanhamento e práticas pedagógicas alinhadas ao Currículo Paulista para a disciplina ${planInfo.subject || 'específica'}.`,
        justification: `Orientação pedagógica atendida para a célula ${f.address}`,
        isSEI: false,
        isAvaliacao: false
      };
    }

    // Header Identification fields
    if (f.id?.startsWith('HDR_') || f.expectedType === 'identificacao') {
      if (f.id.includes('schoolCell') && planInfo.school) {
        return { id: f.id, address: f.address, sheet: f.sheet, fillValue: planInfo.school, justification: 'Unidade escolar informada no cabeçalho' };
      }
      if (f.id.includes('teacherCell') && planInfo.teacherName) {
        return { id: f.id, address: f.address, sheet: f.sheet, fillValue: planInfo.teacherName, justification: 'Docente informado no cabeçalho' };
      }
      if (f.id.includes('subjectCell') && planInfo.subject) {
        return { id: f.id, address: f.address, sheet: f.sheet, fillValue: planInfo.subject, justification: 'Disciplina informada no cabeçalho' };
      }
      if (f.id.includes('gradeCell') && planInfo.grade) {
        return { id: f.id, address: f.address, sheet: f.sheet, fillValue: planInfo.grade, justification: 'Turma informada no cabeçalho' };
      }
      if (f.id.includes('bimestreCell') && planInfo.bimestre) {
        return { id: f.id, address: f.address, sheet: f.sheet, fillValue: planInfo.bimestre, justification: 'Bimestre informado no cabeçalho' };
      }
      const addrUpper = (f.address || '').toUpperCase().trim();
      if (f.id.includes('diasLetivosCell') || addrUpper === 'J7') {
        return { id: f.id, address: f.address, sheet: f.sheet, fillValue: String(diasLetivosJ7), justification: 'Dias Letivos do Bimestre (Célula J7 - Calendário SEDUC)' };
      }
      if (f.id.includes('plannedClassesCell') || addrUpper === 'J8') {
        return { id: f.id, address: f.address, sheet: f.sheet, fillValue: String(plannedClasses), justification: 'Total de Aulas do Escopo Apurado (Célula J8 - Escopo e Sequência)' };
      }
      if (f.id.includes('diasEfetivosCell') || addrUpper === 'J9') {
        return { id: f.id, address: f.address, sheet: f.sheet, fillValue: String(diasEfetivosJ9), justification: 'Dias Letivos Efetivos com Desconto de Eventos (Célula J9 - SEDUC)' };
      }
    }

    // Determine target week precisely by row number or weekNumber
    // In SEDUC templates, rows start at 28 (Taubaté) or 16 (Standard) or 8
    let targetWeek = f.weekNumber;
    if (!targetWeek && f.row) {
      if (f.row >= 28) targetWeek = f.row - 27;
      else if (f.row >= 16) targetWeek = f.row - 15;
      else if (f.row >= 8) targetWeek = f.row - 7;
    }
    if (!targetWeek || targetWeek < 1) targetWeek = Math.floor(i / 7) + 1;

    const teacherSchedConfig = {
      classDays: planInfo?.classDays || planInfo?.teacherSchedule?.classDays,
      classesPerDay: planInfo?.classesPerDay || planInfo?.teacherSchedule?.classesPerDay,
      plannedClasses: plannedClasses,
      rowCount: totalWeeks
    };
    const effectiveYear = (planInfo?.year ? parseInt(String(planInfo.year), 10) : undefined) || calendarData?.year || 2026;
    const rowAlloc = getTeacherAllocatedWeekInfo(targetWeek, targetBimNum, totalWeeks, calendarData, effectiveYear, teacherSchedConfig);

    const isSuspensionWeek = (targetWeek === 2) || (rowAlloc?.status === 'suspension');
    const isSEIWeek = (targetWeek === 10) || (f.row === 37) || (rowAlloc?.isSEI === true);
    const isEvalWeek = (targetWeek === 11) || (f.row === 38) || (rowAlloc?.isClosing === true);

    let startLesson = 0;
    let endLesson = 0;
    let lessonRange = '';
    let lessonRangePlural = '';

    if (isSuspensionWeek) {
      lessonRange = 'Suspensão de Aulas';
      lessonRangePlural = 'Suspensão de Aulas';
    } else if (isSEIWeek) {
      lessonRange = 'Semana de Estudos Intensivos (SEI) / Recuperação e Nivelamento';
      lessonRangePlural = 'SEI / Recuperação e Nivelamento';
    } else if (isEvalWeek) {
      lessonRange = 'Conselho de Classe / Fechamento de Médias e Frequências';
      lessonRangePlural = 'Conselho de Classe / Fechamento';
    } else {
      startLesson = (rowAlloc?.lessonStart && rowAlloc.lessonStart > 0) ? rowAlloc.lessonStart : (targetWeek === 1 ? 1 : ((targetWeek - 1) * 2 - 1));
      endLesson = (rowAlloc?.lessonEnd && rowAlloc.lessonEnd > 0) ? rowAlloc.lessonEnd : (targetWeek === 1 ? 2 : ((targetWeek - 1) * 2));
      if (startLesson > 16) startLesson = 15;
      if (endLesson > 16) endLesson = 16;
      lessonRange = `Aula ${startLesson} e ${endLesson}`;
      lessonRangePlural = `Aulas ${startLesson} e ${endLesson}`;
    }

    // Select skill positioned according to lesson progression:
    let currSkill: any;
    if (isSEIWeek) {
      currSkill = skills.find((s: any) => s.code?.includes('SEI') || s.desc?.toLowerCase().includes('sei') || s.objectOfKnowledge?.toLowerCase().includes('sei')) ||
                  skills[skills.length - 1];
    } else if (isEvalWeek) {
      currSkill = skills.find((s: any) => s.code?.includes('FECH') || s.code?.includes('CONSELHO') || s.desc?.toLowerCase().includes('fechamento')) ||
                  (skills.length >= 2 ? skills[skills.length - 2] : skills[0]);
    } else {
      const regularSkills = skills.filter((s: any) => !s.code?.includes('SEI') && !s.code?.includes('AVAL') && !s.code?.includes('FECH'));
      const effectiveSkillIdx = (startLesson > 0)
        ? Math.max(0, Math.floor((startLesson - 1) / 2))
        : Math.min(Math.max(0, targetWeek - 1), Math.max(0, regularSkills.length - 1));
      currSkill = regularSkills[Math.min(effectiveSkillIdx, regularSkills.length - 1)] || skills[Math.min(effectiveSkillIdx, skills.length - 1)];
    }
    const defaultCode = isMath ? 'EF09MA01' : (currSkill?.code || 'HAB-SP');

    let fillText = '';
    let just = '';

    const labelLower = (f.label || '').toLowerCase();
    const typeLower = (f.expectedType || '').toLowerCase();
    const colLet = (f.colLetter || f.address?.replace(/\d+/g, '') || '').toUpperCase();

    // 1. COLUNA B (Data prevista / Semana - Grade do Professor SEDUC-SP)
    if (colLet === 'B' || labelLower.includes('período') || labelLower.includes('semana') || labelLower.includes('data prevista') || typeLower.includes('week') || typeLower.includes('periodo')) {
      fillText = rowAlloc?.fullDateText || getSeducWeekPeriodText(targetWeek, targetBimNum, isSEIWeek, isEvalWeek, totalWeeks, calendarData, calendarData?.year, teacherSchedConfig);
      just = `Semana ${targetWeek} calculada com base na grade horária do professor e calendário oficial SEDUC-SP (${targetBimNum}º Bimestre)`;
    }
    // TRATAMENTO EXCLUSIVO DE SUSPENSÃO OFICIAL (Ex: 15/10 Dia do Professor) NAS DEMAIS COLUNAS
    else if (isSuspensionWeek) {
      const eventName = rowAlloc?.holidayReason || 'Dia do Professor';
      if (colLet === 'D') {
        fillText = 'Evento Oficial / Suspensão de Aulas';
        just = 'Não ministrar aula nesta data - Suspensão oficial';
      } else if (colLet === 'E') {
        fillText = 'Sem expediente pedagógico presencial conforme calendário escolar oficial SEDUC-SP.';
        just = 'Sem expediente pedagógico presencial';
      } else if (colLet === 'G') {
        fillText = `Suspensão das atividades letivas em virtude de ${eventName}. Conteúdo didático reprogramado para o próximo encontro letivo.`;
        just = 'Suspensão oficial';
      } else if (colLet === 'I') {
        fillText = '-';
        just = 'Aulas reprogramadas';
      } else {
        fillText = '-';
        just = 'Sem aula';
      }
    }
    // 2. COLUNA D (Código da Habilidade + Objeto de Conhecimento / Aulas da Semana)
    else if (labelLower.includes('habilidade') || typeLower.includes('skill') || labelLower.includes('código') || (colLet === 'D' && !labelLower.includes('objetivo'))) {
      if (isSEIWeek) {
        fillText = 'Semana de Estudos Intensivos (SEI) / Recuperação e Nivelamento • (SEI-RECUPERACAO) - Objeto de Conhecimento: Retomada e consolidação das habilidades essenciais com defasagem do 4º Bimestre';
        just = `Semana 10: Atividades exclusivas de nivelamento e recuperação contínua (SEI) da disciplina ${planInfo.subject || 'Educação Financeira'}`;
      } else if (isEvalWeek) {
        fillText = 'Conselho de Classe / Fechamento de Médias e Frequências • (CONSELHO-FECHAMENTO) - Objeto de Conhecimento: Fechamento bimestral, apuração de frequência e análise colegiada de rendimento escolar';
        just = `Semana 11: Fechamento institucional de notas, frequências no SED e participação no Conselho de Classe`;
      } else {
        const cleanCode = currSkill.code || defaultCode;
        const cleanObj = cleanPedagogicalText(currSkill.obj || currSkill.objectOfKnowledge || currSkill.desc || 'Objeto de Conhecimento Estruturante');
        fillText = `${lessonRange} • (${cleanCode}) - Objeto de Conhecimento: ${cleanObj}`;
        just = `Carga horária de 2 aulas geminadas da Semana ${targetWeek} (${lessonRange}) alinhada ao Currículo SEDUC-SP`;
      }
    }
    // 3. COLUNA E (Objetivos de Aprendizagem / Foco Pedagógico - ARTICULADO DAS 2 AULAS)
    else if (labelLower.includes('objetivo') || labelLower.includes('aprendizagem') || typeLower.includes('objective') || colLet === 'E') {
      if (isSEIWeek) {
        fillText = `Retomar, nivelar e consolidar as habilidades essenciais do 4º Bimestre que apresentaram maior índice de defasagem nas avaliações formativas e Prova Paulista da disciplina ${planInfo.subject || 'Educação Financeira'}.`;
        just = `Objetivos de recuperação e nivelamento da Semana 10 (SEI)`;
      } else if (isEvalWeek) {
        fillText = `Consolidar os registros de aproveitamento escolar, realizar o fechamento de médias e frequências e participar colegiadamente das deliberações do Conselho de Classe final.`;
        just = `Objetivos institucionais de fechamento da Semana 11`;
      } else if (currSkill.learningObjectives && !currSkill.learningObjectives.includes('•')) {
        let cleanObjText = cleanPedagogicalText(currSkill.learningObjectives);
        if (!cleanObjText.toLowerCase().includes('aula')) {
          cleanObjText = `Articular os objetivos pedagógicos das ${lessonRangePlural}: ${cleanObjText}`;
        }
        fillText = cleanObjText;
        just = `Objetivos de aprendizagem articulados das ${lessonRangePlural} (Semana ${targetWeek})`;
      } else {
        const cleanTopic = cleanPedagogicalText(currSkill.obj || currSkill.objectOfKnowledge || currSkill.desc || 'conteúdos essenciais');
        fillText = `Articular os objetivos pedagógicos das ${lessonRangePlural}: Compreender e aplicar os conceitos fundamentais de ${cleanTopic} na resolução autônoma de problemas e situações contextualizadas.`;
        just = `Objetivos de aprendizagem articulados das ${lessonRangePlural} (Semana ${targetWeek})`;
      }
    }
    // 4. COLUNA F (Metodologia / Estratégia Didática da Aula - BLOCO DE 2 AULAS GEMINADAS)
    else if ((colLet === 'F' && !labelLower.includes('passo')) || (labelLower.includes('metodologia') && !labelLower.includes('passo') && !labelLower.includes('desenvolvimento')) || (typeLower.includes('methodology') && !typeLower.includes('desenvolvimento'))) {
      if (isSEIWeek) {
        fillText = 'Estratégia para bloco de recuperação intensiva (90-100 min): Rotação por estações de aprendizagem com agrupamentos produtivos e monitoria entre pares, apoiada no Material Digital SEDUC-SP.';
        just = `Metodologia ativa para a Semana 10 (SEI)`;
      } else if (isEvalWeek) {
        fillText = 'Reunião pedagógica e institucional de Conselho de Classe, análise colegiada de dados de desempenho escolar na plataforma SED e alinhamento pedagógico.';
        just = `Atividade institucional de Conselho de Classe da Semana 11`;
      } else if (currSkill.methodology) {
        let cleanMeth = cleanPedagogicalText(currSkill.methodology);
        if (!cleanMeth.toLowerCase().includes('geminada') && !cleanMeth.toLowerCase().includes('90') && !cleanMeth.toLowerCase().includes('100')) {
          cleanMeth = `Estratégia para bloco de 2 aulas geminadas (90-100 min - ${lessonRangePlural}): ${cleanMeth}`;
        }
        fillText = cleanMeth;
        just = `Metodologia ativa cobrindo as 2 aulas geminadas da Semana ${targetWeek}`;
      } else {
        fillText = `Estratégia para bloco de 2 aulas geminadas (90-100 min - ${lessonRangePlural}): Ensino por Investigação na Aula ${startLesson} articulado à resolução orientada de problemas práticos na Aula ${endLesson} com suporte do Material Digital SEDUC-SP.`;
        just = `Metodologia ativa cobrindo as 2 aulas geminadas da Semana ${targetWeek}`;
      }
    }
    // 5. COLUNA G (Desenvolvimento da Aula / Passo a Passo Prático - COM MINUTAGEM COBRINDO AS 2 AULAS)
    else if (colLet === 'G' || labelLower.includes('passo a passo') || labelLower.includes('desenvolvimento') || typeLower.includes('desenvolvimento')) {
      if (isSEIWeek) {
        fillText = 'Bloco 1 (45-50 min): 1. Acolhida e devolutiva pedagógica das defasagens diagnósticas (15 min). 2. Oficinas práticas em duplas produtivas por descritores críticos (30 min). 3. Síntese intermediária (5 min). | Transição e Bloco 2 (45-50 min): 4. Desafios de nivelamento e aplicação contextualizada (30 min). 5. Autoavaliação e registro no diário de bordo (15 min) (Tempo Total: 90-100 min).';
        just = `Desenvolvimento prático da Semana de Estudos Intensivos (SEI)`;
      } else if (isEvalWeek) {
        fillText = 'Etapa 1 (45-50 min): 1. Apuração final e conferência de frequências e notas no Diário Digital / SED (30 min). 2. Lançamento e consolidação das médias finais e menções do 4º Bimestre (20 min). | Transição e Etapa 2 (45-50 min): 3. Participação no Conselho de Classe e deliberações colegiadas de progressão (35 min). 4. Registro em ata institucional e encerramento do ano letivo (15 min) (Tempo Total: 90-100 min).';
        just = `Atividades de fechamento de notas e Conselho de Classe`;
      } else if (currSkill.stepByStep) {
        let cleanStep = cleanPedagogicalText(currSkill.stepByStep);
        if (!cleanStep.toLowerCase().includes('aula') || !cleanStep.includes('|')) {
          cleanStep = `Aula ${startLesson} (45-50 min): 1. Acolhida e problematização disparadora (10 min). 2. Investigação orientada com Material Digital (25 min). 3. Sistematização inicial (10 min). | Transição e Aula ${endLesson} (45-50 min): 4. Aprofundamento prático em duplas (25 min). 5. Síntese e registro no diário de bordo (15 min) (Total: 90-100 min).`;
        }
        fillText = cleanStep;
        just = `Encaminhamento didático com minutagem para as 2 aulas geminadas da Semana ${targetWeek}`;
      } else {
        fillText = `Aula ${startLesson} (45-50 min): 1. Acolhida e problematização disparadora contextualizada (10 min). 2. Investigação e desenvolvimento em duplas (25 min). 3. Sistematização preliminar (10 min). | Transição e Aula ${endLesson} (45-50 min): 4. Aplicação prática dos conceitos e exercícios guiados (25 min). 5. Fechamento formativo e registro no caderno (15 min) (Tempo Total: 90-100 min).`;
        just = `Encaminhamento didático com minutagem para as 2 aulas geminadas da Semana ${targetWeek}`;
      }
    }
    // 6. COLUNA H (Avaliação da Aprendizagem - DAS 2 AULAS)
    else if ((colLet === 'H' && !labelLower.includes('recupera')) || (labelLower.includes('avalia') && !labelLower.includes('recupera')) || typeLower.includes('eval')) {
      if (isSEIWeek) {
        fillText = 'Avaliação processual formativa com rubricas de nivelamento e registro de superação de defasagens na Secretaria Escolar Digital (SED).';
        just = 'Avaliação formativa da SEI';
      } else if (isEvalWeek) {
        fillText = 'Validação das médias bimestrais finais, análise da taxa de frequência e deliberação institucional em ata de Conselho de Classe.';
        just = 'Deliberação institucional do Conselho de Classe';
      } else if (currSkill.assessment) {
        fillText = cleanPedagogicalText(currSkill.assessment);
        just = `Avaliação formativa das 2 aulas da Semana ${targetWeek}`;
      } else {
        fillText = `Observação formativa contínua, análise da produção escrita no diário de bordo e rubrica de participação individual e coletiva nas aulas ${startLesson} e ${endLesson}.`;
        just = `Avaliação formativa das 2 aulas da Semana ${targetWeek}`;
      }
    }
    // 7. COLUNA I (Ajustes Pedagógicos / Recuperação Contínua - DAS 2 AULAS)
    else if (colLet === 'I' || labelLower.includes('recupera') || labelLower.includes('ajuste') || typeLower.includes('recuperacao')) {
      if (isSEIWeek) {
        fillText = 'Atendimento individualizado para estudantes com defasagens conceituais remanescentes e roteiro personalizado de estudos.';
        just = 'Recuperação personalizada na SEI';
      } else if (isEvalWeek) {
        fillText = 'Registro dos encaminhamentos e pareceres pedagógicos finais para o ciclo seguinte na Secretaria Escolar Digital (SED).';
        just = 'Encaminhamentos pedagógicos finais no SED';
      } else if (currSkill.recovery) {
        fillText = cleanPedagogicalText(currSkill.recovery);
        just = `Recuperação contínua imediata das aulas ${startLesson} e ${endLesson}`;
      } else {
        fillText = `Intervenção pedagógica imediata e mediação dirigida para superação pontual de dúvidas conceituais das aulas ${startLesson} e ${endLesson}.`;
        just = `Recuperação contínua imediata das aulas ${startLesson} e ${endLesson}`;
      }
    }
    // 8. Cabeçalhos e Metadados
    else if (labelLower.includes('objeto') || labelLower.includes('conteúdo') || typeLower.includes('content')) {
      fillText = cleanPedagogicalText(currSkill.obj || currSkill.objectOfKnowledge || 'Conceitos centrais e propriedades fundamentais.');
      just = 'Alinhado com o Currículo Paulista SEDUC-SP';
    } else if (labelLower.includes('bimestre') || f.id?.includes('bimestreCell')) {
      fillText = planInfo.bimestre || `${targetBimNum}º Bimestre`;
      just = 'Bimestre letivo definido no cabeçalho';
    } else if (labelLower.includes('professor') || labelLower.includes('docente') || f.id?.includes('teacherCell')) {
      fillText = planInfo.teacherName || 'Docente Responsável - PEI / Regular';
      just = 'Professor(a) definido no cabeçalho';
    } else if (labelLower.includes('disciplina') || labelLower.includes('componente') || f.id?.includes('subjectCell')) {
      fillText = planInfo.subject || 'Química';
      just = 'Disciplina definida no cabeçalho';
    } else if (labelLower.includes('escola') || labelLower.includes('unidade') || f.id?.includes('schoolCell')) {
      fillText = planInfo.school || 'E.E. Professor Estadual - SEDUC-SP';
      just = 'Unidade escolar definida no cabeçalho';
    } else if (labelLower.includes('turma') || labelLower.includes('ano') || labelLower.includes('série') || f.id?.includes('gradeCell')) {
      fillText = planInfo.grade || '1ª Série do Ensino Médio';
      just = 'Turma definida no cabeçalho';
    } else {
      fillText = `Planejamento aprovado em ATPC e alinhado ao Calendário Escolar Oficial SEDUC-SP.`;
      just = 'Adequação curricular institucional';
    }

    const sourcePage = currSkill?.sourcePage || (guidePdfText ? findPdfPageForText(guidePdfText, currSkill?.code) : undefined);
    let sourceRef = '';
    if (isSEIWeek) {
      sourceRef = 'Base Curricular Oficial SEDUC-SP • SEI';
    } else if (isEvalWeek) {
      sourceRef = 'Regulamento Escolar SEDUC-SP • Conselho de Classe';
    } else if (isSuspensionWeek) {
      sourceRef = 'Calendário Escolar Oficial SEDUC-SP';
    } else {
      sourceRef = sourcePage 
        ? `${lessonRangePlural} • Pág. ${sourcePage} - Guia Priorizado PDF`
        : (currSkill?.sourceReference && currSkill.sourceReference.toLowerCase().includes('aula')
            ? currSkill.sourceReference
            : `${lessonRangePlural} • Base Curricular Oficial SEDUC-SP`);
    }

    return {
      id: f.id,
      address: f.address,
      sheet: f.sheet,
      fillValue: fillText,
      justification: just,
      isSEI: rowAlloc?.isSEI !== undefined ? rowAlloc.isSEI : isSEIWeek,
      isAvaliacao: rowAlloc?.isAvaliacao !== undefined ? rowAlloc.isAvaliacao : isEvalWeek,
      isTransferred: rowAlloc?.isTransferred || false,
      holidayReason: rowAlloc?.holidayReason,
      lessonRange: lessonRange,
      sourcePage,
      sourceReference: sourceRef
    };
  });
}

// Serve Vite in development, or static build in production
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await import('vite');
    const viteServer = await vite.createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(viteServer.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

startServer();
