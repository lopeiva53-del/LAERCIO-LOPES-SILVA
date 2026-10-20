import React, { useState } from 'react';
import { 
  Cpu, 
  Save, 
  Bookmark, 
  RotateCcw, 
  ShieldCheck, 
  Layers, 
  Table, 
  CheckCircle2, 
  ArrowRight, 
  Info, 
  Sliders, 
  FileCheck,
  MousePointerClick,
  Plus,
  Trash2,
  Combine,
  Unlock,
  Check,
  Sparkles,
  FileText,
  Clock,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { CellMapProfile, ExpectedFieldType, InjectionMode } from '../types/plan';
import { SheetRowPreview, normalizeColLetter, normalizeCoordinate, isColumnDisabled } from '../utils/fileEngine';
import { saveProfile, loadAllProfiles, DEFAULT_PROFILES, resolveCustomMappingMode } from '../utils/profileStorage';

interface TrainingWizardProps {
  availableSheets: string[];
  activeProfile: CellMapProfile;
  sheetPreviews?: Record<string, SheetRowPreview[]>;
  onApplyProfile: (profile: CellMapProfile) => void;
  onBackToUpload: () => void;
}

const COLUMN_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];

export const TrainingWizard: React.FC<TrainingWizardProps> = ({
  availableSheets,
  activeProfile,
  sheetPreviews,
  onApplyProfile,
  onBackToUpload
}) => {
  const [profile, setProfile] = useState<CellMapProfile>({
    ...activeProfile,
    skipRows: activeProfile.skipRows || [],
    customCellMappings: activeProfile.customCellMappings || []
  });

  const [savedProfiles, setSavedProfiles] = useState<CellMapProfile[]>(loadAllProfiles());
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [customProfileName, setCustomProfileName] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Accordion state (default only accordion 1 open)
  const [openAccordions, setOpenAccordions] = useState<{
    dim: boolean;
    schedule: boolean;
    columns: boolean;
    headerAndCells: boolean;
    advancedMenu: boolean;
  }>({
    dim: true,
    schedule: false,
    columns: false,
    headerAndCells: false,
    advancedMenu: false
  });

  const toggleAccordion = (key: keyof typeof openAccordions) => {
    setOpenAccordions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Selected cell in the interactive preview
  const [selectedCellInfo, setSelectedCellInfo] = useState<{
    col: string;
    row: number;
    address: string;
    text: string;
    isMerged: boolean;
    mergeRange?: string;
    masterAddress: string;
  } | null>(null);

  // Manual coordinate input
  const [manualCoord, setManualCoord] = useState('');
  const [manualLabel, setManualLabel] = useState('');
  const [manualType, setManualType] = useState<ExpectedFieldType>('habilidade');
  const [manualMode, setManualMode] = useState<InjectionMode>('literal');

  const selectedSheet = availableSheets.includes(profile.targetSheet) 
    ? profile.targetSheet 
    : availableSheets[0] || profile.targetSheet;

  const currentSheetPreview = sheetPreviews ? sheetPreviews[selectedSheet] : undefined;

  const handleProfileChange = (profileId: string) => {
    const found = savedProfiles.find(p => p.id === profileId);
    if (found) {
      setProfile({
        ...found,
        skipRows: found.skipRows || [],
        customCellMappings: found.customCellMappings || []
      });
      setSaveSuccessMsg(`Perfil "${found.name}" carregado.`);
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    }
  };

  const handleSaveCurrentProfile = () => {
    const updated = saveProfile(profile);
    setSavedProfiles(updated);
    setSaveSuccessMsg(`Perfil "${profile.name}" salvo no LocalStorage.`);
    setTimeout(() => setSaveSuccessMsg(null), 3500);
  };

  const handleSaveAsNewProfile = () => {
    if (!customProfileName.trim()) return;
    const newProf: CellMapProfile = {
      ...profile,
      id: `profile-${Date.now()}`,
      name: customProfileName.trim(),
      description: `Mapeamento personalizado criado em ${new Date().toLocaleDateString('pt-BR')}`,
      isPreset: false
    };
    const updated = saveProfile(newProf);
    setSavedProfiles(updated);
    setProfile(newProf);
    setShowSaveModal(false);
    setCustomProfileName('');
    setSaveSuccessMsg(`Novo perfil "${newProf.name}" salvo com sucesso!`);
    setTimeout(() => setSaveSuccessMsg(null), 3500);
  };

  const handleResetToUreTaubate = () => {
    const ure = DEFAULT_PROFILES[0];
    setProfile({
      ...ure,
      skipRows: [], // Start without blocking any rows so user has 100% freedom!
      customCellMappings: []
    });
    setSaveSuccessMsg('Perfil URE Taubaté restaurado com todas as células liberadas para mapeamento.');
    setTimeout(() => setSaveSuccessMsg(null), 3500);
  };

  // Assign clicked cell to a column or header field
  const assignCellToField = (fieldType: string) => {
    if (!selectedCellInfo) return;
    const safeCol = normalizeColLetter(selectedCellInfo.col);
    const row = selectedCellInfo.row;
    const safeAddress = normalizeCoordinate(selectedCellInfo.address);
    const isMerged = selectedCellInfo.isMerged;
    const mergeRange = selectedCellInfo.mergeRange;

    if (fieldType === 'startRow') {
      setProfile(prev => ({ ...prev, startRow: row }));
      setSaveSuccessMsg(`Linha inicial dos dados definida para Linha ${row}.`);
    } else if (fieldType === 'dateWeekCol') {
      setProfile(prev => ({ ...prev, columns: { ...prev.columns, dateWeekCol: safeCol } }));
      setSaveSuccessMsg(`Coluna Data/Semana mapeada para Coluna ${safeCol}.`);
    } else if (fieldType === 'skillCol') {
      setProfile(prev => ({ ...prev, columns: { ...prev.columns, skillCol: safeCol } }));
      setSaveSuccessMsg(`Coluna Habilidade mapeada para Coluna ${safeCol}.`);
    } else if (fieldType === 'objectivesCol') {
      setProfile(prev => ({ ...prev, columns: { ...prev.columns, objectivesCol: safeCol } }));
      setSaveSuccessMsg(`Coluna Objetivos mapeada para Coluna ${safeCol}.`);
    } else if (fieldType === 'methodologyCol') {
      setProfile(prev => ({ ...prev, columns: { ...prev.columns, methodologyCol: safeCol } }));
      setSaveSuccessMsg(`Coluna Metodologia mapeada para Coluna ${safeCol}.`);
    } else if (fieldType === 'developmentCol') {
      setProfile(prev => ({ ...prev, columns: { ...prev.columns, developmentCol: safeCol } }));
      setSaveSuccessMsg(`Coluna Desenvolvimento da Aula mapeada para Coluna ${safeCol}.`);
    } else if (fieldType === 'assessmentCol') {
      setProfile(prev => ({ ...prev, columns: { ...prev.columns, assessmentCol: safeCol } }));
      setSaveSuccessMsg(`Coluna Avaliação mapeada para Coluna ${safeCol}.`);
    } else if (fieldType === 'recoveryCol') {
      setProfile(prev => ({ ...prev, columns: { ...prev.columns, recoveryCol: safeCol } }));
      setSaveSuccessMsg(`Coluna Ajustes/SEI mapeada para Coluna ${safeCol}.`);
    } else if (fieldType === 'teacherCell') {
      setProfile(prev => ({ ...prev, headerFields: { ...prev.headerFields, teacherCell: safeAddress } }));
      setSaveSuccessMsg(`Célula do Professor mapeada para ${safeAddress}.`);
    } else if (fieldType === 'subjectCell') {
      setProfile(prev => ({ ...prev, headerFields: { ...prev.headerFields, subjectCell: safeAddress } }));
      setSaveSuccessMsg(`Célula da Disciplina mapeada para ${safeAddress}.`);
    } else if (fieldType === 'gradeCell') {
      setProfile(prev => ({ ...prev, headerFields: { ...prev.headerFields, gradeCell: safeAddress } }));
      setSaveSuccessMsg(`Célula da Turma/Série mapeada para ${safeAddress}.`);
    } else if (fieldType === 'bimestreCell') {
      setProfile(prev => ({ ...prev, headerFields: { ...prev.headerFields, bimestreCell: safeAddress } }));
      setSaveSuccessMsg(`Célula do Bimestre mapeada para ${safeAddress}.`);
    } else if (fieldType === 'custom') {
      const existing = profile.customCellMappings || [];
      const cellText = selectedCellInfo.text || `Campo ${safeAddress}`;
      const inferredMode = resolveCustomMappingMode({ address: safeAddress, label: cellText });
      const newCustom = [
        ...existing.filter(c => normalizeCoordinate(c.address) !== safeAddress),
        {
          address: safeAddress,
          label: cellText,
          expectedType: 'habilidade' as ExpectedFieldType,
          mode: inferredMode,
          mergeRange,
          isMerged
        }
      ];
      setProfile(prev => ({ ...prev, customCellMappings: newCustom }));
      setSaveSuccessMsg(`Célula ${safeAddress} adicionada (${inferredMode === 'literal' ? '[Fixo]' : '[IA]'}).`);
    }

    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  // Add manual coordinate directly
  const handleAddManualCoord = () => {
    const rawCoord = String(manualCoord || '').trim().toUpperCase();
    if (!rawCoord) return;
    const addr = normalizeCoordinate(rawCoord);
    const label = String(manualLabel || '').trim() || `Campo Manual ${addr}`;
    const existing = profile.customCellMappings || [];
    const updated = [
      ...existing.filter(c => normalizeCoordinate(c.address) !== addr),
      {
        address: addr,
        label,
        expectedType: manualType,
        mode: manualMode
      }
    ];
    setProfile(prev => ({ ...prev, customCellMappings: updated }));
    setManualCoord('');
    setManualLabel('');
    setSaveSuccessMsg(`Coordenada ${addr} adicionada com modo [${manualMode === 'literal' ? 'Fixo' : 'IA'}]!`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const handleRemoveCustomMapping = (address: any) => {
    const safeAddress = normalizeCoordinate(address);
    setProfile(prev => ({
      ...prev,
      customCellMappings: (prev.customCellMappings || []).filter(c => normalizeCoordinate(c.address) !== safeAddress)
    }));
  };

  // Unblock/Clear all skipRows so user can map absolutely any row
  const handleClearAllBlockedRows = () => {
    setProfile(prev => ({ ...prev, skipRows: [] }));
    setSaveSuccessMsg('Todas as restrições de linhas foram removidas. Todas as células estão liberadas!');
    setTimeout(() => setSaveSuccessMsg(null), 3500);
  };

  // Check if a cell is part of the mapped grid
  const isCellInTrainedGrid = (rowNum: number, col: any) => {
    if (rowNum >= profile.startRow && rowNum < profile.startRow + profile.rowCount) {
      const safeColLetter = normalizeColLetter(col);
      const cols = Object.values(profile.columns || {}).map(c => normalizeColLetter(c));
      return cols.includes(safeColLetter);
    }
    return false;
  };

  const isCellInCustomMappings = (address: any) => {
    const safeAddress = normalizeCoordinate(address);
    return (profile.customCellMappings || []).some(c => normalizeCoordinate(c.address) === safeAddress);
  };

  const isCellInHeaderFields = (address: any) => {
    const safeAddress = normalizeCoordinate(address);
    return Object.values(profile.headerFields || {}).some(h => normalizeCoordinate(h) === safeAddress);
  };

  const currentDays = Array.isArray(profile.classDays) && profile.classDays.length > 0
    ? profile.classDays
    : [4];
  const currentClassesPerDay = Number(profile.classesPerDay) >= 1 && Number(profile.classesPerDay) <= 4
    ? Number(profile.classesPerDay)
    : 2;

  const WEEKDAYS = [
    { day: 1, name: 'Seg', fullName: 'Segunda-feira' },
    { day: 2, name: 'Ter', fullName: 'Terça-feira' },
    { day: 3, name: 'Qua', fullName: 'Quarta-feira' },
    { day: 4, name: 'Qui', fullName: 'Quinta-feira' },
    { day: 5, name: 'Sex', fullName: 'Sexta-feira' },
  ];

  const toggleDay = (dNum: number) => {
    let nextDays: number[];
    if (currentDays.includes(dNum)) {
      nextDays = currentDays.filter(d => d !== dNum);
      if (nextDays.length === 0) nextDays = [dNum];
    } else {
      nextDays = [...currentDays, dNum].sort((a, b) => a - b);
    }
    setProfile(prev => ({
      ...prev,
      classDays: nextDays,
      classesPerDay: currentClassesPerDay,
      teacherSchedule: { classDays: nextDays, classesPerDay: currentClassesPerDay }
    }));
  };

  const setClassesCount = (cnt: number) => {
    setProfile(prev => ({
      ...prev,
      classesPerDay: cnt,
      teacherSchedule: { classDays: currentDays, classesPerDay: cnt }
    }));
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5">
      {/* Header with Title and Mode */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-slate-100 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-[#002B49] text-amber-400 flex items-center justify-center font-bold text-sm shadow-xs">
              <Cpu className="w-4 h-4" />
            </span>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2 flex-wrap">
              Mapeamento de Células
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                <Unlock className="w-3 h-3 text-emerald-600" />
                Livre
              </span>
            </h2>
          </div>
        </div>

        {/* Profile Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <Bookmark className="w-4 h-4 text-slate-500 ml-2" />
            <select
              value={profile.id}
              onChange={(e) => handleProfileChange(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 py-1 px-2 pr-6 rounded-lg focus:outline-none cursor-pointer"
            >
              {savedProfiles.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.isPreset ? '★' : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleResetToUreTaubate}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
            title="Carregar configuração padrão URE Taubaté"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Padrão URE Taubaté
          </button>

          <button
            onClick={handleSaveCurrentProfile}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
          >
            <Save className="w-3.5 h-3.5" /> Salvar Perfil
          </button>

          <button
            onClick={() => setShowSaveModal(true)}
            className="px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Bookmark className="w-3.5 h-3.5 text-amber-600" /> Salvar Como...
          </button>
        </div>
      </div>

      {/* Notification banner */}
      {saveSuccessMsg && (
        <div className="mt-3 p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {saveSuccessMsg}
        </div>
      )}

      {/* Main Grid: Left Accordions & Right Click-to-Map Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-4">
        {/* Left Column: 4 Collapsible Accordions (6 cols) */}
        <div className="lg:col-span-6 space-y-3">
          {/* Accordion 1: Dimensão da Grade */}
          <div className="border border-slate-200 rounded-xl bg-slate-50/50 shadow-2xs overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => toggleAccordion('dim')}
              className="w-full flex items-center justify-between p-3.5 text-left transition-colors hover:bg-slate-100/60 cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#002B49]" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  1. Dimensão da Grade
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-500 font-semibold hidden sm:inline">
                  {profile.targetSheet} • Linha {profile.startRow} • {profile.rowCount} sem.
                </span>
                {openAccordions.dim ? (
                  <ChevronUp className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                )}
              </div>
            </button>

            {openAccordions.dim && (
              <div className="p-3.5 pt-0 border-t border-slate-200/70 mt-1">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-2">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">
                      Aba Alvo:
                    </label>
                    <select
                      value={profile.targetSheet}
                      onChange={(e) => setProfile({ ...profile, targetSheet: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                      {availableSheets.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                      {!availableSheets.includes(profile.targetSheet) && (
                        <option value={profile.targetSheet}>{profile.targetSheet}</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">
                      Linha Inicial:
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={profile.startRow}
                      onChange={(e) => setProfile({ ...profile, startRow: parseInt(e.target.value, 10) || 16 })}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-blue-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">
                      Qtd Semanas:
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={profile.rowCount}
                      onChange={(e) => setProfile({ ...profile, rowCount: parseInt(e.target.value, 10) || 10 })}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Accordion 2: Grade Horária */}
          <div className="border border-slate-200 rounded-xl bg-slate-50/50 shadow-2xs overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => toggleAccordion('schedule')}
              className="w-full flex items-center justify-between p-3.5 text-left transition-colors hover:bg-slate-100/60 cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#002B49]" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  2. Grade Horária
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-blue-900 bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
                  {currentDays.length * currentClassesPerDay} aula{currentDays.length * currentClassesPerDay > 1 ? 's' : ''}/sem
                </span>
                {openAccordions.schedule ? (
                  <ChevronUp className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                )}
              </div>
            </button>

            {openAccordions.schedule && (
              <div className="p-3.5 pt-0 border-t border-slate-200/70 mt-1">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs items-center pt-2">
                  <div className="sm:col-span-8">
                    <label className="block text-slate-600 font-semibold mb-1 text-[11px]">
                      Dias da Semana com Aula:
                    </label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {WEEKDAYS.map(w => {
                        const isChecked = currentDays.includes(w.day);
                        return (
                          <button
                            key={w.day}
                            type="button"
                            onClick={() => toggleDay(w.day)}
                            className={`p-1.5 rounded-lg border text-center transition-all cursor-pointer font-bold text-xs ${
                              isChecked
                                ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                            title={w.fullName}
                          >
                            {w.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-slate-600 font-semibold mb-1 text-[11px]">
                      Aulas por Dia:
                    </label>
                    <select
                      value={currentClassesPerDay}
                      onChange={(e) => setClassesCount(parseInt(e.target.value, 10))}
                      className="w-full bg-white border border-slate-300 rounded-lg p-1.5 font-bold text-slate-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                    >
                      <option value={1}>1 aula</option>
                      <option value={2}>2 aulas (bloco geminado)</option>
                      <option value={3}>3 aulas</option>
                      <option value={4}>4 aulas</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Accordion 3: Colunas da Grade (B, D, E, G, I) */}
          <div className="border border-slate-200 rounded-xl bg-slate-50/50 shadow-2xs overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => toggleAccordion('columns')}
              className="w-full flex items-center justify-between p-3.5 text-left transition-colors hover:bg-slate-100/60 cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <Table className="w-4 h-4 text-[#002B49]" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  3. Colunas da Grade (B, D, E, G, I)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-500 font-bold hidden sm:inline">
                  B, D, E, G, I ativas
                </span>
                {openAccordions.columns ? (
                  <ChevronUp className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                )}
              </div>
            </button>

            {openAccordions.columns && (
              <div className="p-3.5 pt-0 border-t border-slate-200/70 mt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-2">
                  {/* Coluna B: Data/Semana */}
                  <div className={`p-2 rounded-lg border shadow-2xs transition-all ${
                    isColumnDisabled(profile.columns?.dateWeekCol)
                      ? 'bg-amber-50/60 border-amber-300'
                      : 'bg-white border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">Coluna B (Data / Semana):</span>
                      <select
                        value={isColumnDisabled(profile.columns?.dateWeekCol) ? 'NONE' : (normalizeColLetter(profile.columns?.dateWeekCol) || 'B')}
                        onChange={(e) => setProfile({
                          ...profile,
                          columns: { ...profile.columns, dateWeekCol: e.target.value === 'NONE' ? 'NONE' : normalizeColLetter(e.target.value) }
                        })}
                        className={`font-mono font-bold rounded px-2 py-0.5 text-xs border ${
                          isColumnDisabled(profile.columns?.dateWeekCol)
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        <option value="NONE">[-- Desativada --]</option>
                        {COLUMN_LETTERS.map(l => (
                          <option key={l} value={l}>Coluna {l}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Coluna D: Habilidade / AE / Aula */}
                  <div className={`p-2 rounded-lg border shadow-2xs transition-all ${
                    isColumnDisabled(profile.columns?.skillCol)
                      ? 'bg-amber-50/60 border-amber-300'
                      : 'bg-white border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">Coluna D (Habilidade / AE):</span>
                      <select
                        value={isColumnDisabled(profile.columns?.skillCol) ? 'NONE' : (normalizeColLetter(profile.columns?.skillCol) || 'D')}
                        onChange={(e) => setProfile({
                          ...profile,
                          columns: { ...profile.columns, skillCol: e.target.value === 'NONE' ? 'NONE' : normalizeColLetter(e.target.value) }
                        })}
                        className={`font-mono font-bold rounded px-2 py-0.5 text-xs border ${
                          isColumnDisabled(profile.columns?.skillCol)
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        <option value="NONE">[-- Desativada --]</option>
                        {COLUMN_LETTERS.map(l => (
                          <option key={l} value={l}>Coluna {l}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Coluna E: Objetivos de Aprendizagem */}
                  <div className={`p-2 rounded-lg border shadow-2xs transition-all ${
                    isColumnDisabled(profile.columns?.objectivesCol)
                      ? 'bg-amber-50/60 border-amber-300'
                      : 'bg-white border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">Coluna E (Objetivos):</span>
                      <select
                        value={isColumnDisabled(profile.columns?.objectivesCol) ? 'NONE' : (normalizeColLetter(profile.columns?.objectivesCol) || 'E')}
                        onChange={(e) => setProfile({
                          ...profile,
                          columns: { ...profile.columns, objectivesCol: e.target.value === 'NONE' ? 'NONE' : normalizeColLetter(e.target.value) }
                        })}
                        className={`font-mono font-bold rounded px-2 py-0.5 text-xs border ${
                          isColumnDisabled(profile.columns?.objectivesCol)
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        <option value="NONE">[-- Desativada --]</option>
                        {COLUMN_LETTERS.map(l => (
                          <option key={l} value={l}>Coluna {l}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Coluna F: Metodologia */}
                  <div className={`p-2 rounded-lg border shadow-2xs transition-all ${
                    isColumnDisabled(profile.columns?.methodologyCol)
                      ? 'bg-amber-50/60 border-amber-300 ring-1 ring-amber-200'
                      : 'bg-white border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">Coluna F (Metodologia):</span>
                      <select
                        value={isColumnDisabled(profile.columns?.methodologyCol) ? 'NONE' : (normalizeColLetter(profile.columns?.methodologyCol) || 'F')}
                        onChange={(e) => setProfile({
                          ...profile,
                          columns: { ...profile.columns, methodologyCol: e.target.value === 'NONE' ? 'NONE' : normalizeColLetter(e.target.value) }
                        })}
                        className={`font-mono font-bold rounded px-2 py-0.5 text-xs border ${
                          isColumnDisabled(profile.columns?.methodologyCol)
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        <option value="NONE">[-- Em Branco / Desativada --]</option>
                        {COLUMN_LETTERS.map(l => (
                          <option key={l} value={l}>Coluna {l}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Coluna G: Desenvolvimento da Aula */}
                  <div className={`p-2 rounded-lg border shadow-2xs transition-all ${
                    isColumnDisabled(profile.columns?.developmentCol)
                      ? 'bg-amber-50/60 border-amber-300'
                      : 'bg-white border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">Coluna G (Desenvolvimento):</span>
                      <select
                        value={isColumnDisabled(profile.columns?.developmentCol) ? 'NONE' : (normalizeColLetter(profile.columns?.developmentCol) || 'G')}
                        onChange={(e) => setProfile({
                          ...profile,
                          columns: { ...profile.columns, developmentCol: e.target.value === 'NONE' ? 'NONE' : normalizeColLetter(e.target.value) }
                        })}
                        className={`font-mono font-bold rounded px-2 py-0.5 text-xs border ${
                          isColumnDisabled(profile.columns?.developmentCol)
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        <option value="NONE">[-- Desativada --]</option>
                        {COLUMN_LETTERS.map(l => (
                          <option key={l} value={l}>Coluna {l}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Coluna H: Avaliação */}
                  <div className={`p-2 rounded-lg border shadow-2xs transition-all ${
                    isColumnDisabled(profile.columns?.assessmentCol)
                      ? 'bg-amber-50/60 border-amber-300 ring-1 ring-amber-200'
                      : 'bg-white border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">Coluna H (Avaliação):</span>
                      <select
                        value={isColumnDisabled(profile.columns?.assessmentCol) ? 'NONE' : (normalizeColLetter(profile.columns?.assessmentCol) || 'H')}
                        onChange={(e) => setProfile({
                          ...profile,
                          columns: { ...profile.columns, assessmentCol: e.target.value === 'NONE' ? 'NONE' : normalizeColLetter(e.target.value) }
                        })}
                        className={`font-mono font-bold rounded px-2 py-0.5 text-xs border ${
                          isColumnDisabled(profile.columns?.assessmentCol)
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        <option value="NONE">[-- Em Branco / Desativada --]</option>
                        {COLUMN_LETTERS.map(l => (
                          <option key={l} value={l}>Coluna {l}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Coluna I: Ajustes / Recuperação */}
                  <div className={`p-2 rounded-lg border shadow-2xs sm:col-span-2 transition-all ${
                    isColumnDisabled(profile.columns?.recoveryCol)
                      ? 'bg-amber-50/60 border-amber-300 ring-1 ring-amber-200'
                      : 'bg-white border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">Coluna I (Recuperação / SEI):</span>
                      <select
                        value={isColumnDisabled(profile.columns?.recoveryCol) ? 'NONE' : (normalizeColLetter(profile.columns?.recoveryCol) || 'I')}
                        onChange={(e) => setProfile({
                          ...profile,
                          columns: { ...profile.columns, recoveryCol: e.target.value === 'NONE' ? 'NONE' : normalizeColLetter(e.target.value) }
                        })}
                        className={`font-mono font-bold rounded px-2 py-0.5 text-xs border ${
                          isColumnDisabled(profile.columns?.recoveryCol)
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        <option value="NONE">[-- Desativada --]</option>
                        {COLUMN_LETTERS.map(l => (
                          <option key={l} value={l}>Coluna {l}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Accordion 4: Cabeçalho e Células Específicas */}
          <div className="border border-indigo-200 rounded-xl bg-indigo-50/30 shadow-2xs overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => toggleAccordion('headerAndCells')}
              className="w-full flex items-center justify-between p-3.5 text-left transition-colors hover:bg-indigo-100/40 cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-800" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-950">
                  4. Cabeçalho e Células Específicas
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200">
                  {(profile.customCellMappings || []).length} mapeadas
                </span>
                {openAccordions.headerAndCells ? (
                  <ChevronUp className="w-4 h-4 text-indigo-600" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-indigo-600" />
                )}
              </div>
            </button>

            {openAccordions.headerAndCells && (
              <div className="p-3.5 pt-0 border-t border-indigo-200/70 mt-1 space-y-3">
                {/* Bloco A: Coordenadas do Cabeçalho Fixo */}
                <div className="pt-2">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                    Coordenadas do Cabeçalho Fixo (Identificação):
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                    <div>
                      <label className="block text-slate-600 font-medium mb-0.5 text-[11px]">Escola:</label>
                      <input
                        type="text"
                        value={normalizeCoordinate(profile.headerFields?.schoolCell || 'D4')}
                        onChange={(e) => setProfile({
                          ...profile,
                          headerFields: { ...profile.headerFields, schoolCell: normalizeCoordinate(e.target.value) }
                        })}
                        className="w-full bg-white border border-slate-300 rounded p-1 font-mono font-bold text-slate-800 text-center"
                        placeholder="D4"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-medium mb-0.5 text-[11px]">Professor(a):</label>
                      <input
                        type="text"
                        value={normalizeCoordinate(profile.headerFields?.teacherCell || 'D5')}
                        onChange={(e) => setProfile({
                          ...profile,
                          headerFields: { ...profile.headerFields, teacherCell: normalizeCoordinate(e.target.value) }
                        })}
                        className="w-full bg-white border border-slate-300 rounded p-1 font-mono font-bold text-slate-800 text-center"
                        placeholder="D5"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-medium mb-0.5 text-[11px]">Disciplina:</label>
                      <input
                        type="text"
                        value={normalizeCoordinate(profile.headerFields?.subjectCell || 'D6')}
                        onChange={(e) => setProfile({
                          ...profile,
                          headerFields: { ...profile.headerFields, subjectCell: normalizeCoordinate(e.target.value) }
                        })}
                        className="w-full bg-white border border-slate-300 rounded p-1 font-mono font-bold text-slate-800 text-center"
                        placeholder="D6"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-medium mb-0.5 text-[11px]">Turma/Série:</label>
                      <input
                        type="text"
                        value={normalizeCoordinate(profile.headerFields?.gradeCell || 'H5')}
                        onChange={(e) => setProfile({
                          ...profile,
                          headerFields: { ...profile.headerFields, gradeCell: normalizeCoordinate(e.target.value) }
                        })}
                        className="w-full bg-white border border-slate-300 rounded p-1 font-mono font-bold text-slate-800 text-center"
                        placeholder="H5"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-medium mb-0.5 text-[11px]">Bimestre:</label>
                      <input
                        type="text"
                        value={normalizeCoordinate(profile.headerFields?.bimestreCell || 'H6')}
                        onChange={(e) => setProfile({
                          ...profile,
                          headerFields: { ...profile.headerFields, bimestreCell: normalizeCoordinate(e.target.value) }
                        })}
                        className="w-full bg-white border border-slate-300 rounded p-1 font-mono font-bold text-slate-800 text-center"
                        placeholder="H6"
                      />
                    </div>
                  </div>
                </div>

                {/* Bloco B: Mapeamento de Células Específicas / Mescladas */}
                <div className="pt-2 border-t border-indigo-200/50">
                  <span className="text-[11px] font-bold text-indigo-950 uppercase tracking-wider block mb-1.5">
                    Mapeamento de Células Específicas / Mescladas:
                  </span>

                  {/* Mode Selector and Form */}
                  <div className="bg-white p-2.5 rounded-xl border border-indigo-200 shadow-2xs space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-2 border-b border-indigo-100">
                      <span className="text-xs font-bold text-slate-700">
                        Modo de Injeção:
                      </span>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-800">
                          <input
                            type="radio"
                            name="injectionMode"
                            value="literal"
                            checked={manualMode === 'literal'}
                            onChange={() => setManualMode('literal')}
                            className="text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5 text-slate-600" />
                            <span>Texto Fixo</span>
                          </span>
                        </label>

                        <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-800">
                          <input
                            type="radio"
                            name="injectionMode"
                            value="ai_prompt"
                            checked={manualMode === 'ai_prompt'}
                            onChange={() => setManualMode('ai_prompt')}
                            className="text-purple-600 focus:ring-purple-500"
                          />
                          <span className="flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                            <span>Gerar com IA</span>
                          </span>
                        </label>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-2">
                      <input
                        type="text"
                        placeholder="Célula (Ex: J21, B13)"
                        value={manualCoord}
                        onChange={(e) => setManualCoord(e.target.value.toUpperCase())}
                        className="w-full sm:w-28 bg-white border border-indigo-300 rounded-lg p-1.5 font-mono font-bold text-xs text-indigo-950 text-center uppercase"
                      />
                      <input
                        type="text"
                        placeholder={manualMode === 'literal' ? "Texto Fixo (ex: 30%, Prova Paulista, 20%)" : "Orientação para IA (ex: Descrever os instrumentos...)"}
                        value={manualLabel}
                        onChange={(e) => setManualLabel(e.target.value)}
                        className="w-full sm:flex-1 bg-white border border-indigo-300 rounded-lg p-1.5 text-xs text-slate-800"
                      />
                      <select
                        value={manualType}
                        onChange={(e) => setManualType(e.target.value as any)}
                        className="w-full sm:w-auto bg-white border border-indigo-300 rounded-lg p-1.5 text-xs font-semibold text-slate-800"
                      >
                        <option value="habilidade">Habilidade / Conteúdo</option>
                        <option value="objeto_conhecimento">Objetivo / Conhecimento</option>
                        <option value="metodologia">Metodologia</option>
                        <option value="desenvolvimento_aula">Desenvolvimento da Aula</option>
                        <option value="avaliacao">Avaliação</option>
                        <option value="recuperacao_sei">Recuperação / SEI</option>
                        <option value="periodo">Data / Período</option>
                        <option value="identificacao">Identificação</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleAddManualCoord}
                        disabled={!manualCoord.trim()}
                        className="w-full sm:w-auto px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors shadow-2xs"
                      >
                        <Plus className="w-3.5 h-3.5" /> Adicionar
                      </button>
                    </div>
                  </div>

                  {/* List of custom mapped cells */}
                  {profile.customCellMappings && profile.customCellMappings.length > 0 && (
                    <div className="mt-2.5 space-y-1.5 max-h-48 overflow-y-auto">
                      {profile.customCellMappings.map(cm => {
                        const resolvedMode = resolveCustomMappingMode({ address: cm.address, label: cm.label, mode: cm.mode });
                        const isLiteral = resolvedMode === 'literal';

                        return (
                          <div
                            key={cm.address}
                            className="flex items-center justify-between p-2 rounded-lg bg-white border border-indigo-200 text-xs shadow-2xs"
                          >
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="font-mono font-extrabold text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                {cm.address}
                              </span>

                              {/* Mode Badge [Fixo] or [IA] */}
                              {isLiteral ? (
                                <span className="text-[10px] font-extrabold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-300 flex items-center gap-1">
                                  <FileText className="w-3 h-3 text-slate-500" />
                                  [Fixo]
                                </span>
                              ) : (
                                <span className="text-[10px] font-extrabold text-purple-700 bg-purple-100 px-2 py-0.5 rounded border border-purple-300 flex items-center gap-1">
                                  <Sparkles className="w-3 h-3 text-purple-600" />
                                  [IA]
                                </span>
                              )}

                              <span className="font-semibold text-slate-800 truncate max-w-xs" title={cm.label}>
                                {cm.label}
                              </span>

                              {cm.isMerged && (
                                <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200 flex items-center gap-1">
                                  <Combine className="w-2.5 h-2.5" /> {cm.mergeRange || 'Mesclada'}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveCustomMapping(cm.address)}
                              className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer transition-colors shrink-0"
                              title="Remover mapeamento"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Accordion 5: Configurações Avançadas e Proteção de Linhas */}
          <div className="border border-slate-200 rounded-xl bg-slate-50/50 shadow-2xs overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => toggleAccordion('advancedMenu')}
              className="w-full flex items-center justify-between p-3.5 text-left transition-colors hover:bg-slate-100/60 cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-[#002B49]" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  5. Configurações Avançadas e Proteção
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-500 font-bold hidden sm:inline">
                  ExcelJS • Proteção de Fórmulas
                </span>
                {openAccordions.advancedMenu ? (
                  <ChevronUp className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                )}
              </div>
            </button>

            {openAccordions.advancedMenu && (
              <div className="p-3.5 pt-0 border-t border-slate-200/70 mt-1 space-y-2.5 text-xs">
                <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                    <span className="font-bold text-slate-800 block mb-0.5">Proteção de Linhas e Células:</span>
                    <p className="text-[11px] text-slate-600">
                      As linhas reservadas (B13, B15, B17) e fórmulas automáticas (J7, J8, J9) estão integralmente blindadas contra sobrescrita indevida.
                    </p>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                    <span className="font-bold text-slate-800 block mb-0.5">Integridade da Aba:</span>
                    <p className="text-[11px] text-slate-600">
                      Injeção direta na aba ativa <strong className="font-mono text-blue-900">{profile.targetSheet}</strong> com fidelidade estilística e tipográfica SEDUC-SP.
                    </p>
                  </div>
                </div>

                {profile.skipRows && profile.skipRows.length > 0 && (
                  <div className="pt-1 flex items-center justify-between bg-amber-50 p-2 rounded-lg border border-amber-200">
                    <span className="text-[11px] font-bold text-amber-900">
                      Linhas ignoradas configuradas: {profile.skipRows.join(', ')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setProfile({ ...profile, skipRows: [] })}
                      className="px-2 py-0.5 bg-white border border-amber-300 text-amber-900 text-[10px] font-bold rounded hover:bg-amber-100 cursor-pointer"
                    >
                      Liberar Todas as Linhas
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Interactive Visual Click-to-Map Sheet Preview (6 cols) */}
        <div className="lg:col-span-6 flex flex-col">
          <div className="border border-slate-200 rounded-xl bg-slate-900 text-white p-3.5 flex items-center justify-between rounded-b-none">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                <MousePointerClick className="w-3.5 h-3.5" />
                Clique em Qualquer Célula para Mapear
              </span>
              <h4 className="text-xs font-bold text-white mt-0.5">
                Aba: {selectedSheet}
              </h4>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="flex items-center gap-1 text-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Grade Semanal
              </span>
              <span className="flex items-center gap-1 text-purple-300">
                <span className="w-2 h-2 rounded-full bg-purple-400"></span> Mesclada
              </span>
              <span className="flex items-center gap-1 text-sky-300">
                <span className="w-2 h-2 rounded-full bg-sky-400"></span> Cabeçalho
              </span>
            </div>
          </div>

          {/* Quick-Action Bar when a cell is clicked */}
          {selectedCellInfo && (
            <div className="bg-amber-50 border-x border-amber-300 p-3 text-xs animate-in fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-amber-200 mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-extrabold text-slate-900 bg-white px-2 py-0.5 rounded border border-amber-300 text-xs">
                    {selectedCellInfo.address}
                  </span>
                  {selectedCellInfo.isMerged && (
                    <span className="text-[10px] font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded border border-purple-200 flex items-center gap-1">
                      <Combine className="w-3 h-3" />
                      {selectedCellInfo.mergeRange || 'Célula Mesclada'}
                    </span>
                  )}
                  <span className="text-slate-600 truncate max-w-xs text-[11px] italic" title={selectedCellInfo.text}>
                    {selectedCellInfo.text ? `"${selectedCellInfo.text.slice(0, 45)}..."` : '(Vazio)'}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedCellInfo(null)}
                  className="text-xs font-bold text-slate-400 hover:text-slate-700"
                >
                  ✕
                </button>
              </div>

              <div className="text-[11px] font-bold text-slate-700 mb-1.5">
                Atribuir esta célula para:
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => assignCellToField('skillCol')}
                  className="px-2 py-1 rounded bg-white hover:bg-blue-50 border border-slate-300 text-blue-900 font-bold text-[11px] cursor-pointer"
                >
                  Habilidade / AE (Col {selectedCellInfo.col})
                </button>
                <button
                  type="button"
                  onClick={() => assignCellToField('dateWeekCol')}
                  className="px-2 py-1 rounded bg-white hover:bg-blue-50 border border-slate-300 text-blue-900 font-bold text-[11px] cursor-pointer"
                >
                  Data / Semana (Col {selectedCellInfo.col})
                </button>
                <button
                  type="button"
                  onClick={() => assignCellToField('objectivesCol')}
                  className="px-2 py-1 rounded bg-white hover:bg-blue-50 border border-slate-300 text-blue-900 font-bold text-[11px] cursor-pointer"
                >
                  Objetivos (Col {selectedCellInfo.col})
                </button>
                <button
                  type="button"
                  onClick={() => assignCellToField('methodologyCol')}
                  className="px-2 py-1 rounded bg-white hover:bg-blue-50 border border-slate-300 text-blue-900 font-bold text-[11px] cursor-pointer"
                >
                  Metodologia (Col {selectedCellInfo.col})
                </button>
                <button
                  type="button"
                  onClick={() => assignCellToField('developmentCol')}
                  className="px-2 py-1 rounded bg-white hover:bg-blue-50 border border-slate-300 text-blue-900 font-bold text-[11px] cursor-pointer"
                >
                  Desenvolvimento (Col {selectedCellInfo.col})
                </button>
                <button
                  type="button"
                  onClick={() => assignCellToField('assessmentCol')}
                  className="px-2 py-1 rounded bg-white hover:bg-blue-50 border border-slate-300 text-blue-900 font-bold text-[11px] cursor-pointer"
                >
                  Avaliação (Col {selectedCellInfo.col})
                </button>
                <button
                  type="button"
                  onClick={() => assignCellToField('recoveryCol')}
                  className="px-2 py-1 rounded bg-white hover:bg-blue-50 border border-slate-300 text-blue-900 font-bold text-[11px] cursor-pointer"
                >
                  Ajustes / SEI (Col {selectedCellInfo.col})
                </button>
                <button
                  type="button"
                  onClick={() => assignCellToField('teacherCell')}
                  className="px-2 py-1 rounded bg-white hover:bg-sky-50 border border-sky-300 text-sky-900 font-bold text-[11px] cursor-pointer"
                >
                  Professor ({selectedCellInfo.address})
                </button>
                <button
                  type="button"
                  onClick={() => assignCellToField('subjectCell')}
                  className="px-2 py-1 rounded bg-white hover:bg-sky-50 border border-sky-300 text-sky-900 font-bold text-[11px] cursor-pointer"
                >
                  Disciplina ({selectedCellInfo.address})
                </button>
                <button
                  type="button"
                  onClick={() => assignCellToField('startRow')}
                  className="px-2 py-1 rounded bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold text-[11px] cursor-pointer"
                >
                  Linha Inicial = Linha {selectedCellInfo.row}
                </button>
                <button
                  type="button"
                  onClick={() => assignCellToField('custom')}
                  className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] cursor-pointer flex items-center gap-1 shadow-2xs"
                >
                  <Plus className="w-3 h-3" /> Mapear Célula Livre
                </button>
              </div>
            </div>
          )}

          {/* Interactive Cell Matrix */}
          <div className="border-x border-b border-slate-200 rounded-b-xl p-3 bg-slate-50 flex-1 overflow-auto max-h-[580px] text-xs font-mono">
            {currentSheetPreview && currentSheetPreview.length > 0 ? (
              <div className="space-y-1">
                {currentSheetPreview.map(rp => {
                  const isStartRow = rp.rowNum === profile.startRow;

                  return (
                    <div
                      key={rp.rowNum}
                      className={`p-1.5 rounded border transition-all text-[11px] ${
                        isStartRow
                          ? 'bg-blue-100/70 border-blue-400 ring-2 ring-blue-500/20'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-1 border-b border-slate-100 mb-1">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <span>Linha {rp.rowNum}</span>
                          {isStartRow && (
                            <span className="bg-blue-600 text-white text-[9px] px-1.5 py-0.2 rounded font-sans font-bold">
                              INÍCIO DOS DADOS
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => setProfile(prev => ({ ...prev, startRow: rp.rowNum }))}
                          className="text-[10px] text-blue-700 hover:underline font-sans cursor-pointer"
                        >
                          Definir como Início
                        </button>
                      </div>

                      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-1">
                        {rp.cells.filter(c => ['B', 'D', 'E', 'F', 'G', 'H', 'I'].includes(normalizeColLetter(c.col))).map(c => {
                          const isInGrid = isCellInTrainedGrid(rp.rowNum, c.col);
                          const isCustom = isCellInCustomMappings(c.address);
                          const isHeader = isCellInHeaderFields(c.address);
                          const safeAddress = normalizeCoordinate(c.address);
                          const isSelected = selectedCellInfo ? normalizeCoordinate(selectedCellInfo.address) === safeAddress : false;

                          return (
                            <div
                              key={normalizeColLetter(c.col) + '_' + rp.rowNum}
                              onClick={() => setSelectedCellInfo({
                                col: normalizeColLetter(c.col),
                                row: rp.rowNum,
                                address: safeAddress,
                                text: String(c.text || ''),
                                isMerged: c.isMerged,
                                mergeRange: c.mergeRange,
                                masterAddress: normalizeCoordinate(c.masterAddress)
                              })}
                              className={`p-1.5 rounded text-[10px] truncate border cursor-pointer transition-all hover:scale-[1.02] ${
                                isSelected
                                  ? 'ring-2 ring-amber-500 border-amber-500 bg-amber-100 font-extrabold shadow-sm'
                                  : isInGrid
                                  ? 'bg-emerald-100/90 text-emerald-950 border-emerald-400 font-bold'
                                  : isCustom
                                  ? 'bg-indigo-100 text-indigo-950 border-indigo-400 font-bold'
                                  : isHeader
                                  ? 'bg-sky-100 text-sky-950 border-sky-400 font-bold'
                                  : c.isMerged
                                  ? 'bg-purple-50 text-purple-950 border-purple-300'
                                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                              title={`${c.address}: ${c.text || '(vazio)'} ${c.isMerged ? `[${c.mergeRange}]` : ''}`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-extrabold mr-1">{c.address}</span>
                                {c.isMerged && (
                                  <span title={c.mergeRange || 'Mesclada'}>
                                    <Combine className="w-2.5 h-2.5 text-purple-600 shrink-0" />
                                  </span>
                                )}
                              </div>
                              <span className="truncate block opacity-85">{c.text || '–'}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400">
                <Table className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Nenhuma prévia da planilha disponível no momento.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="font-extrabold text-base text-slate-900 mb-1">
              Salvar Perfil de Coordenadas
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Dê um nome para este perfil. Ele ficará salvo no navegador para ser carregado automaticamente em futuros planejamentos.
            </p>
            <input
              type="text"
              value={customProfileName}
              onChange={(e) => setCustomProfileName(e.target.value)}
              placeholder="Ex: Perfil URE Taubaté 2025"
              className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-bold text-slate-900 mb-4 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveAsNewProfile}
                disabled={!customProfileName.trim()}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                Salvar Perfil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Actions */}
      <div className="mt-8 pt-5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
        <button
          onClick={onBackToUpload}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-bold cursor-pointer"
        >
          ← Voltar aos Arquivos
        </button>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => {
              handleSaveCurrentProfile();
              onApplyProfile(profile);
            }}
            className="flex-1 sm:flex-none px-7 py-3 rounded-xl bg-[#002B49] hover:bg-[#003B65] text-white font-extrabold text-sm shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <FileCheck className="w-4 h-4 text-emerald-400" />
            Confirmar Coordenadas e Gerar Grade ({profile.rowCount} Semanas) →
          </button>
        </div>
      </div>
    </div>
  );
};
