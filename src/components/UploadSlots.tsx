import React, { useRef } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  FileText, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  FileCheck, 
  RefreshCw,
  Building2,
  User,
  BookOpen,
  Users,
  Check,
  Layers,
  Sparkles,
  Clock
} from 'lucide-react';
import { UploadedSlotFile, PlanMetadata, Slot2DocMode, CalendarSummary } from '../types/plan';
import { computeSeducCellMetrics, generateTeacherClassSchedule } from '../utils/seducCalendarMetrics';

interface UploadSlotsProps {
  slot1: UploadedSlotFile;
  slot2: UploadedSlotFile;
  slot2Guide?: UploadedSlotFile;
  slot2Mode: Slot2DocMode;
  onChangeSlot2Mode: (mode: Slot2DocMode) => void;
  slot3: UploadedSlotFile;
  calendarData?: CalendarSummary;
  onFileUpload: (slotNumber: 1 | 2 | 3, file: File, subSlot?: 'scope' | 'guide') => void;
  onClearSlot: (slotNumber: 1 | 2 | 3, subSlot?: 'scope' | 'guide') => void;
  onProceedToMapping: () => void;
  allSlotsFilled: boolean;
  isParsing: boolean;
  metadata: PlanMetadata;
  onChangeMetadata: (metadata: PlanMetadata) => void;
}

export const UploadSlots: React.FC<UploadSlotsProps> = ({
  slot1,
  slot2,
  slot2Guide,
  slot2Mode,
  onChangeSlot2Mode,
  slot3,
  calendarData,
  onFileUpload,
  onClearSlot,
  onProceedToMapping,
  allSlotsFilled,
  isParsing,
  metadata,
  onChangeMetadata
}) => {
  const fileInputRef1 = useRef<HTMLInputElement>(null);
  const fileInputRef2Scope = useRef<HTMLInputElement>(null);
  const fileInputRef2Guide = useRef<HTMLInputElement>(null);
  const fileInputRef3 = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent, slotNumber: 1 | 2 | 3, subSlot?: 'scope' | 'guide') => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileUpload(slotNumber, e.dataTransfer.files[0], subSlot);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const isSlot2Ready = 
    slot2Mode === 'scope_only' 
      ? slot2.status === 'ready' 
      : slot2Mode === 'guide_pdf_only' 
      ? (slot2Guide?.status === 'ready' || slot2.status === 'ready')
      : (slot2.status === 'ready' && slot2Guide?.status === 'ready');

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-5 border-b border-slate-100 gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#002B49] text-white flex items-center justify-center text-xs font-bold">
              1
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              Etapa de Upload: Slots Obrigatórios
            </h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Carregue seus arquivos originais. O sistema utilizará o arquivo do <strong>Slot 1</strong> como base imutável, preenchendo somente as células necessárias.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
            allSlotsFilled 
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            {allSlotsFilled ? 'Todos os slots preenchidos' : 'Aguardando arquivos obrigatórios'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Slot 1: Formulário Padrão */}
        <div 
          onDrop={(e) => handleDrop(e, 1)}
          onDragOver={handleDragOver}
          className={`flex flex-col rounded-xl border-2 transition-all p-5 relative ${
            slot1.status === 'ready'
              ? 'border-emerald-400 bg-emerald-50/20 shadow-sm'
              : 'border-dashed border-slate-300 hover:border-[#005A9C] bg-slate-50/50'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-100 text-[#002B49]">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                  Slot 1 • Alvo Principal
                </span>
                <h3 className="font-bold text-slate-900 text-sm mt-0.5">Formulário Padrão</h3>
              </div>
            </div>
            {slot1.status === 'ready' && (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            )}
          </div>

          <p className="text-xs text-slate-600 mb-4 flex-grow">
            Plano de Ensino, Guia de Aprendizagem ou modelo institucional da SEDUC-SP (.xlsx, .docx ou PDF editável).
          </p>

          <input
            type="file"
            ref={fileInputRef1}
            onChange={(e) => e.target.files?.[0] && onFileUpload(1, e.target.files[0])}
            accept=".xlsx,.docx,.pdf"
            className="hidden"
          />

          {slot1.status === 'ready' ? (
            <div className="bg-white rounded-lg p-3 border border-emerald-200 shadow-xs mb-3">
              <div className="flex items-start justify-between">
                <div className="truncate pr-2">
                  <p className="text-xs font-bold text-slate-800 truncate" title={slot1.name}>
                    {slot1.name}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {formatFileSize(slot1.size)} • <span className="uppercase font-semibold text-emerald-700">{slot1.format}</span>
                  </p>
                  {slot1.summary && (
                    <p className="text-[11px] text-emerald-700 mt-1 font-medium">
                      ✓ {slot1.summary}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onClearSlot(1)}
                  className="text-xs text-slate-400 hover:text-rose-600 p-1"
                  title="Remover arquivo"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div 
              onClick={() => fileInputRef1.current?.click()}
              className="border border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:bg-blue-50/50 transition-colors mb-3"
            >
              <Upload className="w-7 h-7 text-slate-400 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-700">
                Arraste ou clique para selecionar
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Suporta: .xlsx (Recomendado), .docx, .pdf
              </p>
            </div>
          )}

          <div className="text-[11px] text-slate-500 bg-slate-100/70 p-2 rounded border border-slate-200">
            <strong>Regra Estrita:</strong> 100% da formatação original será preservada. Apenas as células vazias identificadas serão preenchidas.
          </div>
        </div>

        {/* Slot 2: Documentos de Referência Flexíveis (Escopo .xlsx / Guia Priorizado .pdf / Ambos) */}
        <div 
          className={`flex flex-col rounded-xl border-2 transition-all p-5 relative ${
            isSlot2Ready
              ? 'border-emerald-400 bg-emerald-50/20 shadow-sm'
              : 'border-dashed border-slate-300 hover:border-[#005A9C] bg-slate-50/50'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-100 text-amber-800">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                  Slot 2 • Conteúdos & Habilidades
                </span>
                <h3 className="font-bold text-slate-900 text-sm mt-0.5">
                  Documento de Referência
                </h3>
              </div>
            </div>
            {isSlot2Ready && (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            )}
          </div>

          {/* Seletor de Modo de Documento */}
          <div className="my-2.5 bg-slate-100/80 p-1.5 rounded-lg border border-slate-200">
            <label className="block text-[11px] font-bold text-slate-600 mb-1 px-1">
              Tipo de Documento de Referência:
            </label>
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => onChangeSlot2Mode('scope_only')}
                className={`text-[10px] sm:text-[11px] font-semibold py-1.5 px-1 rounded-md text-center transition-all ${
                  slot2Mode === 'scope_only'
                    ? 'bg-amber-600 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                Apenas Escopo (.xlsx/.csv)
              </button>
              <button
                type="button"
                onClick={() => onChangeSlot2Mode('guide_pdf_only')}
                className={`text-[10px] sm:text-[11px] font-semibold py-1.5 px-1 rounded-md text-center transition-all ${
                  slot2Mode === 'guide_pdf_only'
                    ? 'bg-rose-700 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                Guia Priorizado (.pdf)
              </button>
              <button
                type="button"
                onClick={() => onChangeSlot2Mode('both')}
                className={`text-[10px] sm:text-[11px] font-semibold py-1.5 px-1 rounded-md text-center transition-all ${
                  slot2Mode === 'both'
                    ? 'bg-[#002B49] text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                Ambos (.xlsx + .pdf)
              </button>
            </div>
          </div>

          {/* Sub-campos de Upload */}
          <div className="space-y-2.5 flex-grow">
            {/* Opção 1: Escopo e Sequência (.xlsx / .csv) */}
            {(slot2Mode === 'scope_only' || slot2Mode === 'both') && (
              <div 
                onDrop={(e) => handleDrop(e, 2, 'scope')}
                onDragOver={handleDragOver}
                className="bg-white/80 p-2.5 rounded-lg border border-amber-200 shadow-2xs"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-amber-700" />
                    {slot2Mode === 'both' ? '1. Escopo e Sequência (.xlsx / .csv)' : 'Escopo e Sequência'}
                  </span>
                  <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                    XLSX / CSV
                  </span>
                </div>

                <input
                  type="file"
                  ref={fileInputRef2Scope}
                  onChange={(e) => e.target.files?.[0] && onFileUpload(2, e.target.files[0], 'scope')}
                  accept=".xlsx,.csv"
                  className="hidden"
                />

                {slot2.status === 'ready' ? (
                  <div className="bg-amber-50/60 rounded p-2 border border-amber-200 flex items-center justify-between">
                    <div className="truncate pr-2">
                      <p className="text-xs font-bold text-slate-800 truncate" title={slot2.name}>
                        {slot2.name}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {formatFileSize(slot2.size)} • <span className="uppercase font-semibold text-amber-800">{slot2.format}</span>
                        {slot2.summary && ` • ${slot2.summary}`}
                      </p>
                    </div>
                    <button
                      onClick={() => onClearSlot(2, 'scope')}
                      className="text-slate-400 hover:text-rose-600 p-1"
                      title="Remover escopo"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div 
                    onClick={() => fileInputRef2Scope.current?.click()}
                    className="border border-dashed border-amber-300 rounded p-3 text-center cursor-pointer hover:bg-amber-50/50 transition-colors"
                  >
                    <Upload className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                    <p className="text-xs font-medium text-slate-700">
                      Selecionar Escopo e Sequência (.xlsx / .csv)
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Opção 2: Guia de Habilidades Priorizadas (.pdf) */}
            {(slot2Mode === 'guide_pdf_only' || slot2Mode === 'both') && (
              <div 
                onDrop={(e) => handleDrop(e, 2, 'guide')}
                onDragOver={handleDragOver}
                className="bg-white/80 p-2.5 rounded-lg border border-rose-200 shadow-2xs"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-rose-900 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-rose-700" />
                    {slot2Mode === 'both' ? '2. Guia de Habilidades Priorizadas (.pdf)' : 'Guia Priorizado (.pdf)'}
                  </span>
                  <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-bold">
                    PDF
                  </span>
                </div>

                <input
                  type="file"
                  ref={fileInputRef2Guide}
                  onChange={(e) => e.target.files?.[0] && onFileUpload(2, e.target.files[0], 'guide')}
                  accept=".pdf"
                  className="hidden"
                />

                {((slot2Mode === 'guide_pdf_only' && slot2.status === 'ready' && slot2.format === 'pdf') || (slot2Guide && slot2Guide.status === 'ready')) ? (
                  <div className="bg-rose-50/60 rounded p-2 border border-rose-200 flex items-center justify-between">
                    <div className="truncate pr-2">
                      <p className="text-xs font-bold text-slate-800 truncate" title={(slot2Guide?.status === 'ready' ? slot2Guide.name : slot2.name)}>
                        {slot2Guide?.status === 'ready' ? slot2Guide.name : slot2.name}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {formatFileSize(slot2Guide?.status === 'ready' ? slot2Guide.size : slot2.size)} • <span className="uppercase font-semibold text-rose-800">PDF</span>
                        {(slot2Guide?.summary || slot2.summary) && ` • ${slot2Guide?.summary || slot2.summary}`}
                      </p>
                    </div>
                    <button
                      onClick={() => onClearSlot(2, 'guide')}
                      className="text-slate-400 hover:text-rose-600 p-1"
                      title="Remover Guia PDF"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div 
                    onClick={() => fileInputRef2Guide.current?.click()}
                    className="border border-dashed border-rose-300 rounded p-3 text-center cursor-pointer hover:bg-rose-50/50 transition-colors"
                  >
                    <Upload className="w-5 h-5 text-rose-500 mx-auto mb-1" />
                    <p className="text-xs font-medium text-slate-700">
                      Selecionar Guia de Habilidades Priorizadas (.pdf)
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="text-[11px] text-slate-500 bg-slate-100/70 p-2 rounded border border-slate-200 mt-2.5">
            <strong>Currículo Paulista:</strong> {slot2Mode === 'both' ? 'O Guia Priorizado (.pdf) define o foco pedagógico e o Escopo (.xlsx) distribui a sequência semanal.' : slot2Mode === 'guide_pdf_only' ? 'Habilidades prioritárias e descritores extraídos diretamente do documento PDF oficial.' : 'Habilidades organizadas progressivamente por bimestre e ordem pedagógica.'}
          </div>
        </div>

        {/* Slot 3: Calendário SEDUC */}
        <div 
          onDrop={(e) => handleDrop(e, 3)}
          onDragOver={handleDragOver}
          className={`flex flex-col rounded-xl border-2 transition-all p-5 relative ${
            slot3.status === 'ready'
              ? 'border-emerald-400 bg-emerald-50/20 shadow-sm'
              : 'border-dashed border-slate-300 hover:border-[#005A9C] bg-slate-50/50'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-teal-100 text-teal-800">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                  Slot 3 • Calendário
                </span>
                <h3 className="font-bold text-slate-900 text-sm mt-0.5">Calendário SEDUC</h3>
              </div>
            </div>
            {slot3.status === 'ready' && (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            )}
          </div>

          <p className="text-xs text-slate-600 mb-4 flex-grow">
            Calendário escolar oficial SEDUC-SP com 200 dias letivos, feriados de SP, recessos, SEI e avaliações (.xlsx, .pdf, imagem ou .csv).
          </p>

          <input
            type="file"
            ref={fileInputRef3}
            onChange={(e) => e.target.files?.[0] && onFileUpload(3, e.target.files[0])}
            accept=".xlsx,.pdf,.png,.jpg,.jpeg,.csv"
            className="hidden"
          />

          {slot3.status === 'ready' ? (
            <div className="bg-white rounded-lg p-3 border border-emerald-200 shadow-xs mb-3">
              <div className="flex items-start justify-between">
                <div className="truncate pr-2">
                  <p className="text-xs font-bold text-slate-800 truncate" title={slot3.name}>
                    {slot3.name}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {formatFileSize(slot3.size)} • <span className="uppercase font-semibold text-emerald-700">{slot3.format}</span>
                  </p>
                  {slot3.summary && (
                    <p className="text-[11px] text-emerald-700 mt-1 font-medium">
                      ✓ {slot3.summary}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onClearSlot(3)}
                  className="text-xs text-slate-400 hover:text-rose-600 p-1"
                  title="Remover arquivo"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div 
              onClick={() => fileInputRef3.current?.click()}
              className="border border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:bg-teal-50/50 transition-colors mb-3"
            >
              <Upload className="w-7 h-7 text-slate-400 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-700">
                Arraste ou clique para selecionar
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Suporta: .xlsx, .pdf, imagem (.png/.jpg) ou .csv
              </p>
            </div>
          )}

          <div className="text-[11px] text-slate-500 bg-slate-100/70 p-2 rounded border border-slate-200">
            <strong>Contabilização Real:</strong> Desconta feriados e reserva semanas para Prova Paulista, SARESP e SEI.
          </div>
        </div>
      </div>

      {/* Card de Identificação / Cabeçalho */}
      <div className="mt-8 border border-slate-200/90 rounded-2xl bg-gradient-to-br from-slate-50 via-white to-blue-50/20 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-slate-200/70 gap-2 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#002B49] text-amber-400 flex items-center justify-center shadow-xs">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                Dados de Identificação / Cabeçalho
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-600" />
                  Salvo automaticamente
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Preencha os dados do cabeçalho. Eles são salvos no seu perfil e gravados com prioridade direta nas células correspondentes do modelo.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5 text-xs">
          {/* Unidade Escolar */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs hover:border-blue-300 transition-colors">
            <label className="block text-slate-700 font-bold mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-[#002B49]" />
              Unidade Escolar:
            </label>
            <input
              type="text"
              value={metadata.school}
              onChange={(e) => onChangeMetadata({ ...metadata, school: e.target.value })}
              placeholder="ex: EE Prof. Álvaro Ortiz"
              className="w-full bg-slate-50/60 focus:bg-white border border-slate-200 focus:border-[#005A9C] rounded-lg p-2 font-medium text-slate-800 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all placeholder:text-slate-400"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              Injetado na célula de Escola
            </span>
          </div>

          {/* Professor(a) */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs hover:border-blue-300 transition-colors">
            <label className="block text-slate-700 font-bold mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#002B49]" />
              Professor(a):
            </label>
            <input
              type="text"
              value={metadata.teacherName}
              onChange={(e) => onChangeMetadata({ ...metadata, teacherName: e.target.value })}
              placeholder="ex: Nome do docente"
              className="w-full bg-slate-50/60 focus:bg-white border border-slate-200 focus:border-[#005A9C] rounded-lg p-2 font-medium text-slate-800 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all placeholder:text-slate-400"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              Injetado na célula do Docente
            </span>
          </div>

          {/* Componente Curricular / Disciplina */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs hover:border-blue-300 transition-colors">
            <label className="block text-slate-700 font-bold mb-1.5 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-[#002B49]" />
              Componente / Disciplina:
            </label>
            <input
              type="text"
              value={metadata.subject}
              onChange={(e) => onChangeMetadata({ ...metadata, subject: e.target.value })}
              placeholder="ex: Matemática, Química"
              className="w-full bg-slate-50/60 focus:bg-white border border-slate-200 focus:border-[#005A9C] rounded-lg p-2 font-medium text-slate-800 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all placeholder:text-slate-400"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              Injetado na célula de Disciplina
            </span>
          </div>

          {/* Turma / Série */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs hover:border-blue-300 transition-colors">
            <label className="block text-slate-700 font-bold mb-1.5 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#002B49]" />
              Turma / Série:
            </label>
            <input
              type="text"
              value={metadata.grade}
              onChange={(e) => onChangeMetadata({ ...metadata, grade: e.target.value })}
              placeholder="ex: 9º Ano A, 1ª Série EM"
              className="w-full bg-slate-50/60 focus:bg-white border border-slate-200 focus:border-[#005A9C] rounded-lg p-2 font-medium text-slate-800 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all placeholder:text-slate-400"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              Injetado na célula de Turma
            </span>
          </div>

          {/* Bimestre */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs hover:border-blue-300 transition-colors">
            <label className="block text-slate-700 font-bold mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#002B49]" />
              Bimestre:
            </label>
            <select
              value={metadata.bimestre}
              onChange={(e) => onChangeMetadata({ ...metadata, bimestre: e.target.value })}
              className="w-full bg-slate-50/60 focus:bg-white border border-slate-200 focus:border-[#005A9C] rounded-lg p-2 font-bold text-blue-900 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all cursor-pointer"
            >
              <option value="1º Bimestre">1º Bimestre</option>
              <option value="2º Bimestre">2º Bimestre</option>
              <option value="3º Bimestre">3º Bimestre</option>
              <option value="4º Bimestre">4º Bimestre</option>
            </select>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Injetado na célula de Bimestre
            </span>
          </div>

          {/* Ano Letivo Detectado (Editável) */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs hover:border-blue-300 transition-colors">
            <label className="block text-slate-700 font-bold mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#002B49]" />
                Ano Letivo Detectado:
              </span>
              {calendarData?.isAutoExtracted && (
                <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                  Auto
                </span>
              )}
            </label>
            <input
              type="number"
              min="2020"
              max="2040"
              value={metadata.year || calendarData?.year || 2026}
              onChange={(e) => {
                const newYear = e.target.value;
                const numYear = parseInt(newYear, 10);
                const effectiveYear = !isNaN(numYear) ? numYear : 2026;
                const metrics = computeSeducCellMetrics({
                  bimestre: metadata.bimestre,
                  subject: metadata.subject,
                  grade: metadata.grade,
                  plannedClassesInput: metadata.plannedClasses,
                  calendarData,
                  year: effectiveYear
                });
                onChangeMetadata({
                  ...metadata,
                  year: newYear,
                  diasLetivos: metrics.j7DiasLetivos,
                  diasEfetivos: metrics.j9DiasEfetivos
                });
              }}
              placeholder="2026"
              className="w-full bg-slate-50/60 focus:bg-white border border-slate-200 focus:border-[#005A9C] rounded-lg p-2 font-black text-slate-900 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all cursor-pointer"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              Ano base do calendário (Slot 3)
            </span>
          </div>
        </div>

        {/* 1.1 SELEÇÃO DOS DIAS DE AULA DA TURMA & MOTOR DE ALOCAÇÃO POR CALENDÁRIO */}
        {(() => {
          const currentDays = Array.isArray(metadata.classDays) && metadata.classDays.length > 0
            ? metadata.classDays
            : [4];
          const currentClassesPerDay = Number(metadata.classesPerDay) >= 1 && Number(metadata.classesPerDay) <= 4
            ? Number(metadata.classesPerDay)
            : 2;

          const WEEKDAYS = [
            { day: 1, name: 'Segunda-feira', short: 'Seg' },
            { day: 2, name: 'Terça-feira', short: 'Ter' },
            { day: 3, name: 'Quarta-feira', short: 'Qua' },
            { day: 4, name: 'Quinta-feira', short: 'Qui' },
            { day: 5, name: 'Sexta-feira', short: 'Sex' },
          ];

          const toggleDay = (dNum: number) => {
            let nextDays: number[];
            if (currentDays.includes(dNum)) {
              nextDays = currentDays.filter(d => d !== dNum);
              if (nextDays.length === 0) nextDays = [dNum]; // Keep at least one
            } else {
              nextDays = [...currentDays, dNum].sort((a, b) => a - b);
            }
            onChangeMetadata({
              ...metadata,
              classDays: nextDays,
              classesPerDay: currentClassesPerDay,
              teacherSchedule: {
                classDays: nextDays,
                classesPerDay: currentClassesPerDay
              }
            });
          };

          const handleClassesPerDayChange = (val: number) => {
            onChangeMetadata({
              ...metadata,
              classesPerDay: val,
              teacherSchedule: {
                classDays: currentDays,
                classesPerDay: val
              }
            });
          };

          const schedulePreview = generateTeacherClassSchedule({
            bimestreNum: metadata.bimestre || 4,
            calendarData,
            targetYear: metadata.year ? parseInt(String(metadata.year), 10) : calendarData?.year,
            classDays: currentDays,
            classesPerDay: currentClassesPerDay,
            plannedClasses: Number(metadata.plannedClasses) || 18,
            rowCount: 11
          });

          const displacedCount = schedulePreview.filter(s => s.status === 'displaced').length;

          return (
            <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-slate-50 border-2 border-blue-200/90 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2.5 mb-3 border-b border-blue-200/70 gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-[#002B49] text-white flex items-center justify-center text-xs font-bold shadow-2xs">
                    <Clock className="w-3.5 h-3.5 text-amber-300" />
                  </span>
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-wide text-[#002B49] flex items-center gap-1.5">
                      Grade Horária Semanal & Dias de Aula da Turma
                    </h4>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Determina a varredura real do calendário para a <strong>Coluna B (Linha 28 em diante)</strong> com alocação e deslocamento de feriados.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-bold text-blue-900 bg-blue-100/80 px-2 py-0.5 rounded border border-blue-200">
                    {currentDays.length * currentClassesPerDay} aula{currentDays.length * currentClassesPerDay > 1 ? 's' : ''}/semana
                  </span>
                  {displacedCount > 0 && (
                    <span className="text-[11px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                      {displacedCount} aula{displacedCount > 1 ? 's' : ''} deslocada{displacedCount > 1 ? 's' : ''} por feriado
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-start">
                {/* Checkboxes dos Dias da Semana */}
                <div className="md:col-span-8 bg-white p-3 rounded-xl border border-blue-200 shadow-2xs">
                  <label className="block text-slate-800 font-extrabold text-xs mb-2 flex items-center justify-between">
                    <span>Dias da Semana com Aula nesta Turma:</span>
                    <span className="text-[10px] font-normal text-slate-500">
                      Selecione um ou mais dias úteis (Segunda a Sexta)
                    </span>
                  </label>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {WEEKDAYS.map(w => {
                      const isChecked = currentDays.includes(w.day);
                      return (
                        <button
                          key={w.day}
                          type="button"
                          onClick={() => toggleDay(w.day)}
                          className={`p-2 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between gap-1.5 ${
                            isChecked
                              ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-blue-50/50 hover:border-blue-300'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                              isChecked
                                ? 'bg-white border-white text-blue-600'
                                : 'bg-white border-slate-300'
                            }`}>
                              {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </span>
                            <span className="text-[11px] font-bold truncate">
                              {w.name}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-2 block">
                    Exemplo padrão SEDUC: Aulas às <strong>quintas-feiras (bloco geminado de 2 aulas)</strong>.
                  </span>
                </div>

                {/* Seletor de Aulas por Dia */}
                <div className="md:col-span-4 bg-white p-3 rounded-xl border border-blue-200 shadow-2xs">
                  <label className="block text-slate-800 font-extrabold text-xs mb-1.5">
                    Aulas por Dia Letivo:
                  </label>
                  <select
                    value={currentClassesPerDay}
                    onChange={(e) => handleClassesPerDayChange(parseInt(e.target.value, 10))}
                    className="w-full bg-slate-50 border-2 border-blue-300 focus:border-[#005A9C] rounded-lg p-2 font-black text-slate-900 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all cursor-pointer text-xs"
                  >
                    <option value={1}>1 aula por dia</option>
                    <option value={2}>2 aulas (bloco geminado) [Padrão]</option>
                    <option value={3}>3 aulas por dia</option>
                    <option value={4}>4 aulas por dia</option>
                  </select>
                  <div className="mt-2 text-[10px] text-slate-500 leading-tight">
                    Carga horária acumulada é balanceada no fechamento do bimestre (SEI) para atingir 100% de J8.
                  </div>
                </div>
              </div>

              {/* Prévia Instantânea do Algoritmo de Alocação e Deslocamento na Coluna B */}
              <div className="mt-3 p-2.5 bg-white/90 rounded-lg border border-blue-200 text-xs">
                <div className="flex items-center justify-between mb-1 text-[11px] text-slate-700">
                  <span className="font-extrabold text-[#002B49] flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Prévia do Algoritmo de Alocação (Coluna B):
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Amostra das 3 primeiras semanas e fechamento
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-1.5">
                  {schedulePreview.slice(0, 3).map((sw) => (
                    <div key={sw.weekNumber} className={`p-1.5 rounded border text-[10px] ${
                      sw.status === 'suspension'
                        ? 'bg-red-50 border-red-300 text-red-950 font-bold ring-1 ring-red-200'
                        : sw.status === 'displaced'
                        ? 'bg-amber-50 border-amber-300 text-amber-950 font-bold'
                        : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}>
                      <span className="font-mono font-bold block">{sw.fullDateText}</span>
                    </div>
                  ))}
                  {schedulePreview.length > 3 && (
                    <div className="p-1.5 rounded border bg-emerald-50 border-emerald-300 text-emerald-950 text-[10px] font-bold">
                      <span className="font-mono block">
                        {schedulePreview[schedulePreview.length - 1].fullDateText}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* PAINEL DESTACADO DE METADADOS CURRICULARES (CÉLULAS J7, J8 e J9) */}
        {(() => {
          const metrics = computeSeducCellMetrics({
            bimestre: metadata.bimestre,
            subject: metadata.subject,
            grade: metadata.grade,
            plannedClassesInput: metadata.plannedClasses,
            calendarData: calendarData,
            year: metadata.year || calendarData?.year
          });

          return (
            <div className="mt-4 pt-4 border-t border-slate-200/80">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-[#002B49] bg-blue-100/70 px-2 py-0.5 rounded border border-blue-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-700" />
                    Sistemática Oficial de Carga Horária e Dias Letivos (Células J7, J8 e J9)
                  </span>
                  <span className="text-xs font-bold text-emerald-900 bg-emerald-100/90 px-2.5 py-0.5 rounded-md border border-emerald-300 flex items-center gap-1.5 shadow-2xs">
                    ✓ Calendário Lido Automaticamente: Ano {metadata.year || calendarData?.year || 2026} • {metadata.bimestre || '4º Bimestre'} ({metrics.startDate} a {metrics.endDate})
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Formatação, cores e estilos originais 100% preservados
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Card Célula J7 */}
                <div className="bg-gradient-to-br from-blue-50/50 to-white p-3.5 rounded-xl border-2 border-blue-200 shadow-2xs relative">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-extrabold uppercase tracking-wide text-blue-900 flex items-center gap-1">
                      <span className="font-mono bg-[#002B49] text-white px-1.5 py-0.5 rounded text-[10px] font-bold">J7</span>
                      Dias Letivos do Bimestre
                    </span>
                    <span className="text-[10px] font-bold text-blue-800 bg-blue-100/90 px-1.5 py-0.5 rounded border border-blue-200">
                      Seg a Sex (dayOfWeek 1-5)
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 my-1">
                    <span className="text-2xl font-black text-slate-900 tracking-tight">
                      {metrics.j7DiasLetivos}
                    </span>
                    <span className="text-xs font-bold text-slate-600">
                      dias úteis letivos
                    </span>
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/80 px-1.5 py-0.2 rounded border border-emerald-200 ml-auto">
                      {metrics.weekendDaysIgnoredCount} fins de semana excluídos
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Período oficial: <strong>{metrics.startDate} a {metrics.endDate}</strong> ({metrics.totalCalendarDays} dias corridos). Varredura dia a dia: <strong>{metrics.totalWeekdaysMonFri} dias úteis (seg-sex)</strong>, com <strong>{metrics.weekendDaysIgnoredCount} sábados e domingos rigorosamente ignorados</strong> e desconto de <strong>{metrics.j7FeriadosDescontados.length} feriados/pontes</strong> em dias úteis.
                  </p>
                  <div className="mt-2 pt-1.5 border-t border-blue-100 text-[10px] font-semibold text-blue-800 flex items-center justify-between">
                    <span>Injeção na planilha:</span>
                    <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-blue-200 text-blue-950">
                      Célula J7 = {metrics.j7DiasLetivos} (inteiro)
                    </span>
                  </div>
                </div>

                {/* Card Célula J8 */}
                <div className="bg-gradient-to-br from-amber-50/50 to-white p-3.5 rounded-xl border-2 border-amber-300 shadow-2xs relative">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-extrabold uppercase tracking-wide text-amber-950 flex items-center gap-1">
                      <span className="font-mono bg-amber-700 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">J8</span>
                      Aulas Curriculares Previstas
                    </span>
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                      Teto Obrigatório
                    </span>
                  </div>
                  <div className="flex items-center gap-2 my-1">
                    <select
                      value={String(metadata.plannedClasses || metrics.j8AulasPrevistas)}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        onChangeMetadata({ 
                          ...metadata, 
                          plannedClasses: val,
                          diasLetivos: metrics.j7DiasLetivos,
                          diasEfetivos: metrics.j9DiasEfetivos
                        });
                      }}
                      className="bg-white border-2 border-amber-400 focus:border-amber-600 rounded-lg p-1.5 text-base font-black text-amber-950 focus:ring-2 focus:ring-amber-200 focus:outline-none cursor-pointer"
                    >
                      <option value="18">18 Aulas (9 Semanas letivas de regência)</option>
                      <option value="16">16 Aulas (8 Semanas de currículo base)</option>
                      <option value="14">14 Aulas (se o curso for semestral/módulo reduzido)</option>
                      <option value="12">12 Aulas (se o curso for semestral/módulo reduzido)</option>
                    </select>
                    <span className="text-xs font-bold text-amber-900">
                      ({metrics.j8TotalSemanas} semanas)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Carga horária para <strong>{metadata.subject || 'Química'} ({metadata.grade || '1ª Série EM'})</strong>. O valor de J8 define o encerramento estrito da grade semanal sem aulas fantasmas.
                  </p>
                  <div className="mt-2 pt-1.5 border-t border-amber-200 text-[10px] font-semibold text-amber-900 flex items-center justify-between">
                    <span>Injeção na planilha:</span>
                    <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-amber-300">
                      Célula J8 = {metrics.j8AulasPrevistas}
                    </span>
                  </div>
                </div>

                {/* Card Célula J9 */}
                <div className="bg-gradient-to-br from-emerald-50/50 to-white p-3.5 rounded-xl border-2 border-emerald-300 shadow-2xs relative">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-extrabold uppercase tracking-wide text-emerald-950 flex items-center gap-1">
                      <span className="font-mono bg-emerald-700 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">J9</span>
                      Dias Letivos Efetivos
                    </span>
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                      Desconto de Eventos
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 my-1">
                    <span className="text-2xl font-black text-slate-900 tracking-tight">
                      {metrics.j9DiasEfetivos}
                    </span>
                    <span className="text-xs font-bold text-slate-600">
                      dias efetivos de aula
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Base J7 ({metrics.j7DiasLetivos}) menos <strong>{metrics.j9EventosDescontados.reduce((a, b) => a + b.dias, 0)} dias de eventos</strong> (Planejamento, Conselhos, Provas exclusivas e Feiras).
                  </p>
                  <div className="mt-2 pt-1.5 border-t border-emerald-200 text-[10px] font-semibold text-emerald-900 flex items-center justify-between">
                    <span>Injeção na planilha:</span>
                    <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-emerald-300">
                      Célula J9 = {metrics.j9DiasEfetivos}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Action Bar */}
      <div className="mt-8 pt-5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-xs text-slate-500">
          {!allSlotsFilled ? (
            <span className="flex items-center gap-1.5 text-amber-600 font-medium">
              <AlertCircle className="w-4 h-4" />
              Faça o upload dos 3 arquivos obrigatórios para iniciar o treinamento de coordenadas.
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
              <FileCheck className="w-4 h-4" />
              Os 3 slots estão prontos para o treinamento de coordenadas!
            </span>
          )}
        </div>

        <button
          onClick={onProceedToMapping}
          disabled={!allSlotsFilled || isParsing}
          className={`w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer ${
            allSlotsFilled && !isParsing
              ? 'bg-[#002B49] hover:bg-[#003B65] text-white hover:shadow-md'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          {isParsing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Inspecionando Planilha...
            </>
          ) : (
            <>
              Avançar para Configuração / Treinamento do Modelo →
            </>
          )}
        </button>
      </div>
    </div>
  );
};
