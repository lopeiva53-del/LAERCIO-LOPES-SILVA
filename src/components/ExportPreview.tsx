import React, { useState } from 'react';
import { 
  Download, 
  Save,
  CheckCircle2, 
  ShieldCheck, 
  FileSpreadsheet, 
  RotateCcw, 
  Layers, 
  Table, 
  Eye, 
  Sparkles,
  Calendar,
  ExternalLink,
  FileText,
  BookOpen,
  Bookmark,
  Lock,
  Clock,
  HardDrive,
  FolderDown,
  Info
} from 'lucide-react';
import { MappedField, PlanMetadata, ScopeSkill } from '../types/plan';
import { FIXED_IMMUTABLE_CELLS } from '../config/version';
import { 
  generateSuggestedFileName, 
  saveFileWithPicker, 
  downloadBlobDirect,
  SaveResult,
  computeSlot2DynamicClasses
} from '../utils/fileEngine';

interface ExportPreviewProps {
  originalFileName: string;
  fileFormat: 'xlsx' | 'docx' | 'pdf';
  fields: MappedField[];
  sheetNames: string[];
  activeSheet: string;
  onSelectSheet: (sheetName: string) => void;
  onDownload: () => void;
  onSaveAs?: () => Promise<SaveResult | null | void>;
  onReset: () => void;
  isDownloading: boolean;
  filledBuffer?: ArrayBuffer | null;
  planMetadata?: PlanMetadata;
  scopeSkills?: ScopeSkill[];
}

export const ExportPreview: React.FC<ExportPreviewProps> = ({
  originalFileName,
  fileFormat,
  fields,
  sheetNames,
  activeSheet,
  onSelectSheet,
  onDownload,
  onSaveAs,
  onReset,
  isDownloading,
  filledBuffer,
  planMetadata,
  scopeSkills
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'audit'>('preview');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'warning' } | null>(null);
  const [showIframeModal, setShowIframeModal] = useState<boolean>(false);

  const suggestedName = generateSuggestedFileName(fields, originalFileName, fileFormat, planMetadata);

  const handleOpenInNewTab = () => {
    if (typeof window !== 'undefined') {
      window.open(window.location.href, '_blank');
    }
  };

  const handleSaveAsClick = async () => {
    let res: SaveResult | null = null;
    if (onSaveAs) {
      const possibleRes = await onSaveAs();
      if (possibleRes && typeof possibleRes === 'object' && 'method' in possibleRes) {
        res = possibleRes as SaveResult;
      }
    } else if (filledBuffer) {
      res = await saveFileWithPicker(filledBuffer, suggestedName, fileFormat);
    } else {
      onDownload();
      return;
    }

    if (res) {
      if (res.method === 'iframe_blocked') {
        setShowIframeModal(true);
      } else if (res.method === 'picker') {
        setNotification({
          message: `Arquivo salvo com sucesso na pasta selecionada: ${res.fileName}`,
          type: 'success'
        });
        setTimeout(() => setNotification(null), 7000);
      } else if (res.method === 'fallback') {
        setNotification({
          message: `Arquivo baixado na pasta padrão de Downloads: ${res.fileName}`,
          type: 'info'
        });
        setTimeout(() => setNotification(null), 7000);
      } else if (res.method === 'canceled') {
        setNotification({
          message: 'Seleção de pasta cancelada pelo usuário.',
          type: 'warning'
        });
        setTimeout(() => setNotification(null), 5000);
      }
    }
  };

  const handleDirectDownloadClick = () => {
    if (filledBuffer) {
      downloadBlobDirect(filledBuffer, suggestedName, fileFormat);
      setNotification({
        message: `Download direto concluído na pasta de Downloads: ${suggestedName}`,
        type: 'info'
      });
      setTimeout(() => setNotification(null), 6000);
    } else {
      onDownload();
    }
  };

  const currentSheetFields = fields.filter(f => f.sheet === activeSheet);

  // Group fields by row for table display
  const rowsMap = new Map<number, MappedField[]>();
  currentSheetFields.forEach(f => {
    if (!rowsMap.has(f.row)) {
      rowsMap.set(f.row, []);
    }
    rowsMap.get(f.row)!.push(f);
  });
  // Display strictly the rows with filled content (exact calculated weeks, no empty excess rows)
  const sortedRows = Array.from(rowsMap.keys())
    .filter(rowNum => {
      const rowFields = rowsMap.get(rowNum) || [];
      return rowFields.some(f => f.fillValue && String(f.fillValue).trim().length > 0);
    })
    .sort((a, b) => a - b);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      {/* Header & Success Status */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between pb-5 border-b border-slate-100 gap-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">
              ✓
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              Preenchimento Concluído com Sucesso!
            </h2>
            <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-300">
              Formato: .{fileFormat}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Arquivo pronto: <strong className="text-slate-700">{suggestedName}</strong>
          </p>
        </div>

        {/* Action Buttons Group (Salvar Como, Download Direto e Abrir em Janela Inteira) */}
        <div className="flex flex-col items-start xl:items-end gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onReset}
              className="px-3 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Iniciar novo arquivo de planejamento"
            >
              <RotateCcw className="w-4 h-4" /> Novo Arquivo
            </button>

            {/* Atalho Abrir em Janela Inteira / Nova Aba para contornar sandbox do iframe */}
            <button
              onClick={handleOpenInNewTab}
              className="px-3 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-900 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
              title="Abrir em Nova Aba (Janela Inteira) para conceder permissão irrestrita à caixa de diálogo nativa do Google Drive"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Abrir em Janela Inteira</span>
            </button>

            {/* Botão 1 (Principal - Azul/Índigo): Salvar Como (Escolher Pasta/Drive) */}
            <button
              onClick={handleSaveAsClick}
              disabled={isDownloading}
              className="px-4.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-extrabold text-xs sm:text-sm shadow-md hover:shadow-indigo-600/30 transition-all cursor-pointer flex items-center gap-2 border border-indigo-500 disabled:opacity-50"
              title="Abre a caixa de diálogo nativa para salvar no Google Drive sincronizado ou pasta local"
            >
              <Save className="w-4 h-4 text-indigo-100" />
              <span>{isDownloading ? 'Processando...' : 'Salvar Como (Escolher Pasta/Drive)'}</span>
            </button>

            {/* Botão 2 (Secundário - Verde): Download Direto */}
            <button
              onClick={handleDirectDownloadClick}
              disabled={isDownloading}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-xs sm:text-sm shadow-md hover:shadow-emerald-600/30 transition-all cursor-pointer flex items-center gap-2 border border-emerald-500 disabled:opacity-50"
              title="Baixa direto para a pasta padrão de Downloads do computador"
            >
              <Download className="w-4 h-4 text-emerald-100" />
              <span>Download Direto</span>
            </button>
          </div>

          {/* Dica Contextual Abaixo dos Botões */}
          <p className="text-[11px] text-slate-500 italic flex items-center gap-1 text-left xl:text-right">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></span>
            <span>Dica: Utilize <strong>'Salvar Como'</strong> para escolher a pasta do Google Drive sincronizado no seu computador ou na rede da escola.</span>
          </p>
        </div>
      </div>

      {/* Notification Toast/Banner se houver feedback */}
      {notification && (
        <div className={`mt-4 p-3 rounded-xl border flex items-center justify-between gap-3 text-xs font-semibold ${
          notification.type === 'success' 
            ? 'bg-emerald-50 border-emerald-300 text-emerald-900' 
            : notification.type === 'warning'
            ? 'bg-amber-50 border-amber-300 text-amber-900'
            : 'bg-indigo-50 border-indigo-300 text-indigo-900'
        }`}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{notification.message}</span>
          </div>
          <button 
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-700 cursor-pointer text-xs p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Strict Rule Compliance Alert */}
      <div className="mt-5 p-4 rounded-xl bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border-2 border-emerald-300 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-emerald-950 flex items-center gap-1.5">
              Conformidade Estrita com o Regulamento SEDUC-SP
            </h4>
            <p className="text-xs text-emerald-800 mt-0.5">
              Layout, larguras de coluna, estilos de bordas, fontes e <strong>100% das cores de preenchimento</strong> originais foram rigorosamente mantidos.
            </p>
          </div>
        </div>

        <div className="text-xs font-extrabold text-emerald-900 bg-white/80 px-3 py-1.5 rounded-lg border border-emerald-300 shrink-0">
          ✓ {fields.length} Células Injetadas
        </div>
      </div>

      {/* Painel de Auditoria e Conferência das Células J7, J8 e J9 */}
      {(() => {
        const j7Field = fields.find(f => (f.address || '').toUpperCase() === 'J7' || f.id.includes('diasLetivosCell'));
        const j8Field = fields.find(f => (f.address || '').toUpperCase() === 'J8' || f.id.includes('plannedClassesCell'));
        const j9Field = fields.find(f => (f.address || '').toUpperCase() === 'J9' || f.id.includes('diasEfetivosCell'));

        const dynamicJ8 = computeSlot2DynamicClasses(scopeSkills, planMetadata);
        const j7Val = j7Field?.fillValue || j7Field?.currentValue || '51';
        const j8Val = j8Field?.fillValue || j8Field?.currentValue || String(dynamicJ8);
        const j9Val = j9Field?.fillValue || j9Field?.currentValue || '47';
        const parsedWeeks = Math.ceil(parseInt(String(j8Val), 10) / 2) || 8;
        const bimField = fields.find(f => (f.label || '').toLowerCase().includes('bimestre') || (f.address || '').toUpperCase() === 'E7');
        const detectedBim = bimField?.fillValue || bimField?.currentValue || '4º Bimestre';
        const dateWeekField = fields.find(f => f.weekNumber === 1 && f.colLetter === 'B');
        const yearMatch = String(dateWeekField?.fillValue || dateWeekField?.currentValue || '').match(/\b(202\d|203\d)\b/);
        const detectedYear = yearMatch ? yearMatch[1] : '2026';

        return (
          <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/70">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Auditoria de Carga Horária (J7, J8, J9)
              </span>
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded">
                Ano {detectedYear} • {detectedBim}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Card J7: [Número] Dias Letivos */}
              <div className="bg-white px-3 py-2 rounded-lg border border-blue-200 flex items-center justify-between shadow-2xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono bg-[#002B49] text-white px-1.5 py-0.5 rounded text-[10px] font-bold">J7</span>
                  <span className="text-xs font-semibold text-slate-700">Dias Letivos</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-black text-slate-900">{j7Val}</span>
                  <span className="text-[10px] text-slate-500">dias</span>
                </div>
              </div>

              {/* Card J8: [Número] Aulas (Dinâmico Slot 2) */}
              <div className="bg-white px-3 py-2 rounded-lg border border-amber-300 flex items-center justify-between shadow-2xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono bg-amber-700 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">J8</span>
                  <span className="text-xs font-semibold text-slate-700">Aulas</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-black text-amber-950">{j8Val}</span>
                  <span className="text-[10px] text-slate-500">aulas</span>
                </div>
              </div>

              {/* Card J9: [Número] Efetivos */}
              <div className="bg-white px-3 py-2 rounded-lg border border-emerald-300 flex items-center justify-between shadow-2xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono bg-emerald-700 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">J9</span>
                  <span className="text-xs font-semibold text-slate-700">Efetivos</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-black text-emerald-950">{j9Val}</span>
                  <span className="text-[10px] text-slate-500">dias</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Painel de Auditoria das Células Fixas Imutáveis B13, B15 e B17 */}
      <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-amber-50/70 via-white to-slate-50 border-2 border-amber-300 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2.5 mb-3 border-b border-amber-200/80 gap-2">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#002B49] flex items-center gap-1.5">
            <Lock className="w-4 h-4 text-amber-600" />
            Auditoria das Células Fixas Imutáveis (B13, B15 e B17)
          </h4>
          <span className="text-[11px] font-semibold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
            Texto Fixo Imutável • Bloqueio Estrito de IA
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {Object.values(FIXED_IMMUTABLE_CELLS).map((item) => (
            <div key={item.address} className="bg-white p-3.5 rounded-lg border border-amber-200 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-extrabold text-[#002B49] text-xs flex items-center gap-1.5">
                    <span className="font-mono bg-[#002B49] text-white px-1.5 py-0.5 rounded text-[10px] font-bold">
                      {item.address}
                    </span>
                    {item.label}
                  </span>
                  <span className="text-[9px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-0.5">
                    <Lock className="w-2.5 h-2.5 text-amber-700" /> {item.tag}
                  </span>
                </div>
                <p className="text-[11px] text-slate-700 leading-relaxed font-medium mt-1">
                  "{item.text}"
                </p>
              </div>
              <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                <span>Injeção ExcelJS:</span>
                <span className="font-mono font-bold text-emerald-700">wrapText: true • Preservada</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation tabs & sheet tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-6 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs font-bold uppercase text-slate-400 mr-1 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" /> Abas:
          </span>
          {sheetNames.map((sheetName) => (
            <button
              key={sheetName}
              onClick={() => onSelectSheet(sheetName)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeSheet === sheetName
                  ? 'bg-[#002B49] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {sheetName}
            </button>
          ))}
        </div>

        <div className="bg-slate-100 p-1 rounded-lg flex items-center text-xs font-medium shrink-0">
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              activeTab === 'preview' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Visualizar Tabela Preenchida
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              activeTab === 'audit' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Auditoria de Injeções ({currentSheetFields.length})
          </button>
        </div>
      </div>

      {/* Main Content View */}
      <div className="mt-4">
        {activeTab === 'preview' ? (
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 shadow-inner">
            <div className="bg-[#002B49] text-white p-3.5 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                  Visualização do Documento Preenchido
                </span>
                <h3 className="text-sm font-bold text-white mt-0.5">
                  Aba: {activeSheet}
                </h3>
              </div>
              <span className="text-xs text-slate-300 bg-white/10 px-2.5 py-1 rounded-md border border-white/20">
                Células com formatação e cores preservadas
              </span>
            </div>

            <div className="overflow-x-auto max-h-[500px] p-4">
              <div className="space-y-4 min-w-[760px]">
                {sortedRows.map(rowNum => {
                  const rowFields = rowsMap.get(rowNum) || [];
                  const isFixedRow = (rowNum === 13 || rowNum === 15 || rowNum === 17) && rowFields.some(f => ['B13', 'B15', 'B17'].includes((f.address || '').toUpperCase()) || f.isImmutableFixed);
                  const isEvalFixedRow = !isFixedRow && (rowNum >= 21 && rowNum <= 24) && rowFields.some(f => ['C21', 'C22', 'C23', 'C24', 'J21', 'J22', 'J23', 'J24'].includes((f.address || '').toUpperCase()));
                  const dateField = rowFields.find(f => (f.colLetter || '').toUpperCase() === 'B' || (f.address || '').toUpperCase() === `B${rowNum}`);
                  const dateVal = String(dateField?.fillValue || '').toLowerCase();
                  const isTransferredRow = !isFixedRow && !isEvalFixedRow && (
                    rowFields.some(f => f.isTransferred || String(f.fillValue || '').toLowerCase().includes('suspens')) ||
                    dateVal.includes('transferida') ||
                    dateVal.includes('reposta') ||
                    dateVal.includes('suspensão') ||
                    dateVal.includes('suspensao')
                  );
                  const isSEIRow = !isFixedRow && !isEvalFixedRow && !isTransferredRow && rowFields.some(f => f.isSEI || f.label.toLowerCase().includes('sei') || String(f.fillValue || '').toLowerCase().includes('sei') || String(f.fillValue || '').toLowerCase().includes('estudos intensivos'));
                  const isAvalRow = !isFixedRow && !isEvalFixedRow && !isTransferredRow && rowFields.some(f => f.isAvaliacao || f.label.toLowerCase().includes('avalia') || String(f.fillValue || '').toLowerCase().includes('prova paulista') || String(f.fillValue || '').toLowerCase().includes('saresp'));

                  return (
                    <div
                      key={rowNum}
                      className={`p-4 rounded-xl border transition-all ${
                        isFixedRow
                          ? 'bg-amber-50/80 border-amber-300 shadow-xs'
                          : isEvalFixedRow
                          ? 'bg-purple-50/70 border-purple-300 shadow-xs'
                          : isSEIRow
                          ? 'bg-amber-50/80 border-amber-300 shadow-xs'
                          : isAvalRow
                          ? 'bg-sky-50/80 border-sky-300 shadow-xs'
                          : 'bg-white border-slate-200 shadow-xs'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            Linha {rowNum}
                          </span>
                          <span className="font-bold text-slate-800">
                            {isFixedRow
                              ? `Célula Fixa Imutável (B${rowNum})`
                              : isEvalFixedRow
                              ? `Instrumentos e Pesos de Avaliação Oficial (C${rowNum} e J${rowNum})`
                              : (() => {
                                  if (dateField && dateField.fillValue) {
                                    return dateField.fillValue;
                                  }
                                  return rowFields[0]?.weekNumber
                                    ? `Semana ${rowFields[0].weekNumber}`
                                    : 'Planejamento Regular';
                                })()}
                          </span>
                          {isFixedRow && (
                            <span className="bg-amber-800 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded shadow-2xs flex items-center gap-1">
                              <Lock className="w-2.5 h-2.5" /> TEXTO FIXO IMUTÁVEL
                            </span>
                          )}
                          {isEvalFixedRow && (
                            <span className="bg-purple-700 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded shadow-2xs">
                              INSTRUMENTOS & PESOS DE AVALIAÇÃO
                            </span>
                          )}
                          {isTransferredRow && (
                            <span className="bg-[#002B49] text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded shadow-2xs flex items-center gap-1 border border-slate-700">
                              <Clock className="w-2.5 h-2.5" /> {dateVal.includes('suspens') || rowFields.some(f => String(f.fillValue || '').toLowerCase().includes('suspens')) ? 'SUSPENSÃO OFICIAL / REPROGRAMADA' : 'AULA TRANSFERIDA / REPOSTA'}
                            </span>
                          )}
                          {!isTransferredRow && isSEIRow && (
                            <span className="bg-amber-500 text-slate-950 text-[10px] font-extrabold px-2.5 py-0.5 rounded shadow-2xs">
                              SEMANA DE ESTUDOS INTENSIVOS (SEI)
                            </span>
                          )}
                          {!isTransferredRow && isAvalRow && (
                            <span className="bg-sky-600 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded shadow-2xs">
                              AVALIAÇÃO OFICIAL (PROVA PAULISTA)
                            </span>
                          )}
                          {(() => {
                            const isClosing = dateVal.includes('fechamento') || dateVal.includes('acumuladas');

                            if (isClosing) {
                              return (
                                <span className="bg-emerald-700 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded shadow-2xs">
                                  FECHAMENTO / AULAS ACUMULADAS
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>

                        <span className="text-[11px] text-slate-500">
                          {rowFields.length} campos preenchidos
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {rowFields.map(f => {
                          const origColor = f.originalStyle?.fillColor || '#ffffff';
                          const isFixedCell = ['B13', 'B15', 'B17'].includes((f.address || '').toUpperCase()) || f.isImmutableFixed;
                          const isColC = (f.address || '').toUpperCase() === `C${rowNum}`;
                          const isColJ = (f.address || '').toUpperCase() === `J${rowNum}`;
                          const isColB = !isFixedCell && ((f.colLetter || '').toUpperCase() === 'B' || (f.address || '').toUpperCase() === `B${rowNum}`);

                          return (
                            <div 
                              key={f.id}
                              className={`p-3 rounded-lg border bg-white/90 shadow-2xs flex flex-col justify-between ${
                                isFixedCell
                                  ? 'border-amber-300 ring-1 ring-amber-100 bg-amber-50/20'
                                  : isEvalFixedRow
                                  ? (isColC ? 'border-purple-300 ring-1 ring-purple-100' : 'border-emerald-300 ring-1 ring-emerald-100')
                                  : isColB
                                  ? 'border-blue-300 ring-1 ring-blue-50 bg-blue-50/20'
                                  : 'border-slate-200'
                              }`}
                              style={{
                                borderTopWidth: '3px',
                                borderTopColor: isFixedCell ? '#D97706' : isEvalFixedRow ? (isColC ? '#7E22CE' : '#059669') : isColB ? '#0284C7' : isSEIRow ? '#D97706' : isAvalRow ? '#0284C7' : '#002B49'
                              }}
                            >
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className={`font-mono font-extrabold text-xs px-2 py-0.5 rounded border ${
                                    isFixedCell
                                      ? 'bg-amber-100 text-amber-950 border-amber-300'
                                      : isEvalFixedRow
                                      ? (isColC ? 'bg-purple-50 text-purple-900 border-purple-200' : 'bg-emerald-50 text-emerald-900 border-emerald-200')
                                      : isColB
                                      ? 'bg-blue-100 text-blue-950 border-blue-300'
                                      : 'bg-blue-50 text-[#002B49] border-blue-200'
                                  }`}>
                                    {f.colLetter ? `Col ${f.colLetter} • ` : ''}Célula {f.address}
                                  </span>
                                  {isFixedCell && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-0.5">
                                      <Lock className="w-2.5 h-2.5 text-amber-700" /> Texto Fixo Imutável
                                    </span>
                                  )}
                                  {isEvalFixedRow && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                      isColC ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                                    }`}>
                                      {isColC ? 'Instrumento' : 'Peso / %'}
                                    </span>
                                  )}
                                  {isColB && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                      isTransferredRow || String(f.fillValue || '').toLowerCase().includes('transferida') || String(f.fillValue || '').toLowerCase().includes('reposta') || String(f.fillValue || '').toLowerCase().includes('suspens')
                                        ? 'bg-slate-100 text-slate-800 border-slate-300'
                                        : String(f.fillValue || '').toLowerCase().includes('fechamento')
                                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                        : 'bg-blue-100 text-blue-800 border-blue-200'
                                    }`}>
                                      {isTransferredRow || String(f.fillValue || '').toLowerCase().includes('transferida') || String(f.fillValue || '').toLowerCase().includes('reposta') || String(f.fillValue || '').toLowerCase().includes('suspens')
                                        ? (dateVal.includes('suspens') || rowFields.some(f => String(f.fillValue || '').toLowerCase().includes('suspens')) ? 'Suspensão Oficial / Reprogramada' : 'Aula Transferida / Reposta')
                                        : String(f.fillValue || '').toLowerCase().includes('fechamento')
                                        ? 'Fechamento'
                                        : 'Data Prevista'}
                                    </span>
                                  )}
                                  {(f.isDisabled || f.disabledByUser) && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                      Desativada pelo usuário
                                    </span>
                                  )}
                                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                    <span 
                                      className="w-2.5 h-2.5 rounded-full border border-slate-300" 
                                      style={{ backgroundColor: origColor }} 
                                    />
                                    <span>Cor mantida</span>
                                  </div>
                                </div>
                                <span className="text-[11px] font-bold text-slate-600 block mb-1">
                                  {f.label}:
                                </span>
                                {f.isDisabled || f.disabledByUser || !f.fillValue ? (
                                  <div className="p-2 rounded bg-amber-50/80 border border-amber-200">
                                    <span className="text-xs font-bold text-amber-900 flex items-center gap-1">
                                      (Não preenchida / Desativada pelo usuário)
                                    </span>
                                    <span className="text-[10px] text-amber-700 block mt-0.5">
                                      Célula preservada vazia no arquivo Excel.
                                    </span>
                                  </div>
                                ) : (
                                  <p className="text-xs text-slate-900 leading-relaxed font-medium">
                                    {f.fillValue}
                                  </p>
                                )}
                              </div>

                              {f.justification && (
                                <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-500 italic">
                                  Cruzamento: {f.justification}
                                </div>
                              )}

                              {/* Rastreabilidade de Origem */}
                              {(() => {
                                const weekNum = f.weekNumber || (f.row && f.row >= 28 ? f.row - 27 : 1);
                                const startClass = (weekNum * 2) - 1;
                                const endClass = weekNum * 2;
                                const classText = f.lessonRange || `Aulas ${startClass} e ${endClass}`;

                                if (f.sourcePage) {
                                  const badgeText = f.sourceReference && f.sourceReference.toLowerCase().includes('aula')
                                    ? f.sourceReference
                                    : `${classText} • Pág. ${f.sourcePage} - Guia Priorizado PDF`;

                                  return (
                                    <div className="mt-2 flex items-center gap-1">
                                      <span className="inline-flex items-center gap-1 text-[9px] font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                                        <FileText className="w-2.5 h-2.5 text-sky-600" />
                                        📄 {badgeText}
                                      </span>
                                    </div>
                                  );
                                }

                                const badgeText = f.sourceReference && f.sourceReference.toLowerCase().includes('aula')
                                  ? f.sourceReference
                                  : `${classText} • ${f.sourceReference || 'Base Curricular Oficial SEDUC-SP'}`;

                                return (
                                  <div className="mt-2 flex items-center gap-1">
                                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                      <BookOpen className="w-2.5 h-2.5 text-emerald-600" />
                                      📚 {badgeText}
                                    </span>
                                  </div>
                                );
                              })()}
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
                    <th className="p-3">Célula / Endereço</th>
                    <th className="p-3">Seção / Campo</th>
                    <th className="p-3">Semana</th>
                    <th className="p-3">Origem / Rastreabilidade</th>
                    <th className="p-3">Conteúdo Injetado no Arquivo Original</th>
                    <th className="p-3">Critério SEDUC Aplicado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentSheetFields.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-blue-900 whitespace-nowrap">
                        {f.sheet} • {f.address}
                        {(f.isImmutableFixed || ['B13', 'B15', 'B17'].includes((f.address || '').toUpperCase())) && (
                          <span className="ml-1.5 text-[9px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300 inline-flex items-center gap-0.5">
                            <Lock className="w-2.5 h-2.5 text-amber-700" /> Texto Fixo Imutável
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-semibold text-slate-800 whitespace-nowrap">
                        {f.label}
                      </td>
                      <td className="p-3 text-slate-600 whitespace-nowrap">
                        {f.weekNumber ? `Semana ${f.weekNumber}` : '-'}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {(() => {
                          const weekNum = f.weekNumber || (f.row && f.row >= 28 ? f.row - 27 : 1);
                          const startClass = (weekNum * 2) - 1;
                          const endClass = weekNum * 2;
                          const classText = f.lessonRange || `Aulas ${startClass} e ${endClass}`;

                          if (f.sourcePage) {
                            const badgeText = f.sourceReference && f.sourceReference.toLowerCase().includes('aula')
                              ? f.sourceReference
                              : `${classText} • Pág. ${f.sourcePage} - Guia Priorizado PDF`;
                            return (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200" title={`Extraído da pág. ${f.sourcePage} da seção Escopo e Sequência do Guia Priorizado (${classText})`}>
                                <FileText className="w-3 h-3 text-sky-600 shrink-0" />
                                📄 {badgeText}
                              </span>
                            );
                          }

                          const badgeText = f.sourceReference && f.sourceReference.toLowerCase().includes('aula')
                            ? f.sourceReference
                            : `${classText} • ${f.sourceReference || 'Base Curricular Oficial SEDUC-SP'}`;

                          return (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200" title={badgeText}>
                              <BookOpen className="w-3 h-3 text-emerald-600 shrink-0" />
                              📚 {badgeText}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="p-3 text-slate-900 max-w-md font-medium leading-relaxed">
                        {f.isDisabled || f.disabledByUser || !f.fillValue ? (
                          <span className="inline-flex items-center gap-1 font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-xs">
                            (Não preenchida / Desativada pelo usuário)
                          </span>
                        ) : (
                          f.fillValue
                        )}
                      </td>
                      <td className="p-3 text-slate-500 text-[11px]">
                        {f.justification || (f.isDisabled || f.disabledByUser ? 'Coluna configurada como vazia/desativada pelo usuário no perfil' : 'Conforme Diretrizes do Currículo Paulista')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Final Action Bar */}
      <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="text-xs text-slate-500 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            Arquivo gerado: <strong className="text-slate-800">{suggestedName}</strong>
          </span>
        </div>

        <div className="flex flex-col items-start xl:items-end gap-2 w-full xl:w-auto">
          <div className="flex flex-wrap items-center gap-2.5 justify-end w-full xl:w-auto">
            {/* Atalho Abrir em Janela Inteira / Nova Aba */}
            <button
              onClick={handleOpenInNewTab}
              className="w-full sm:w-auto px-3.5 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-900 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
              title="Abrir em Nova Aba (Janela Inteira) para conceder permissão irrestrita à caixa de diálogo nativa do Google Drive"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Abrir em Janela Inteira</span>
            </button>

            {/* Botão 1 (Principal - Azul/Índigo): Salvar Como (Escolher Pasta/Drive) */}
            <button
              onClick={handleSaveAsClick}
              disabled={isDownloading}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-extrabold text-xs sm:text-sm shadow-md hover:shadow-indigo-600/30 transition-all cursor-pointer flex items-center justify-center gap-2 border border-indigo-500 disabled:opacity-50"
              title="Abre a caixa de diálogo nativa para salvar no Google Drive sincronizado ou pasta local"
            >
              <Save className="w-4 h-4 text-indigo-100" />
              <span>{isDownloading ? 'Processando...' : 'Salvar Como (Escolher Pasta/Drive)'}</span>
            </button>

            {/* Botão 2 (Secundário - Verde): Download Direto */}
            <button
              onClick={handleDirectDownloadClick}
              disabled={isDownloading}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-xs sm:text-sm shadow-md hover:shadow-emerald-600/30 transition-all cursor-pointer flex items-center justify-center gap-2 border border-emerald-500 disabled:opacity-50"
              title="Baixa direto para a pasta padrão de Downloads do computador"
            >
              <Download className="w-4 h-4 text-emerald-100" />
              <span>Download Direto</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-500 italic text-left xl:text-right">
            Dica: Utilize <strong>'Salvar Como'</strong> para escolher a pasta do Google Drive ou da escola. Em prévia embutida, use <strong>'Abrir em Janela Inteira'</strong> para permissão irrestrita do seletor.
          </p>
        </div>
      </div>

      {/* Modal Explicativo: Restrição de Segurança do Iframe com Atalho Direto */}
      {showIframeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <HardDrive className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Salvar Como: Seleção de Pasta & Google Drive
                  </h3>
                  <p className="text-xs text-slate-500">
                    Restrição de segurança da janela integrada (iframe)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowIframeModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
                title="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5 leading-relaxed">
              <p>
                O navegador restringe a abertura da caixa de diálogo nativa do sistema (<code>showSaveFilePicker</code>) quando o aplicativo está dentro de uma prévia embutida (<code>iframe</code>) por políticas de sandbox.
              </p>
              <p className="font-semibold text-slate-800">
                Para selecionar diretamente sua pasta do <strong>Google Drive sincronizado</strong> (ex: <code>G:\Drives compartilhados\...</code>), rede escolar ou pendrive com a caixa de diálogo nativa:
              </p>
              <div className="bg-indigo-50 border border-indigo-200 text-indigo-900 p-2.5 rounded-lg flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>Basta abrir em <strong>Nova Aba (Janela Inteira)</strong>, onde o navegador concede permissão irrestrita ao seletor de arquivos.</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => {
                  setShowIframeModal(false);
                  handleDirectDownloadClick();
                }}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
                title="Baixar na pasta padrão de Downloads"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>Baixar nos Downloads</span>
              </button>

              <button
                onClick={() => {
                  setShowIframeModal(false);
                  handleOpenInNewTab();
                }}
                className="w-full sm:w-auto px-4.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md hover:shadow-indigo-600/30 cursor-pointer transition-all"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Abrir em Nova Aba (Permissão Total)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
