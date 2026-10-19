/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { UploadSlots } from './components/UploadSlots';
import { TrainingWizard } from './components/TrainingWizard';
import { MappingViewer } from './components/MappingViewer';
import { ProcessingProgress } from './components/ProcessingProgress';
import { ExportPreview } from './components/ExportPreview';
import { 
  UploadedSlotFile, 
  MappedField, 
  ScopeSkill, 
  CalendarSummary, 
  PlanMetadata,
  CellMapProfile,
  Slot2DocMode
} from './types/plan';
import { 
  inspectWorkbook,
  buildFieldsFromCellMapProfile,
  parseScopeSequence, 
  parsePrioritizedGuidePdf,
  mergeScopeAndPrioritizedGuide,
  extractTextFromPdfBuffer,
  parseSeducCalendar, 
  injectDataAndExport,
  SheetRowPreview,
  generateSuggestedFileName,
  saveFileWithPicker,
  downloadBlobDirect,
  SaveResult
} from './utils/fileEngine';
import { 
  SAMPLE_SCOPE_SKILLS,
  SAMPLE_CALENDAR_DATA 
} from './utils/seducTemplates';
import { computeSeducCellMetrics } from './utils/seducCalendarMetrics';
import { 
  getActiveProfile, 
  saveProfile, 
  DEFAULT_PROFILES,
  loadPlanMetadata,
  savePlanMetadata 
} from './utils/profileStorage';
import { 
  ShieldAlert, 
  Cpu, 
  Table, 
  Sparkles, 
  Download, 
  RotateCcw,
  Lock
} from 'lucide-react';
import { APP_VERSION, APP_VERSION_LABEL } from './config/version';

export default function App() {
  // Pipeline Steps:
  // 1 = Upload
  // 2 = Treinamento / Mapeamento de Células (Setup Wizard)
  // 3 = Validação da Grade Coordenada (MappingViewer)
  // 4 = Processamento Inteligente (Gemini API)
  // 5 = Preenchimento & Download (ExportPreview)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Slots State
  const [slot1, setSlot1] = useState<UploadedSlotFile>({
    file: null,
    name: '',
    size: 0,
    format: 'unknown',
    status: 'empty',
  });

  const [slot2, setSlot2] = useState<UploadedSlotFile>({
    file: null,
    name: '',
    size: 0,
    format: 'unknown',
    status: 'empty',
  });

  const [slot2Guide, setSlot2Guide] = useState<UploadedSlotFile>({
    file: null,
    name: '',
    size: 0,
    format: 'unknown',
    status: 'empty',
  });

  const [slot2Mode, setSlot2Mode] = useState<Slot2DocMode>('scope_only');

  const [slot3, setSlot3] = useState<UploadedSlotFile>({
    file: null,
    name: '',
    size: 0,
    format: 'unknown',
    status: 'empty',
  });

  // Cell-Map Profile State (Initialized from LocalStorage / URE Taubaté)
  const [activeProfile, setActiveProfile] = useState<CellMapProfile>(getActiveProfile());
  const [availableSheets, setAvailableSheets] = useState<string[]>(['Planejamento Preenchido']);
  const [sheetPreviews, setSheetPreviews] = useState<Record<string, SheetRowPreview[]>>({});

  // Parsed Data State
  const [fields, setFields] = useState<MappedField[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>('Planejamento Preenchido');
  const [scopeSkills, setScopeSkills] = useState<ScopeSkill[]>(SAMPLE_SCOPE_SKILLS);
  const [prioritizedPdfSkills, setPrioritizedPdfSkills] = useState<ScopeSkill[]>([]);
  const [pdfExtractedText, setPdfExtractedText] = useState<string>('');
  const [calendarSummary, setCalendarSummary] = useState<CalendarSummary>(SAMPLE_CALENDAR_DATA);

  const [isParsing, setIsParsing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStepAnimation, setProcessStepAnimation] = useState(1);
  const [processPercent, setProcessPercent] = useState<number>(10);
  const [processStatusMessage, setProcessStatusMessage] = useState<string>('');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Final Filled Buffer
  const [filledBuffer, setFilledBuffer] = useState<ArrayBuffer | null>(null);

  // Metadata (persisted in localStorage)
  const [planMetadata, setPlanMetadata] = useState<PlanMetadata>(() => loadPlanMetadata());

  const handleUpdatePlanMetadata = async (updated: PlanMetadata) => {
    const numYear = updated.year ? parseInt(String(updated.year), 10) : (calendarSummary.year || 2026);
    const metrics = computeSeducCellMetrics({
      bimestre: updated.bimestre,
      subject: updated.subject,
      grade: updated.grade,
      plannedClassesInput: updated.plannedClasses,
      calendarData: calendarSummary,
      year: numYear
    });

    const refreshedMeta: PlanMetadata = {
      ...updated,
      diasLetivos: metrics.j7DiasLetivos,
      diasEfetivos: metrics.j9DiasEfetivos
    };

    setPlanMetadata(refreshedMeta);
    savePlanMetadata(refreshedMeta);

    // Sync activeProfile with new parameters
    setActiveProfile(prev => ({
      ...prev,
      classDays: refreshedMeta.classDays || prev.classDays || [4],
      classesPerDay: refreshedMeta.classesPerDay || prev.classesPerDay || 2,
      plannedClasses: Number(refreshedMeta.plannedClasses) || prev.plannedClasses || 16,
      teacherSchedule: {
        classDays: refreshedMeta.classDays || prev.classDays || [4],
        classesPerDay: refreshedMeta.classesPerDay || prev.classesPerDay || 2
      }
    }));

    // Re-evaluate Slot 2 skills dynamically according to the new subject and bimestre
    try {
      let scopeParsed: ScopeSkill[] = [];
      let guideParsed: ScopeSkill[] = [];

      if (slot2.dataBuffer && slot2.format !== 'unknown' && slot2.format !== 'pdf') {
        scopeParsed = await parseScopeSequence(slot2.dataBuffer, slot2.format, updated);
      }
      const pdfBuffer = (slot2Guide.dataBuffer && slot2Guide.format === 'pdf') 
        ? slot2Guide.dataBuffer 
        : (slot2.dataBuffer && slot2.format === 'pdf' ? slot2.dataBuffer : null);

      if (pdfBuffer) {
        let currentText = pdfExtractedText;
        if (!currentText) {
          try {
            currentText = await extractTextFromPdfBuffer(pdfBuffer);
            if (currentText) setPdfExtractedText(currentText);
          } catch (e) {
            console.warn('Erro ao extrair texto do PDF ao atualizar metadados:', e);
          }
        }
        guideParsed = await parsePrioritizedGuidePdf(currentText || pdfBuffer, updated);
        setPrioritizedPdfSkills(guideParsed);
      }

      if (slot2Mode === 'guide_pdf_only' && guideParsed.length > 0) {
        setScopeSkills(guideParsed);
      } else if (slot2Mode === 'both' && guideParsed.length > 0 && scopeParsed.length > 0) {
        setScopeSkills(mergeScopeAndPrioritizedGuide(scopeParsed, guideParsed));
      } else if (scopeParsed.length > 0) {
        setScopeSkills(scopeParsed);
      }
    } catch (err) {
      console.warn('Erro ao atualizar habilidades com novo cabeçalho:', err);
    }
  };

  const isSlot2Fulfilled = 
    slot2Mode === 'scope_only' 
      ? slot2.status === 'ready' 
      : slot2Mode === 'guide_pdf_only' 
      ? (slot2Guide.status === 'ready' || (slot2.status === 'ready' && slot2.format === 'pdf'))
      : (slot2.status === 'ready' && slot2Guide.status === 'ready');

  const allSlotsFilled = slot1.status === 'ready' && isSlot2Fulfilled && slot3.status === 'ready';

  // Handle file uploads into slots
  const handleFileUpload = async (slotNumber: 1 | 2 | 3, file: File, subSlot?: 'scope' | 'guide') => {
    setErrorMessage(null);
    const extension = file.name.split('.').pop()?.toLowerCase() || '';

    let format: UploadedSlotFile['format'] = 'unknown';
    if (['xlsx', 'xls'].includes(extension)) format = 'xlsx';
    else if (['docx', 'doc'].includes(extension)) format = 'docx';
    else if (extension === 'pdf') format = 'pdf';
    else if (extension === 'csv') format = 'csv';
    else if (['png', 'jpg', 'jpeg'].includes(extension)) format = 'image';

    const buffer = await file.arrayBuffer();

    const updatedSlot: UploadedSlotFile = {
      file,
      name: file.name,
      size: file.size,
      format,
      status: 'ready',
      dataBuffer: buffer,
    };

    if (slotNumber === 1) {
      if (!['xlsx', 'docx', 'pdf'].includes(format)) {
        setErrorMessage('O Slot 1 aceita apenas arquivos nos formatos .xlsx, .docx ou PDF editável.');
        return;
      }

      // Inspect Excel sheets immediately
      if (format === 'xlsx') {
        try {
          const inspection = await inspectWorkbook(buffer);
          setAvailableSheets(inspection.sheetNames);
          setSheetPreviews(inspection.previews);
          if (!inspection.sheetNames.includes(activeProfile.targetSheet)) {
            setActiveProfile(prev => ({ ...prev, targetSheet: inspection.defaultSheet }));
          }
        } catch (e) {
          console.warn('Erro ao inspecionar abas:', e);
        }
      }

      updatedSlot.summary = `Formulário Padrão (${format.toUpperCase()}) carregado como matriz`;
      setSlot1(updatedSlot);
    } else if (slotNumber === 2) {
      if (subSlot === 'guide' || (slot2Mode === 'guide_pdf_only' && format === 'pdf')) {
        if (format !== 'pdf') {
          setErrorMessage('O Guia de Habilidades Priorizadas deve ser um arquivo no formato .pdf.');
          return;
        }

        try {
          const rawText = await extractTextFromPdfBuffer(buffer);
          if (rawText) setPdfExtractedText(rawText);

          const guideSkills = await parsePrioritizedGuidePdf(rawText || buffer, planMetadata);
          setPrioritizedPdfSkills(guideSkills);

          updatedSlot.summary = `${guideSkills.length} habilidades priorizadas filtradas (${planMetadata.subject || 'Disciplina'}, ${planMetadata.bimestre || 'Bimestre'})`;

          if (slot2Mode === 'both') {
            setSlot2Guide(updatedSlot);
            if (slot2.status === 'ready') {
              setScopeSkills(mergeScopeAndPrioritizedGuide(scopeSkills, guideSkills));
            } else {
              setScopeSkills(guideSkills);
            }
          } else {
            setSlot2(updatedSlot);
            setScopeSkills(guideSkills);
          }
        } catch (err: any) {
          updatedSlot.summary = 'Guia de Habilidades Priorizadas (.pdf) carregado';
          if (slot2Mode === 'both') setSlot2Guide(updatedSlot);
          else setSlot2(updatedSlot);
        }
      } else {
        // Scope .xlsx or .csv
        if (!['xlsx', 'csv'].includes(format)) {
          setErrorMessage('O Escopo e Sequência aceita apenas arquivos nos formatos .xlsx ou .csv.');
          return;
        }
        try {
          const skills = await parseScopeSequence(buffer, format, planMetadata);
          updatedSlot.summary = `${skills.length} habilidades filtradas para ${planMetadata.subject || 'Disciplina'} (${planMetadata.bimestre || '1º Bim'})`;

          if (slot2Mode === 'both' && slot2Guide.status === 'ready' && prioritizedPdfSkills.length > 0) {
            setScopeSkills(mergeScopeAndPrioritizedGuide(skills, prioritizedPdfSkills));
          } else {
            setScopeSkills(skills);
          }
        } catch (err) {
          updatedSlot.summary = 'Escopo e Sequência carregado com sucesso';
        }
        setSlot2(updatedSlot);
      }
    } else if (slotNumber === 3) {
      try {
        let cal: CalendarSummary | null = null;
        try {
          // Converte buffer para base64 para leitura dinâmica no backend
          const bytes = new Uint8Array(buffer);
          let binary = '';
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk as any);
          }
          const fileBase64 = btoa(binary);

          const resp = await fetch('/api/parse-calendar-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileBase64,
              fileName: file.name,
              fileFormat: format,
              mimeType: file.type
            })
          });

          if (resp.ok) {
            const data = await resp.json();
            if (data.calendar) {
              cal = data.calendar;
            }
          }
        } catch (apiErr) {
          console.warn('Erro na chamada do leitor de calendário no servidor, aplicando leitor local:', apiErr);
        }

        if (!cal) {
          cal = await parseSeducCalendar(buffer, format, file.name);
        }

        setCalendarSummary(cal);

        const detectedYear = cal.year || 2026;
        const bimNum = 4;
        const bimDetails = cal.bimestres?.find(b => b.bimestre === bimNum) || cal.bimestres?.[3];
        const diasLetivos = bimDetails?.diasLetivos || 51;
        const diasEfetivos = bimDetails?.diasEfetivos || 47;

        const updatedMeta: PlanMetadata = {
          ...planMetadata,
          year: String(detectedYear),
          diasLetivos,
          diasEfetivos
        };
        setPlanMetadata(updatedMeta);
        savePlanMetadata(updatedMeta);

        // Sincroniza com o perfil ativo
        setActiveProfile(prev => ({
          ...prev,
          classDays: updatedMeta.classDays || prev.classDays || [4],
          classesPerDay: updatedMeta.classesPerDay || prev.classesPerDay || 2,
          plannedClasses: Number(updatedMeta.plannedClasses) || prev.plannedClasses || 16,
          teacherSchedule: {
            classDays: updatedMeta.classDays || prev.classDays || [4],
            classesPerDay: updatedMeta.classesPerDay || prev.classesPerDay || 2
          }
        }));

        const bimText = bimDetails ? ` • ${bimDetails.bimestre}º Bimestre (${bimDetails.periodo})` : '';
        updatedSlot.summary = `✓ Calendário Lido Automaticamente: Ano ${detectedYear}${bimText}`;
      } catch (err) {
        console.warn('Erro ao carregar calendário:', err);
        updatedSlot.summary = 'Calendário SEDUC-SP carregado com sucesso';
      }
      setSlot3(updatedSlot);
    }
  };

  const handleClearSlot = (slotNumber: 1 | 2 | 3, subSlot?: 'scope' | 'guide') => {
    const emptySlot: UploadedSlotFile = {
      file: null,
      name: '',
      size: 0,
      format: 'unknown',
      status: 'empty',
    };
    if (slotNumber === 1) setSlot1(emptySlot);
    if (slotNumber === 2) {
      if (subSlot === 'guide') {
        setSlot2Guide(emptySlot);
        setPrioritizedPdfSkills([]);
      } else if (subSlot === 'scope') {
        setSlot2(emptySlot);
      } else {
        setSlot2(emptySlot);
        setSlot2Guide(emptySlot);
        setPrioritizedPdfSkills([]);
      }
    }
    if (slotNumber === 3) setSlot3(emptySlot);
    if (currentStep > 1) setCurrentStep(1);
  };

  // Step 1 -> Step 2: Proceed to Training Wizard
  const handleProceedToTraining = async () => {
    if (!slot1.dataBuffer || !slot1.format || slot1.format === 'unknown') {
      setErrorMessage('Arquivo do Slot 1 inválido.');
      return;
    }

    try {
      setIsParsing(true);
      setErrorMessage(null);

      if (slot1.format === 'xlsx') {
        const inspection = await inspectWorkbook(slot1.dataBuffer);
        setAvailableSheets(inspection.sheetNames);
        setSheetPreviews(inspection.previews);
        if (!inspection.sheetNames.includes(activeProfile.targetSheet)) {
          setActiveProfile(prev => ({ ...prev, targetSheet: inspection.defaultSheet }));
        }
      }

      // Sync schedule settings from metadata into active profile
      setActiveProfile(prev => ({
        ...prev,
        classDays: planMetadata.classDays || prev.classDays || [4],
        classesPerDay: planMetadata.classesPerDay || prev.classesPerDay || 2,
        teacherSchedule: {
          classDays: planMetadata.classDays || prev.classDays || [4],
          classesPerDay: planMetadata.classesPerDay || prev.classesPerDay || 2
        }
      }));

      setCurrentStep(2);
    } catch (err: any) {
      console.error('Erro ao inspecionar planilha:', err);
      setErrorMessage(`Erro ao inspecionar planilha: ${err.message}`);
    } finally {
      setIsParsing(false);
    }
  };

  // Step 2 -> Step 3: Apply Cell-Map Profile and generate coordinate grid
  const handleApplyProfile = async (profileToApply: CellMapProfile) => {
    if (!slot1.dataBuffer) {
      setErrorMessage('Arquivo do Slot 1 não encontrado.');
      return;
    }

    try {
      setIsParsing(true);
      setErrorMessage(null);
      setActiveProfile(profileToApply);

      const effectiveMetadata: PlanMetadata = {
        ...planMetadata,
        classDays: profileToApply.classDays || planMetadata.classDays || [4],
        classesPerDay: profileToApply.classesPerDay || planMetadata.classesPerDay || 2,
        teacherSchedule: {
          classDays: profileToApply.classDays || planMetadata.classDays || [4],
          classesPerDay: profileToApply.classesPerDay || planMetadata.classesPerDay || 2
        }
      };
      setPlanMetadata(effectiveMetadata);
      savePlanMetadata(effectiveMetadata);

      const mappingResult = await buildFieldsFromCellMapProfile(
        slot1.dataBuffer,
        profileToApply,
        effectiveMetadata,
        calendarSummary
      );

      setFields(mappingResult.fields);
      setActiveSheet(mappingResult.activeSheet);
      setCurrentStep(3);
    } catch (err: any) {
      console.error('Erro ao mapear por coordenadas:', err);
      setErrorMessage(`Erro no mapeamento por coordenadas: ${err.message}`);
    } finally {
      setIsParsing(false);
    }
  };

  const handleUpdateProfileColumns = async (newColumns: CellMapProfile['columns']) => {
    const updatedProfile = { ...activeProfile, columns: newColumns };
    setActiveProfile(updatedProfile);
    if (slot1.dataBuffer) {
      try {
        const mappingResult = await buildFieldsFromCellMapProfile(
          slot1.dataBuffer,
          updatedProfile,
          planMetadata,
          calendarSummary
        );
        setFields(mappingResult.fields);
        setActiveSheet(mappingResult.activeSheet);
      } catch (err: any) {
        console.warn('Erro ao atualizar colunas mapeadas:', err);
      }
    }
  };

  // Toggle single field confirmation
  const handleToggleField = (fieldId: string) => {
    setFields(prev => prev.map(f => f.id === fieldId ? { ...f, confirmed: !f.confirmed } : f));
  };

  // Toggle all fields confirmation
  const handleToggleAll = (confirmed: boolean) => {
    setFields(prev => prev.map(f => ({ ...f, confirmed })));
  };

  // Step 3 -> Step 4 & 5: Confirm coordinates and inject data via Gemini API
  const handleConfirmAndProcess = async () => {
    const confirmedFields = fields.filter(f => f.confirmed);
    if (confirmedFields.length === 0) {
      setErrorMessage('Selecione pelo menos um campo para preenchimento.');
      return;
    }

    let progressInterval: any = null;
    let safetyTimeoutId: any = null;

    try {
      setCurrentStep(4);
      setIsProcessing(true);
      setErrorMessage(null);
      setProcessStepAnimation(1);
      setProcessPercent(12);
      setElapsedSeconds(0);
      setProcessStatusMessage('Iniciando análise do calendário e matriz curricular...');

      const timer1 = setTimeout(() => {
        setProcessStepAnimation(2);
        setProcessStatusMessage('Calculando dias letivos, feriados e suspensões oficiais...');
      }, 500);
      const timer2 = setTimeout(() => {
        setProcessStepAnimation(3);
        setProcessStatusMessage('Cruzamento curricular em lote único (Batch AI)...');
      }, 1000);

      const startTime = Date.now();
      progressInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setElapsedSeconds(elapsed);
        setProcessPercent(prev => {
          if (prev < 30) return prev + 7;
          if (prev < 65) return prev + 4;
          if (prev < 85) return prev + 2;
          if (prev < 94) return prev + 0.8;
          return prev;
        });
      }, 400);

      // Re-evaluate scope skills against the current planMetadata
      let activeScope = scopeSkills;
      let activeGuideSkills = prioritizedPdfSkills;

      if (slot2.dataBuffer && slot2.format !== 'unknown' && slot2.format !== 'pdf') {
        try {
          const freshSkills = await parseScopeSequence(slot2.dataBuffer, slot2.format, planMetadata);
          if (freshSkills && freshSkills.length > 0) {
            if (slot2Mode === 'both' && activeGuideSkills.length > 0) {
              activeScope = mergeScopeAndPrioritizedGuide(freshSkills, activeGuideSkills);
            } else {
              activeScope = freshSkills;
            }
            setScopeSkills(activeScope);
          }
        } catch (e) {
          console.warn('Erro ao atualizar escopo antes do processamento:', e);
        }
      }

      // Ensure PDF text is available for Gemini and backend pedagogical extraction
      let currentPdfText = pdfExtractedText;
      const pdfBufferToExtract = (slot2Guide.dataBuffer && slot2Guide.format === 'pdf')
        ? slot2Guide.dataBuffer
        : (slot2.dataBuffer && slot2.format === 'pdf' ? slot2.dataBuffer : null);

      if (!currentPdfText && pdfBufferToExtract) {
        try {
          currentPdfText = await extractTextFromPdfBuffer(pdfBufferToExtract);
          if (currentPdfText) setPdfExtractedText(currentPdfText);
        } catch (e) {
          console.warn('Erro ao extrair texto do PDF antes do envio:', e);
        }
      }

      // Timeout de segurança máximo de 24 segundos com AbortController
      const abortController = new AbortController();
      safetyTimeoutId = setTimeout(() => {
        abortController.abort();
      }, 24000);

      let fillsData: any[] = [];
      try {
        const response = await fetch('/api/process-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortController.signal,
          body: JSON.stringify({
            fields: confirmedFields,
            scopeData: activeScope,
            calendarData: calendarSummary,
            planInfo: planMetadata,
            guidePdfText: currentPdfText || pdfExtractedText,
            prioritizedGuideSkills: activeGuideSkills,
            slot2DocMode: slot2Mode
          })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && Array.isArray(data.fills)) {
            fillsData = data.fills;
          }
        }
      } catch (fetchErr: any) {
        console.warn('Requisição de rede demorou ou atingiu contingência, acionando avanço seguro:', fetchErr.message);
      } finally {
        clearTimeout(safetyTimeoutId);
      }

      setProcessStepAnimation(4);
      setProcessPercent(96);
      setProcessStatusMessage('Injetando formatação e finalizando arquivo Excel...');

      // Map generated fills into fields
      const fillsMap = new Map<string, any>();
      fillsData.forEach((fill: any) => {
        fillsMap.set(fill.id, fill);
      });

      const updatedFields = fields.map(f => {
        // Direct priority from planMetadata for header fields
        if (f.id.startsWith('HDR_')) {
          if (f.id.includes('schoolCell') && planMetadata.school) {
            return { ...f, fillValue: planMetadata.school, confirmed: true };
          }
          if (f.id.includes('teacherCell') && planMetadata.teacherName) {
            return { ...f, fillValue: planMetadata.teacherName, confirmed: true };
          }
          if (f.id.includes('subjectCell') && planMetadata.subject) {
            return { ...f, fillValue: planMetadata.subject, confirmed: true };
          }
          if (f.id.includes('gradeCell') && planMetadata.grade) {
            return { ...f, fillValue: planMetadata.grade, confirmed: true };
          }
          if (f.id.includes('bimestreCell') && planMetadata.bimestre) {
            return { ...f, fillValue: planMetadata.bimestre, confirmed: true };
          }
        }

        const fillData = fillsMap.get(f.id);
        if (fillData) {
          return {
            ...f,
            fillValue: fillData.fillValue || f.fillValue,
            justification: fillData.justification || f.justification,
            isSEI: fillData.isSEI !== undefined ? fillData.isSEI : f.isSEI,
            isAvaliacao: fillData.isAvaliacao !== undefined ? fillData.isAvaliacao : f.isAvaliacao,
            isTransferred: fillData.isTransferred !== undefined ? fillData.isTransferred : f.isTransferred,
            holidayReason: fillData.holidayReason || f.holidayReason,
            lessonRange: fillData.lessonRange || f.lessonRange,
            sourcePage: fillData.sourcePage || f.sourcePage,
            sourceReference: fillData.sourceReference || f.sourceReference
          };
        }
        return f;
      });

      setFields(updatedFields);

      // Strict coordinate injection into original file buffer!
      if (slot1.dataBuffer && slot1.format !== 'unknown') {
        const targetSheet = activeProfile.targetSheet || activeSheet;
        const configuredStartRow = Number(activeProfile.startRow) || 16;
        const configuredRowCount = Number(activeProfile.rowCount) || 10;

        // Build fills from updatedFields (confirmed and populated)
        // STRICT RULE: If startRow is configured (e.g. 28), NEVER include weekly grid fields below startRow!
        const fillsToInject = updatedFields
          .filter(f => f.confirmed && f.fillValue)
          .filter(f => {
            const addrUpper = (f.address || '').toUpperCase().trim();
            // NUNCA filtrar campos fixos de avaliação C21:C24 e J21:J24, cabeçalhos ou B17
            if (['C21', 'C22', 'C23', 'C24', 'J21', 'J22', 'J23', 'J24', 'B17'].includes(addrUpper) || f.id.startsWith('EVAL_') || f.id.startsWith('HDR_') || f.injectionMode === 'literal') {
              return true;
            }
            // If field has a row number and is a weekly lesson grid, strictly enforce row >= startRow
            if (f.id.startsWith('GRID_') || f.section?.toLowerCase().includes('semana')) {
              if (f.row < configuredStartRow) {
                return false;
              }
            }
            return true;
          })
          .map(f => ({
            id: f.id,
            address: f.address,
            sheet: f.sheet || targetSheet,
            fillValue: String(f.fillValue || ''),
            row: f.row,
            colLetter: f.colLetter,
            section: f.section
          }));

        const generatedBuffer = await injectDataAndExport(
          slot1.format as 'xlsx' | 'docx' | 'pdf',
          slot1.dataBuffer,
          fillsToInject,
          {
            targetSheetName: targetSheet,
            startRow: configuredStartRow,
            rowCount: configuredRowCount,
            profile: activeProfile,
            planMetadata: planMetadata,
            calendarData: calendarSummary,
            scopeSkills: activeScope || scopeSkills
          }
        );
        setFilledBuffer(generatedBuffer);
      }

      setProcessPercent(100);
      setProcessStatusMessage('Planejamento pronto com sucesso!');

      setTimeout(() => {
        if (progressInterval) clearInterval(progressInterval);
        setIsProcessing(false);
        setCurrentStep(5);
      }, 500);

      clearTimeout(timer1);
      clearTimeout(timer2);

    } catch (err: any) {
      console.warn('Contingência ativada no processamento:', err);
      if (progressInterval) clearInterval(progressInterval);
      if (safetyTimeoutId) clearTimeout(safetyTimeoutId);
      // Avança com segurança para a etapa 5
      setProcessPercent(100);
      setIsProcessing(false);
      setCurrentStep(5);
    }
  };

  // Download filled file
  const handleDownloadFilledFile = async () => {
    setIsDownloading(true);
    try {
      let bufferToDownload = filledBuffer;

      // On-demand generation if buffer is not yet compiled
      if (!bufferToDownload && slot1.dataBuffer && slot1.format !== 'unknown') {
        const targetSheet = activeProfile.targetSheet || activeSheet;
        const configuredStartRow = Number(activeProfile.startRow) || 16;
        const configuredRowCount = Number(activeProfile.rowCount) || 10;

        const fillsToInject = fields
          .filter(f => f.confirmed && f.fillValue)
          .filter(f => {
            if (f.id.startsWith('GRID_') || f.section?.toLowerCase().includes('semana')) {
              if (f.row < configuredStartRow) return false;
            }
            return true;
          })
          .map(f => ({
            id: f.id,
            address: f.address,
            sheet: f.sheet || targetSheet,
            fillValue: String(f.fillValue || ''),
            row: f.row,
            colLetter: f.colLetter,
            section: f.section
          }));

        bufferToDownload = await injectDataAndExport(
          slot1.format as 'xlsx' | 'docx' | 'pdf',
          slot1.dataBuffer,
          fillsToInject,
          {
            targetSheetName: targetSheet,
            startRow: configuredStartRow,
            rowCount: configuredRowCount,
            profile: activeProfile,
            planMetadata: planMetadata,
            calendarData: calendarSummary,
            scopeSkills: scopeSkills
          }
        );
        setFilledBuffer(bufferToDownload);
      }

      if (!bufferToDownload || !slot1.name) {
        setErrorMessage('Buffer preenchido não disponível para download.');
        return;
      }

      const suggestedName = generateSuggestedFileName(fields, slot1.name, slot1.format, planMetadata);
      downloadBlobDirect(bufferToDownload, suggestedName, slot1.format);
    } catch (err: any) {
      setErrorMessage('Erro ao baixar arquivo: ' + err.message);
    } finally {
      setIsDownloading(false);
    }
  };

  // Salvar Como com File System Access API (Google Drive / Pastas Locais / Pendrive)
  const handleSaveAs = async (): Promise<SaveResult | null> => {
    setIsDownloading(true);
    try {
      let bufferToSave = filledBuffer;

      // Geração on-demand se o buffer ainda não estiver compilado
      if (!bufferToSave && slot1.dataBuffer && slot1.format !== 'unknown') {
        const targetSheet = activeProfile.targetSheet || activeSheet;
        const configuredStartRow = Number(activeProfile.startRow) || 16;
        const configuredRowCount = Number(activeProfile.rowCount) || 10;

        const fillsToInject = fields
          .filter(f => f.confirmed && f.fillValue)
          .filter(f => {
            if (f.id.startsWith('GRID_') || f.section?.toLowerCase().includes('semana')) {
              if (f.row < configuredStartRow) return false;
            }
            return true;
          })
          .map(f => ({
            id: f.id,
            address: f.address,
            sheet: f.sheet || targetSheet,
            fillValue: String(f.fillValue || ''),
            row: f.row,
            colLetter: f.colLetter,
            section: f.section
          }));

        bufferToSave = await injectDataAndExport(
          slot1.format as 'xlsx' | 'docx' | 'pdf',
          slot1.dataBuffer,
          fillsToInject,
          {
            targetSheetName: targetSheet,
            startRow: configuredStartRow,
            rowCount: configuredRowCount,
            profile: activeProfile,
            planMetadata: planMetadata,
            calendarData: calendarSummary,
            scopeSkills: scopeSkills
          }
        );
        setFilledBuffer(bufferToSave);
      }

      if (!bufferToSave || !slot1.name) {
        setErrorMessage('Buffer preenchido não disponível para salvar.');
        return null;
      }

      const suggestedName = generateSuggestedFileName(fields, slot1.name, slot1.format, planMetadata);
      return await saveFileWithPicker(bufferToSave, suggestedName, slot1.format);
    } catch (err: any) {
      setErrorMessage('Erro ao salvar arquivo: ' + err.message);
      return null;
    } finally {
      setIsDownloading(false);
    }
  };

  const handleReset = () => {
    setCurrentStep(1);
    setFilledBuffer(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Official Header with Clean Integrated Pipeline Steps */}
      <Header
        currentStep={currentStep}
        onStepClick={(step) => setCurrentStep(step as any)}
        activeProfileName={activeProfile.name}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Error Notification */}
        {errorMessage && (
          <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-xl shadow-xs flex items-start justify-between gap-3 animate-in fade-in">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-rose-900">Atenção no Processamento</h4>
                <p className="text-xs text-rose-700 mt-0.5">{errorMessage}</p>
              </div>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-xs font-bold text-rose-500 hover:text-rose-800 p-1"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Dynamic View According to Current Step */}
        {currentStep === 1 && (
          <UploadSlots
            slot1={slot1}
            slot2={slot2}
            slot2Guide={slot2Guide}
            slot2Mode={slot2Mode}
            onChangeSlot2Mode={setSlot2Mode}
            slot3={slot3}
            calendarData={calendarSummary}
            onFileUpload={handleFileUpload}
            onClearSlot={handleClearSlot}
            onProceedToMapping={handleProceedToTraining}
            allSlotsFilled={allSlotsFilled}
            isParsing={isParsing}
            metadata={planMetadata}
            onChangeMetadata={handleUpdatePlanMetadata}
          />
        )}

        {currentStep === 2 && (
          <TrainingWizard
            availableSheets={availableSheets}
            activeProfile={activeProfile}
            sheetPreviews={sheetPreviews}
            onApplyProfile={handleApplyProfile}
            onBackToUpload={() => setCurrentStep(1)}
          />
        )}

        {currentStep === 3 && (
          <MappingViewer
            fields={fields}
            sheetNames={availableSheets}
            activeSheet={activeSheet}
            profileName={activeProfile.name}
            activeProfile={activeProfile}
            onUpdateProfileColumns={handleUpdateProfileColumns}
            onSelectSheet={setActiveSheet}
            onToggleField={handleToggleField}
            onToggleAll={handleToggleAll}
            onConfirmAndProcess={handleConfirmAndProcess}
            onBackToUpload={() => setCurrentStep(1)}
            onBackToTraining={() => setCurrentStep(2)}
          />
        )}

        {currentStep === 4 && (
          <ProcessingProgress
            progressStep={processStepAnimation}
            totalFieldsCount={fields.filter(f => f.confirmed).length}
            calendarSummary={calendarSummary}
            progressPercent={processPercent}
            statusMessage={processStatusMessage}
            elapsedSeconds={elapsedSeconds}
          />
        )}

        {currentStep === 5 && (
          <ExportPreview
            originalFileName={slot1.name}
            fileFormat={slot1.format as 'xlsx' | 'docx' | 'pdf'}
            fields={fields.filter(f => f.confirmed)}
            sheetNames={availableSheets}
            activeSheet={activeSheet}
            onSelectSheet={setActiveSheet}
            onDownload={handleDownloadFilledFile}
            onSaveAs={handleSaveAs}
            onReset={handleReset}
            isDownloading={isDownloading}
            filledBuffer={filledBuffer}
            planMetadata={planMetadata}
            scopeSkills={scopeSkills}
          />
        )}

        {/* Pedagogical Reference Card & Version Banner */}
        <footer className="bg-slate-100 rounded-xl p-4 text-xs text-slate-500 border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-800">SEDUC-SP AutoPlano</span>
            <span className="font-mono font-bold text-[11px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-300">
              {APP_VERSION} (Freeze Estável)
            </span>
            <span>• Injeção guiada por coordenadas (Cell-Map Profile) para URE Taubaté e Diretorias de Ensino.</span>
          </div>
          <div className="flex items-center gap-3 text-slate-500 text-[11px] flex-wrap">
            <span>Perfil: <strong>{activeProfile.name}</strong></span>
            <span className="flex items-center gap-1 font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              <Lock className="w-3 h-3 text-amber-600" /> Células Fixas: B13, B15 e B17 Imutáveis
            </span>
            <span className="text-emerald-700 font-bold">✓ Base Estável Congelada</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
