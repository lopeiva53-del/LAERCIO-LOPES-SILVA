import React, { useState } from 'react';
import { 
  CheckSquare, 
  Square, 
  Table, 
  Sparkles, 
  Layers, 
  ArrowLeft, 
  CheckCircle2, 
  Info,
  Sliders,
  Calendar,
  BookOpen,
  Cpu,
  Combine,
  FileText,
  Bookmark,
  FileCheck,
  Lock
} from 'lucide-react';
import { MappedField, CellMapProfile } from '../types/plan';
import { FIXED_IMMUTABLE_CELLS } from '../config/version';
import { normalizeColLetter, isColumnDisabled } from '../utils/fileEngine';

interface MappingViewerProps {
  fields: MappedField[];
  sheetNames: string[];
  activeSheet: string;
  profileName?: string;
  activeProfile?: CellMapProfile;
  onUpdateProfileColumns?: (columns: CellMapProfile['columns']) => void;
  onSelectSheet: (sheetName: string) => void;
  onToggleField: (fieldId: string) => void;
  onToggleAll: (confirmed: boolean) => void;
  onConfirmAndProcess: () => void;
  onBackToUpload: () => void;
  onBackToTraining?: () => void;
}

const COLUMN_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];

export const MappingViewer: React.FC<MappingViewerProps> = ({
  fields,
  sheetNames,
  activeSheet,
  profileName = 'Perfil URE Taubaté',
  activeProfile,
  onUpdateProfileColumns,
  onSelectSheet,
  onToggleField,
  onToggleAll,
  onConfirmAndProcess,
  onBackToUpload,
  onBackToTraining
}) => {
  const [viewMode, setViewMode] = useState<'matrix' | 'table'>('matrix');

  // Filter fields for current sheet
  const currentSheetFields = fields.filter(f => f.sheet === activeSheet);
  const totalConfirmed = fields.filter(f => f.confirmed).length;
  const allSelected = fields.length > 0 && totalConfirmed === fields.length;

  // Separate header fields from weekly grid rows
  const headerFields = currentSheetFields.filter(f => f.expectedType === 'identificacao');
  const gridFields = currentSheetFields.filter(f => f.expectedType !== 'identificacao');

  // Group grid fields by row
  const rowsMap = new Map<number, MappedField[]>();
  gridFields.forEach(f => {
    if (!rowsMap.has(f.row)) {
      rowsMap.set(f.row, []);
    }
    rowsMap.get(f.row)!.push(f);
  });
  const sortedRowNumbers = Array.from(rowsMap.keys()).sort((a, b) => a - b);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      {/* Header with Step Info & Prompt Question */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-5 border-b border-slate-100 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#002B49] text-white flex items-center justify-center text-xs font-bold">
              3
            </span>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              Grade Mapeada por Coordenadas
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900 border border-blue-200 flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-blue-700" />
                {profileName}
              </span>
            </h2>
            <span className="bg-emerald-100 text-emerald-800 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-emerald-200">
              {fields.length} células coordenadas
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            As células abaixo correspondem <strong>estritamente às coordenadas treinadas</strong>. Cabeçalhos fixos e instruções pedagógicas estão 100% protegidos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onBackToTraining && (
            <button
              onClick={onBackToTraining}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Sliders className="w-3.5 h-3.5 text-slate-600" /> Ajustar Coordenadas
            </button>
          )}

          <div className="bg-slate-100 p-1 rounded-lg flex items-center text-xs font-medium">
            <button
              onClick={() => setViewMode('matrix')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === 'matrix' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Grade Semanal
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Lista Detalhada ({currentSheetFields.length})
            </button>
          </div>
        </div>
      </div>

      {/* Tabs / Sheets selector if multiple worksheets exist */}
      {sheetNames.length > 1 && (
        <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-2 border-b border-slate-100">
          <span className="text-xs font-bold uppercase text-slate-400 mr-1 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" /> Abas do Arquivo:
          </span>
          {sheetNames.map((sheetName) => {
            const countForSheet = fields.filter(f => f.sheet === sheetName).length;
            const isSelected = activeSheet === sheetName;
            return (
              <button
                key={sheetName}
                onClick={() => onSelectSheet(sheetName)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-[#002B49] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{sheetName}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {countForSheet} células
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Header Identification Box (if mapped in profile) */}
      {headerFields.length > 0 && (
        <div className="mt-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1.5 mb-2">
            <Sliders className="w-3.5 h-3.5 text-[#002B49]" />
            Cabeçalho Fixo (Identificação Institucional)
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {headerFields.map(hf => {
              const addr = (hf.address || '').toUpperCase().trim();
              const isJCell = ['J7', 'J8', 'J9'].includes(addr) || hf.id.includes('diasLetivos') || hf.id.includes('plannedClasses') || hf.id.includes('diasEfetivos');
              return (
                <div key={hf.id} className={`p-2 rounded-lg text-xs transition-all ${
                  isJCell 
                    ? 'bg-blue-50/70 border-2 border-blue-300 shadow-2xs' 
                    : 'bg-white border border-slate-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-600 text-[10px] truncate pr-1" title={hf.label}>{hf.label}:</span>
                    <div className="flex items-center gap-1">
                      {addr === 'J7' && (
                        <span className="text-[9px] font-bold text-blue-800 bg-blue-100 px-1 rounded">
                          Seg-Sex
                        </span>
                      )}
                      <span className={`font-mono font-bold text-[10px] px-1 rounded ${
                        isJCell ? 'bg-[#002B49] text-white' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {hf.address}
                      </span>
                    </div>
                  </div>
                  <p className="font-extrabold text-slate-900 text-[11px] truncate mt-0.5">
                    {hf.fillValue || hf.currentValue || '(A preencher)'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. COLUNAS DA GRADE SEMANAL */}
      {activeProfile && (
        <div className="mt-4 p-4 rounded-xl border border-slate-200 bg-slate-50/70 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 mb-3 border-b border-slate-200 gap-2">
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#002B49] flex items-center gap-1.5">
                <Table className="w-4 h-4 text-[#002B49]" />
                2. COLUNAS DA GRADE SEMANAL
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Selecione <strong>[-- Em Branco / Desativada --]</strong> para ignorar Metodologia, Avaliação, SEI ou qualquer coluna desejada.
              </p>
            </div>
            <span className="text-[10px] font-bold text-slate-700 bg-white px-2 py-1 rounded border border-slate-200 shrink-0">
              Opção: [-- Em Branco / Desativada --]
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
            {/* Metodologia */}
            <div className={`p-2.5 rounded-lg border shadow-2xs transition-all ${
              isColumnDisabled(activeProfile.columns?.methodologyCol)
                ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-200'
                : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-800 text-[11px]">Metodologia:</span>
                <select
                  value={isColumnDisabled(activeProfile.columns?.methodologyCol) ? 'NONE' : (normalizeColLetter(activeProfile.columns?.methodologyCol) || 'F')}
                  onChange={(e) => onUpdateProfileColumns?.({
                    ...activeProfile.columns,
                    methodologyCol: e.target.value === 'NONE' ? 'NONE' : normalizeColLetter(e.target.value)
                  })}
                  className={`font-mono font-bold rounded px-2 py-0.5 text-xs border ${
                    isColumnDisabled(activeProfile.columns?.methodologyCol)
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
              <span className="text-[10px] text-slate-500">
                {isColumnDisabled(activeProfile.columns?.methodologyCol)
                  ? '⚠️ Desativada (estritamente vazia)'
                  : 'Padrão: Coluna F'}
              </span>
            </div>

            {/* Avaliação da Aprendizagem */}
            <div className={`p-2.5 rounded-lg border shadow-2xs transition-all ${
              isColumnDisabled(activeProfile.columns?.assessmentCol)
                ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-200'
                : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-800 text-[11px]">Avaliação da Aprendizagem:</span>
                <select
                  value={isColumnDisabled(activeProfile.columns?.assessmentCol) ? 'NONE' : (normalizeColLetter(activeProfile.columns?.assessmentCol) || 'H')}
                  onChange={(e) => onUpdateProfileColumns?.({
                    ...activeProfile.columns,
                    assessmentCol: e.target.value === 'NONE' ? 'NONE' : normalizeColLetter(e.target.value)
                  })}
                  className={`font-mono font-bold rounded px-2 py-0.5 text-xs border ${
                    isColumnDisabled(activeProfile.columns?.assessmentCol)
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
              <span className="text-[10px] text-slate-500">
                {isColumnDisabled(activeProfile.columns?.assessmentCol)
                  ? '⚠️ Desativada (estritamente vazia)'
                  : 'Padrão: Coluna H'}
              </span>
            </div>

            {/* Ajustes Pedagógicos / Recuperação SEI */}
            <div className={`p-2.5 rounded-lg border shadow-2xs transition-all ${
              isColumnDisabled(activeProfile.columns?.recoveryCol)
                ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-200'
                : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-800 text-[11px]">Ajustes / Recuperação (SEI):</span>
                <select
                  value={isColumnDisabled(activeProfile.columns?.recoveryCol) ? 'NONE' : (normalizeColLetter(activeProfile.columns?.recoveryCol) || 'I')}
                  onChange={(e) => onUpdateProfileColumns?.({
                    ...activeProfile.columns,
                    recoveryCol: e.target.value === 'NONE' ? 'NONE' : normalizeColLetter(e.target.value)
                  })}
                  className={`font-mono font-bold rounded px-2 py-0.5 text-xs border ${
                    isColumnDisabled(activeProfile.columns?.recoveryCol)
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  <option value="NONE">[-- Em Branco / Desativada --]</option>
                  {COLUMN_LETTERS.map(l => (
                    <option key={l} value={l}>Coluna {l}</option>
                  ))}
                </select>
              </div>
              <span className="text-[10px] text-slate-500">
                {isColumnDisabled(activeProfile.columns?.recoveryCol)
                  ? '⚠️ Desativada (estritamente vazia)'
                  : 'Padrão: Coluna I'}
              </span>
            </div>

            {/* Habilidade / AE / Aula */}
            <div className={`p-2.5 rounded-lg border shadow-2xs transition-all ${
              isColumnDisabled(activeProfile.columns?.skillCol)
                ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-200'
                : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-800 text-[11px]">Habilidade / Aula:</span>
                <select
                  value={isColumnDisabled(activeProfile.columns?.skillCol) ? 'NONE' : (normalizeColLetter(activeProfile.columns?.skillCol) || 'D')}
                  onChange={(e) => onUpdateProfileColumns?.({
                    ...activeProfile.columns,
                    skillCol: e.target.value === 'NONE' ? 'NONE' : normalizeColLetter(e.target.value)
                  })}
                  className={`font-mono font-bold rounded px-2 py-0.5 text-xs border ${
                    isColumnDisabled(activeProfile.columns?.skillCol)
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
              <span className="text-[10px] text-slate-500">
                {isColumnDisabled(activeProfile.columns?.skillCol)
                  ? '⚠️ Desativada (estritamente vazia)'
                  : 'Padrão: Coluna D'}
              </span>
            </div>

            {/* Objetivos de Aprendizagem */}
            <div className={`p-2.5 rounded-lg border shadow-2xs transition-all ${
              isColumnDisabled(activeProfile.columns?.objectivesCol)
                ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-200'
                : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-800 text-[11px]">Objetivos:</span>
                <select
                  value={isColumnDisabled(activeProfile.columns?.objectivesCol) ? 'NONE' : (normalizeColLetter(activeProfile.columns?.objectivesCol) || 'E')}
                  onChange={(e) => onUpdateProfileColumns?.({
                    ...activeProfile.columns,
                    objectivesCol: e.target.value === 'NONE' ? 'NONE' : normalizeColLetter(e.target.value)
                  })}
                  className={`font-mono font-bold rounded px-2 py-0.5 text-xs border ${
                    isColumnDisabled(activeProfile.columns?.objectivesCol)
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
              <span className="text-[10px] text-slate-500">
                {isColumnDisabled(activeProfile.columns?.objectivesCol)
                  ? '⚠️ Desativada (estritamente vazia)'
                  : 'Padrão: Coluna E'}
              </span>
            </div>

            {/* Desenvolvimento da Aula */}
            <div className={`p-2.5 rounded-lg border shadow-2xs transition-all ${
              isColumnDisabled(activeProfile.columns?.developmentCol)
                ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-200'
                : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-800 text-[11px]">Desenvolvimento:</span>
                <select
                  value={isColumnDisabled(activeProfile.columns?.developmentCol) ? 'NONE' : (normalizeColLetter(activeProfile.columns?.developmentCol) || 'G')}
                  onChange={(e) => onUpdateProfileColumns?.({
                    ...activeProfile.columns,
                    developmentCol: e.target.value === 'NONE' ? 'NONE' : normalizeColLetter(e.target.value)
                  })}
                  className={`font-mono font-bold rounded px-2 py-0.5 text-xs border ${
                    isColumnDisabled(activeProfile.columns?.developmentCol)
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
              <span className="text-[10px] text-slate-500">
                {isColumnDisabled(activeProfile.columns?.developmentCol)
                  ? '⚠️ Desativada (estritamente vazia)'
                  : 'Padrão: Coluna G'}
              </span>
            </div>

            {/* Data / Semana */}
            <div className={`p-2.5 rounded-lg border shadow-2xs transition-all ${
              isColumnDisabled(activeProfile.columns?.dateWeekCol)
                ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-200'
                : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-800 text-[11px]">Data / Semana:</span>
                <select
                  value={isColumnDisabled(activeProfile.columns?.dateWeekCol) ? 'NONE' : (normalizeColLetter(activeProfile.columns?.dateWeekCol) || 'B')}
                  onChange={(e) => onUpdateProfileColumns?.({
                    ...activeProfile.columns,
                    dateWeekCol: e.target.value === 'NONE' ? 'NONE' : normalizeColLetter(e.target.value)
                  })}
                  className={`font-mono font-bold rounded px-2 py-0.5 text-xs border ${
                    isColumnDisabled(activeProfile.columns?.dateWeekCol)
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
              <span className="text-[10px] text-slate-500">
                {isColumnDisabled(activeProfile.columns?.dateWeekCol)
                  ? '⚠️ Desativada (estritamente vazia)'
                  : 'Padrão: Coluna B'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Painel de Auditoria das Células Fixas Imutáveis B13, B15 e B17 */}
      <div className="mt-4 p-3.5 bg-gradient-to-br from-amber-50/70 via-white to-slate-50 border-2 border-amber-300 rounded-xl shadow-2xs">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#002B49] flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-amber-700" />
            Células Fixas Imutáveis (B13, B15 e B17) • Bloqueio de IA
          </h4>
          <span className="text-[10px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
            Texto Fixo Imutável • ExcelJS
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {Object.values(FIXED_IMMUTABLE_CELLS).map((item) => (
            <div key={item.address} className="bg-white p-3 rounded-lg border border-amber-200 shadow-2xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-extrabold text-[#002B49] text-xs flex items-center gap-1.5">
                  <span className="font-mono bg-[#002B49] text-white px-1.5 py-0.5 rounded text-[10px] font-bold">
                    {item.address}
                  </span>
                  {item.label}
                </span>
                <span className="text-[9px] font-bold text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-0.5">
                  <Lock className="w-2.5 h-2.5 text-amber-700" /> {item.tag}
                </span>
              </div>
              <p className="text-[11px] text-slate-700 leading-relaxed font-medium">
                "{item.text}"
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Preservation Assurance Badge */}
      <div className="mt-4 bg-blue-50/80 border border-blue-200 rounded-xl p-3 flex items-start sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-2.5">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5 sm:mt-0" />
          <div className="text-xs text-blue-900">
            <span className="font-bold">Injeção Confinada por Coordenadas:</span> Nenhuma célula de instrução (ex: B13-B15) ou cabeçalho superior será modificada. Apenas as colunas treinadas da grade semanal receberão dados.
          </div>
        </div>
        <div className="text-xs font-semibold text-blue-800 bg-white px-2 py-0.5 rounded border border-blue-200 shrink-0">
          ExcelJS Coordinate Safe
        </div>
      </div>

      {/* The Central Question Box Required by Step */}
      <div className="mt-5 p-4 rounded-xl bg-amber-50/80 border-2 border-amber-300 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 font-extrabold text-lg shadow-sm">
            ?
          </div>
          <div>
            <h3 className="font-extrabold text-amber-950 text-base">
              Confirmar campos para preenchimento?
            </h3>
            <p className="text-xs text-amber-800 mt-0.5">
              {totalConfirmed} de {fields.length} coordenadas selecionadas para injeção via Gemini API e Calendário SEDUC.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <button
            onClick={() => onToggleAll(!allSelected)}
            className="px-3 py-2 rounded-lg bg-white border border-amber-300 text-amber-900 text-xs font-bold hover:bg-amber-100/50 transition-colors cursor-pointer"
          >
            {allSelected ? 'Desmarcar Todos' : 'Marcar Todos'}
          </button>
          <button
            onClick={onConfirmAndProcess}
            disabled={totalConfirmed === 0}
            className="flex-1 sm:flex-none px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-extrabold shadow-md hover:shadow-emerald-600/20 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-4 h-4" />
            Sim, Confirmar e Injetar Dados
          </button>
        </div>
      </div>

      {/* Main Interactive Mapping Body */}
      <div className="mt-6">
        {viewMode === 'matrix' ? (
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
            <div className="bg-slate-100 p-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Table className="w-4 h-4 text-[#002B49]" />
                Grade Semanal Treinada: <strong className="text-[#002B49]">{activeSheet}</strong>
              </span>
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-[#FEF3C7] border border-amber-400"></span>
                  Semana SEI (Recuperação)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-[#E0F2FE] border border-sky-400"></span>
                  Semana Avaliação (Prova Paulista)
                </span>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[500px] p-4">
              <div className="space-y-3 min-w-[760px]">
                {sortedRowNumbers.map(rowNum => {
                  const rowFields = rowsMap.get(rowNum) || [];
                  const isSEIRow = rowFields.some(f => f.isSEI);
                  const isAvalRow = rowFields.some(f => f.isAvaliacao);
                  const weekNum = rowFields[0]?.weekNumber || 1;

                  return (
                    <div 
                      key={rowNum}
                      className={`p-3.5 rounded-xl border transition-all ${
                        isSEIRow
                          ? 'bg-amber-50/80 border-amber-300 shadow-2xs'
                          : isAvalRow
                          ? 'bg-sky-50/80 border-sky-300 shadow-2xs'
                          : 'bg-white border-slate-200 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-100 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-200 font-mono text-[11px]">
                            Linha {rowNum}
                          </span>
                          <span className="font-bold text-slate-900">
                            Semana {weekNum} de Aula
                          </span>
                          {isSEIRow && (
                            <span className="bg-amber-500 text-slate-950 text-[10px] font-extrabold px-2 py-0.5 rounded shadow-2xs">
                              RESERVA SEI / RECUPERAÇÃO
                            </span>
                          )}
                          {isAvalRow && (
                            <span className="bg-sky-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded shadow-2xs">
                              PROVA PAULISTA / AVALIAÇÃO OFICIAL
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {rowFields.length} colunas mapeadas
                        </span>
                      </div>

                      {/* Display the trained columns in this row */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {rowFields.map(field => {
                          const origColor = field.originalStyle?.fillColor || '#ffffff';

                          return (
                            <div
                              key={field.id}
                              onClick={() => onToggleField(field.id)}
                              className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all flex items-start gap-2 ${
                                field.confirmed
                                  ? 'border-blue-400 bg-blue-50/40 shadow-2xs'
                                  : 'border-slate-200 bg-slate-50 opacity-60'
                              }`}
                              style={{
                                borderLeftWidth: '4px',
                                borderLeftColor: isSEIRow ? '#D97706' : isAvalRow ? '#0284C7' : '#002B49'
                              }}
                            >
                              <div className="mt-0.5">
                                {field.confirmed ? (
                                  <CheckSquare className="w-4 h-4 text-[#002B49]" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-400" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1">
                                    <span className="font-mono font-extrabold text-blue-900 text-[11px]">
                                      {field.address}
                                    </span>
                                    {field.isDisabled || field.disabledByUser ? (
                                      <span className="text-[9px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300 flex items-center gap-0.5" title="Coluna Desativada pelo Usuário">
                                        [-- Em Branco / Desativada --]
                                      </span>
                                    ) : field.isImmutableFixed || ['B13', 'B15', 'B17'].includes(field.address) ? (
                                      <span className="text-[9px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300 flex items-center gap-0.5" title="Texto Fixo Imutável">
                                        <Lock className="w-2.5 h-2.5 text-amber-700" /> Texto Fixo Imutável
                                      </span>
                                    ) : field.injectionMode === 'literal' ? (
                                      <span className="text-[9px] font-bold text-slate-700 bg-slate-100 px-1 rounded border border-slate-300 flex items-center gap-0.5" title="Texto Fixo / Literal">
                                        <FileText className="w-2.5 h-2.5 text-slate-500" /> [Fixo]
                                      </span>
                                    ) : field.injectionMode === 'ai_prompt' ? (
                                      <span className="text-[9px] font-bold text-purple-700 bg-purple-100 px-1 rounded border border-purple-300 flex items-center gap-0.5" title="Gerar com IA via Descritivo">
                                        <Sparkles className="w-2.5 h-2.5 text-purple-600" /> [IA]
                                      </span>
                                    ) : null}
                                    {field.isMerged && (
                                      <span className="text-[9px] font-bold text-purple-700 bg-purple-50 px-1 rounded border border-purple-200 flex items-center gap-0.5" title={field.mergeRange || 'Célula Mesclada'}>
                                        <Combine className="w-2.5 h-2.5" /> Mesclada
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] uppercase font-semibold text-slate-400">
                                    Col {field.colLetter || field.address.replace(/\d+/g, '')}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-800 font-medium truncate mt-0.5" title={field.label}>
                                  {field.label.replace(/\(Col .*\)/, '')}
                                </p>
                                {field.isDisabled || field.disabledByUser ? (
                                  <p className="text-[10px] text-amber-800 font-bold truncate mt-0.5">
                                    (Não preenchida / Desativada pelo usuário)
                                  </p>
                                ) : field.currentValue ? (
                                  <p className="text-[10px] text-slate-500 truncate italic mt-0.5" title={field.currentValue}>
                                    Atual: {field.currentValue}
                                  </p>
                                ) : null}

                                {/* Rastreabilidade de Origem (PDF / Base Oficial) */}
                                {(() => {
                                  const weekNum = field.weekNumber || (field.row && field.row >= 28 ? field.row - 27 : 1);
                                  const startClass = (weekNum * 2) - 1;
                                  const endClass = weekNum * 2;
                                  const classText = field.lessonRange || `Aulas ${startClass} e ${endClass}`;

                                  if (field.sourcePage) {
                                    const badgeText = field.sourceReference && field.sourceReference.toLowerCase().includes('aula')
                                      ? field.sourceReference
                                      : `${classText} • Pág. ${field.sourcePage} - Guia Priorizado PDF`;

                                    return (
                                      <div className="mt-1.5 flex items-center gap-1">
                                        <span 
                                          className="inline-flex items-center gap-1 text-[9px] font-bold text-sky-800 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200"
                                          title={`Origem: Extraído da página ${field.sourcePage} da seção Escopo e Sequência do Guia Priorizado (${classText}).`}
                                        >
                                          <FileText className="w-2.5 h-2.5 text-sky-600 shrink-0" />
                                          📄 {badgeText}
                                        </span>
                                      </div>
                                    );
                                  }

                                  const badgeText = field.sourceReference && field.sourceReference.toLowerCase().includes('aula')
                                    ? field.sourceReference
                                    : `${classText} • ${field.sourceReference || 'Base Curricular Oficial SEDUC-SP'}`;

                                  return (
                                    <div className="mt-1.5 flex items-center gap-1">
                                      <span 
                                        className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200"
                                        title={badgeText}
                                      >
                                        <BookOpen className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                        📚 {badgeText}
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#002B49] text-white sticky top-0 z-10">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(e) => onToggleAll(e.target.checked)}
                        className="rounded"
                      />
                    </th>
                    <th className="p-3">Coordenada Exata</th>
                    <th className="p-3">Coluna Treinada</th>
                    <th className="p-3">Semana / Linha</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Origem / Rastreabilidade</th>
                    <th className="p-3">Valor Atual na Planilha</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentSheetFields.map((field) => (
                    <tr 
                      key={field.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        field.confirmed ? 'bg-white' : 'bg-slate-50/50 opacity-60'
                      }`}
                    >
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={field.confirmed}
                          onChange={() => onToggleField(field.id)}
                          className="rounded cursor-pointer"
                        />
                      </td>
                      <td className="p-3 font-mono font-extrabold text-blue-900">
                        {field.sheet} • <span className="bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded">{field.address}</span>
                        {field.isDisabled || field.disabledByUser ? (
                          <span className="ml-1.5 text-[9px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300 inline-flex items-center gap-0.5">
                            [-- Em Branco / Desativada --]
                          </span>
                        ) : field.isImmutableFixed || ['B13', 'B15', 'B17'].includes(field.address) ? (
                          <span className="ml-1.5 text-[9px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300 inline-flex items-center gap-0.5">
                            <Lock className="w-2.5 h-2.5 text-amber-700" /> Texto Fixo Imutável
                          </span>
                        ) : field.injectionMode === 'literal' ? (
                          <span className="ml-1.5 text-[9px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-300 inline-flex items-center gap-0.5">
                            <FileText className="w-2.5 h-2.5 text-slate-500" /> [Fixo]
                          </span>
                        ) : field.injectionMode === 'ai_prompt' ? (
                          <span className="ml-1.5 text-[9px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded border border-purple-300 inline-flex items-center gap-0.5">
                            <Sparkles className="w-2.5 h-2.5 text-purple-600" /> [IA]
                          </span>
                        ) : null}
                        {field.isMerged && (
                          <span className="ml-1.5 text-[9px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 inline-flex items-center gap-0.5">
                            <Combine className="w-2.5 h-2.5" /> {field.mergeRange || 'Mesclada'}
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-semibold text-slate-800">
                        {field.label}
                      </td>
                      <td className="p-3 text-slate-600">
                        Linha {field.row} {field.weekNumber ? `(Semana ${field.weekNumber})` : ''}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold uppercase">
                          {field.expectedType}
                        </span>
                      </td>
                      <td className="p-3">
                        {(() => {
                          const weekNum = field.weekNumber || (field.row && field.row >= 28 ? field.row - 27 : 1);
                          const startClass = (weekNum * 2) - 1;
                          const endClass = weekNum * 2;
                          const classText = field.lessonRange || `Aulas ${startClass} e ${endClass}`;

                          if (field.sourcePage) {
                            const badgeText = field.sourceReference && field.sourceReference.toLowerCase().includes('aula')
                              ? field.sourceReference
                              : `${classText} • Pág. ${field.sourcePage} - Guia Priorizado PDF`;
                            return (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200" title={`Extraído da pág. ${field.sourcePage} do Guia Priorizado (${classText})`}>
                                <FileText className="w-3 h-3 text-sky-600 shrink-0" />
                                📄 {badgeText}
                              </span>
                            );
                          }

                          const badgeText = field.sourceReference && field.sourceReference.toLowerCase().includes('aula')
                            ? field.sourceReference
                            : `${classText} • ${field.sourceReference || 'Base Curricular Oficial SEDUC-SP'}`;
                          return (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200" title={badgeText}>
                              <BookOpen className="w-3 h-3 text-emerald-600 shrink-0" />
                              📚 {badgeText}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="p-3 text-slate-600 max-w-xs truncate" title={field.currentValue || ''}>
                        {field.isDisabled || field.disabledByUser ? (
                          <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            (Não preenchida / Desativada pelo usuário)
                          </span>
                        ) : field.currentValue ? (
                          <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {field.currentValue}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Vazio</span>
                        )}
                      </td>
                      <td className="p-3">
                        {field.confirmed ? (
                          <span className="text-emerald-700 font-bold flex items-center gap-1 text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Confirmado
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Ignorado</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Footer */}
      <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
        <button
          onClick={onBackToUpload}
          className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar aos Arquivos
        </button>

        <button
          onClick={onConfirmAndProcess}
          disabled={totalConfirmed === 0}
          className="px-6 py-2.5 rounded-xl bg-[#002B49] hover:bg-[#003B65] text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
          Confirmar e Iniciar Processamento Inteligente ({totalConfirmed} campos) →
        </button>
      </div>
    </div>
  );
};
