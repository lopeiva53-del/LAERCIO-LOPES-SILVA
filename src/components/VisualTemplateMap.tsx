import React, { useState, useMemo, useRef } from 'react';
import { 
  Layers, 
  Table, 
  Sliders, 
  Sparkles, 
  FileText, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  MapPin, 
  CheckCircle2, 
  Info, 
  MousePointerClick, 
  Plus, 
  Search, 
  Calendar, 
  Award, 
  BookOpen,
  Filter,
  Eye,
  Maximize2,
  X
} from 'lucide-react';
import { CellMapProfile, MappedField, PlanMetadata, InjectionMode } from '../types/plan';
import { normalizeCoordinate, normalizeColLetter } from '../utils/fileEngine';
import { resolveCustomMappingMode } from '../utils/profileStorage';

export type MarkerCategory = 'header' | 'reflexive' | 'assessment' | 'weekly_grid' | 'custom';

export interface VisualMarker {
  address: string;
  colLetter: string;
  rowNumber: number;
  label: string;
  category: MarkerCategory;
  mode: InjectionMode;
  expectedType?: string;
  value?: string;
  weekNumber?: number;
  isConfirmed?: boolean;
  fieldId?: string;
  isMerged?: boolean;
  mergeRange?: string;
  sectionTitle?: string;
  sourcePage?: number;
  sourceReference?: string;
}

interface VisualTemplateMapProps {
  fields?: MappedField[];
  profile?: CellMapProfile;
  sheetName?: string;
  selectedAddress?: string | null;
  onSelectAddress?: (address: string, marker?: VisualMarker) => void;
  onAddCoordinate?: (coord: string) => void;
  planMetadata?: PlanMetadata;
  compact?: boolean;
}

export const VisualTemplateMap: React.FC<VisualTemplateMapProps> = ({
  fields,
  profile,
  sheetName = 'Planejamento Preenchido',
  selectedAddress,
  onSelectAddress,
  onAddCoordinate,
  planMetadata,
  compact = false
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<MarkerCategory | 'all'>('all');
  const [searchCoord, setSearchCoord] = useState<string>('');
  const [hoveredMarker, setHoveredMarker] = useState<VisualMarker | null>(null);
  const [activeTooltipCoords, setActiveTooltipCoords] = useState<{ x: number; y: number } | null>(null);
  const [clickedCellForAdd, setClickedCellForAdd] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Derive all active markers from either `fields` (Step 3) or `profile` (Step 2)
  const markers = useMemo<VisualMarker[]>(() => {
    // Context 1: MappedFields provided (from MappingViewer - Step 3)
    if (fields && fields.length > 0) {
      return fields.map((f): VisualMarker => {
        const addr = normalizeCoordinate(f.address);
        const colLetter = normalizeColLetter(f.colLetter || addr.replace(/\d+/g, ''));
        const rowNumber = Number(f.row || addr.replace(/[^\d]/g, '')) || 1;

        // Categorize field
        let category: MarkerCategory = 'custom';
        const labelLower = (f.label || '').toLowerCase();

        if (rowNumber <= 7 || f.expectedType === 'identificacao' || ['D3', 'D4', 'D5', 'D6', 'H5', 'H6', 'J3', 'J4'].includes(addr)) {
          category = 'header';
        } else if ((rowNumber >= 13 && rowNumber <= 17) || ['B13', 'B14', 'B15', 'B16', 'B17'].includes(addr) || labelLower.includes('instruç') || labelLower.includes('reflex')) {
          category = 'reflexive';
        } else if ((rowNumber >= 18 && rowNumber <= 26) || labelLower.includes('peso') || labelLower.includes('30%') || labelLower.includes('20%') || labelLower.includes('prova paulista') || ['C21', 'D21', 'E21', 'H21', 'J21'].includes(addr)) {
          category = 'assessment';
        } else if (rowNumber >= 27 || (rowNumber >= 16 && ['B', 'D', 'E', 'F', 'G', 'H', 'I'].includes(colLetter))) {
          category = 'weekly_grid';
        }

        const mode: InjectionMode = f.injectionMode || resolveCustomMappingMode({ address: addr, label: f.label });

        return {
          address: addr,
          colLetter,
          rowNumber,
          label: f.label || `Célula ${addr}`,
          category,
          mode,
          expectedType: f.expectedType,
          value: f.fillValue || f.currentValue,
          weekNumber: f.weekNumber,
          isConfirmed: f.confirmed,
          fieldId: f.id,
          isMerged: f.isMerged,
          mergeRange: f.mergeRange,
          sectionTitle: f.section,
          sourcePage: f.sourcePage,
          sourceReference: f.sourceReference
        };
      });
    }

    // Context 2: Profile provided (from TrainingWizard - Step 2)
    if (profile) {
      const generated: VisualMarker[] = [];

      // 1. Header Fields
      const hf = profile.headerFields || {};
      const headerDefs = [
        { key: 'schoolCell', defaultAddr: 'D4', label: 'Unidade Escolar', val: planMetadata?.school || 'E.E. Monteiro Lobato - URE Taubaté' },
        { key: 'teacherCell', defaultAddr: 'D5', label: 'Professor(a) Responsável', val: planMetadata?.teacherName || 'Professor(a) Titular - PEI' },
        { key: 'subjectCell', defaultAddr: 'D6', label: 'Componente / Disciplina', val: planMetadata?.subject || 'Química' },
        { key: 'gradeCell', defaultAddr: 'H5', label: 'Turma / Série', val: planMetadata?.grade || '1ª Série do EM' },
        { key: 'bimestreCell', defaultAddr: 'H6', label: 'Bimestre Letivo', val: planMetadata?.bimestre || '4º Bimestre' }
      ];

      headerDefs.forEach(hd => {
        const addr = normalizeCoordinate((hf as any)[hd.key] || hd.defaultAddr);
        const colLetter = normalizeColLetter(addr.replace(/\d+/g, ''));
        const rowNumber = Number(addr.replace(/[^\d]/g, '')) || 4;

        generated.push({
          address: addr,
          colLetter,
          rowNumber,
          label: hd.label,
          category: 'header',
          mode: 'literal',
          expectedType: 'identificacao',
          value: hd.val,
          isConfirmed: true,
          sectionTitle: 'Cabeçalho Institucional'
        });
      });

      // 2. Custom Mapped Cells (Free / Specific cells)
      if (profile.customCellMappings && profile.customCellMappings.length > 0) {
        profile.customCellMappings.forEach(cm => {
          const addr = normalizeCoordinate(cm.address);
          const colLetter = normalizeColLetter(addr.replace(/\d+/g, ''));
          const rowNumber = Number(addr.replace(/[^\d]/g, '')) || 13;
          const labelLower = (cm.label || '').toLowerCase();

          let category: MarkerCategory = 'custom';
          if (rowNumber <= 7 || ['D3', 'D4', 'D5', 'D6', 'H5', 'H6', 'J3', 'J4'].includes(addr)) {
            category = 'header';
          } else if ((rowNumber >= 13 && rowNumber <= 17) || ['B13', 'B14', 'B15', 'B16', 'B17'].includes(addr)) {
            category = 'reflexive';
          } else if ((rowNumber >= 18 && rowNumber <= 26) || labelLower.includes('peso') || labelLower.includes('%') || ['C21', 'D21', 'E21', 'H21', 'J21'].includes(addr)) {
            category = 'assessment';
          } else if (rowNumber >= 27) {
            category = 'weekly_grid';
          }

          const mode: InjectionMode = cm.mode || resolveCustomMappingMode({ address: addr, label: cm.label });

          generated.push({
            address: addr,
            colLetter,
            rowNumber,
            label: cm.label || `Célula Livre ${addr}`,
            category,
            mode,
            expectedType: cm.expectedType,
            value: mode === 'literal' ? cm.label : 'Conteúdo formulado via IA',
            isConfirmed: true,
            isMerged: cm.isMerged,
            mergeRange: cm.mergeRange,
            sectionTitle: `Célula Específica ${addr}`
          });
        });
      }

      // 3. Weekly Grid Rows
      // Standard URE Taubaté row baseline: row 28 (or profile.startRow)
      const startRow = profile.startRow >= 20 ? profile.startRow : 28;
      const rowCount = profile.rowCount || 10;
      const cols = profile.columns || {
        dateWeekCol: 'B',
        skillCol: 'D',
        objectivesCol: 'E',
        methodologyCol: 'F',
        developmentCol: 'G',
        assessmentCol: 'H',
        recoveryCol: 'I'
      };

      for (let w = 1; w <= rowCount; w++) {
        const r = startRow + w - 1;
        const isSEI = w === 10 || w === 9;
        const isAval = w === 8;

        const weekColumns = [
          { col: cols.dateWeekCol, type: 'periodo', label: 'Data / Semana', mode: 'literal' as InjectionMode, val: `Semana ${w} (06/10 a 10/10) - 5 dias` },
          { col: cols.skillCol, type: 'habilidade', label: 'Habilidade / Objeto', mode: 'ai_prompt' as InjectionMode, val: isSEI ? '(SEI-RECUPERAÇÃO) Superação de defasagens' : isAval ? '(AVAL-PROVA-PAULISTA) Avaliação Oficial' : '(EM13CNT303) Equilíbrio Químico Dinâmico' },
          { col: cols.objectivesCol, type: 'objeto_conhecimento', label: 'Objetivos de Aprendizagem', mode: 'ai_prompt' as InjectionMode, val: 'Reconhecer que no equilíbrio químico as concentrações permanecem constantes.' },
          { col: cols.methodologyCol, type: 'metodologia', label: 'Metodologia', mode: 'ai_prompt' as InjectionMode, val: 'Ensino por Investigação com experimento demonstrativo da garrafa com CO2.' },
          { col: cols.developmentCol, type: 'desenvolvimento_aula', label: 'Desenvolvimento (Passo a Passo)', mode: 'ai_prompt' as InjectionMode, val: '1. Acolhida e pergunta disparadora (10 min). 2. Demonstração prática (15 min)...' },
          { col: cols.assessmentCol, type: 'avaliacao', label: 'Avaliação da Aprendizagem', mode: 'ai_prompt' as InjectionMode, val: 'Rubrica formativa de análise de gráficos e participação investigativa.' },
          { col: cols.recoveryCol, type: 'recuperacao_sei', label: 'Ajustes / Recuperação (SEI)', mode: 'ai_prompt' as InjectionMode, val: 'Atendimento individualizado com analogia mecânica da escada rolante.' }
        ];

        weekColumns.forEach(wc => {
          if (!wc.col) return;
          const addr = `${wc.col}${r}`;
          // Avoid duplicate if already declared in customCellMappings
          if (!generated.some(g => g.address === addr)) {
            generated.push({
              address: addr,
              colLetter: wc.col,
              rowNumber: r,
              label: `Semana ${w}: ${wc.label}`,
              category: 'weekly_grid',
              mode: wc.mode,
              expectedType: wc.type,
              value: wc.val,
              weekNumber: w,
              isConfirmed: true,
              sectionTitle: `Semana ${w} (Linha ${r})`
            });
          }
        });
      }

      return generated;
    }

    return [];
  }, [fields, profile, planMetadata]);

  // Map from coordinate address to marker for instant O(1) lookup
  const markerMap = useMemo(() => {
    const map = new Map<string, VisualMarker>();
    markers.forEach(m => map.set(m.address, m));
    return map;
  }, [markers]);

  // Filter markers according to activeCategoryFilter and search
  const filteredMarkers = useMemo(() => {
    return markers.filter(m => {
      if (activeCategoryFilter !== 'all' && m.category !== activeCategoryFilter) return false;
      if (searchCoord.trim()) {
        const query = searchCoord.toUpperCase().trim();
        return m.address.includes(query) || (m.label || '').toUpperCase().includes(query);
      }
      return true;
    });
  }, [markers, activeCategoryFilter, searchCoord]);

  // Category counts
  const categoryCounts = useMemo(() => {
    return {
      all: markers.length,
      header: markers.filter(m => m.category === 'header').length,
      reflexive: markers.filter(m => m.category === 'reflexive').length,
      assessment: markers.filter(m => m.category === 'assessment').length,
      weekly_grid: markers.filter(m => m.category === 'weekly_grid').length,
      custom: markers.filter(m => m.category === 'custom').length
    };
  }, [markers]);

  // Visual helper to render marker badge with appropriate theme
  const getMarkerBadgeStyle = (category: MarkerCategory, isSelected: boolean) => {
    if (isSelected) {
      return 'bg-amber-400 text-slate-950 font-black border-2 border-amber-600 ring-4 ring-amber-300/60 shadow-lg scale-105 z-30 animate-pulse';
    }

    switch (category) {
      case 'header':
        // Azul / Verde (Identificação / Cabeçalho)
        return 'bg-emerald-600 text-white font-bold border border-emerald-700 shadow-xs hover:bg-emerald-700 hover:scale-105';
      case 'reflexive':
        // Violeta (Blocos reflexivos B13, B15, B17)
        return 'bg-purple-600 text-white font-bold border border-purple-700 shadow-xs hover:bg-purple-700 hover:scale-105';
      case 'assessment':
        // Laranja / Âmbar (Avaliação e pesos C21:J24)
        return 'bg-amber-600 text-white font-bold border border-amber-700 shadow-xs hover:bg-amber-700 hover:scale-105';
      case 'weekly_grid':
        // Azul Escuro (Tabela semanal a partir da Linha 28)
        return 'bg-[#002B49] text-white font-bold border border-[#001D33] shadow-xs hover:bg-[#003B66] hover:scale-105';
      default:
        return 'bg-indigo-600 text-white font-bold border border-indigo-700 shadow-xs hover:bg-indigo-700 hover:scale-105';
    }
  };

  const handleMarkerClick = (marker: VisualMarker, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (onSelectAddress) {
      onSelectAddress(marker.address, marker);
    }
  };

  const handleCellClick = (addr: string) => {
    const existing = markerMap.get(addr);
    if (existing) {
      handleMarkerClick(existing);
    } else {
      setClickedCellForAdd(addr);
    }
  };

  const handleConfirmAddCoord = (addr: string) => {
    if (onAddCoordinate) {
      onAddCoordinate(addr);
    }
    setClickedCellForAdd(null);
  };

  return (
    <div className="flex flex-col bg-slate-900 rounded-2xl border border-slate-700 text-white overflow-hidden shadow-xl">
      {/* Top Toolbar: Legend, Categories, Search & Zoom Controls */}
      <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-blue-600/30 text-blue-400 flex items-center justify-center border border-blue-500/30">
            <MapPin className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-xs font-bold text-white flex items-center gap-2">
              Mapa Visual Interativo da Planilha
              <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                {sheetName}
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Posição espacial das células coordenadas diretamente sobre o modelo SEDUC-SP / URE Taubaté
            </p>
          </div>
        </div>

        {/* Action Controls: Search, Filters & Zoom */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Quick Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar célula (ex: D4, B28, C21)..."
              value={searchCoord}
              onChange={(e) => setSearchCoord(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-blue-500 w-44 sm:w-56"
            />
            {searchCoord && (
              <button
                onClick={() => setSearchCoord('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Zoom In / Out Buttons */}
          <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700 p-0.5 text-xs">
            <button
              onClick={() => setZoomLevel(prev => Math.max(60, prev - 15))}
              className="p-1.5 hover:bg-slate-700 text-slate-300 rounded transition-colors cursor-pointer"
              title="Reduzir Zoom"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-[11px] font-mono font-bold text-slate-300 min-w-11 text-center">
              {zoomLevel}%
            </span>
            <button
              onClick={() => setZoomLevel(prev => Math.min(150, prev + 15))}
              className="p-1.5 hover:bg-slate-700 text-slate-300 rounded transition-colors cursor-pointer"
              title="Aumentar Zoom"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoomLevel(100)}
              className="p-1.5 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded transition-colors cursor-pointer border-l border-slate-700 ml-0.5"
              title="Resetar Zoom (100%)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Category Filter Pills & Color Legend */}
      <div className="bg-slate-900/90 px-4 py-2 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Camadas:
          </span>
          <button
            onClick={() => setActiveCategoryFilter('all')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
              activeCategoryFilter === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
            }`}
          >
            Todas ({categoryCounts.all})
          </button>
          <button
            onClick={() => setActiveCategoryFilter('header')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeCategoryFilter === 'header'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-800 text-emerald-400 hover:bg-slate-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            Cabeçalho ({categoryCounts.header})
          </button>
          <button
            onClick={() => setActiveCategoryFilter('reflexive')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeCategoryFilter === 'reflexive'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-slate-800 text-purple-400 hover:bg-slate-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
            Reflexivas ({categoryCounts.reflexive})
          </button>
          <button
            onClick={() => setActiveCategoryFilter('assessment')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeCategoryFilter === 'assessment'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-800 text-amber-400 hover:bg-slate-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            Avaliação & Pesos ({categoryCounts.assessment})
          </button>
          <button
            onClick={() => setActiveCategoryFilter('weekly_grid')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeCategoryFilter === 'weekly_grid'
                ? 'bg-blue-500 text-white shadow-xs'
                : 'bg-slate-800 text-blue-300 hover:bg-slate-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            Grade Semanal L28+ ({categoryCounts.weekly_grid})
          </button>
        </div>

        <div className="text-[11px] text-slate-400 flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="px-1 py-0.2 bg-slate-700 text-slate-300 rounded font-mono text-[10px]">[Fixo]</span> = Texto literal
          </span>
          <span className="flex items-center gap-1">
            <span className="px-1 py-0.2 bg-purple-900/70 text-purple-200 rounded font-mono text-[10px]">[IA]</span> = Gerado via IA
          </span>
        </div>
      </div>

      {/* Main Vector Grid Spreadsheet Canvas with Pan/Scroll */}
      <div 
        ref={containerRef}
        className="relative overflow-auto p-4 md:p-6 bg-slate-950/60 max-h-[620px] transition-all"
      >
        <div 
          style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top left' }}
          className="transition-transform duration-150 inline-block min-w-[960px] max-w-full"
        >
          {/* Simulated Excel Workbook Frame */}
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 text-slate-900 overflow-hidden font-sans">
            
            {/* Sheet Title Bar Header */}
            <div className="bg-[#002B49] text-white px-4 py-2.5 flex items-center justify-between border-b border-[#001A2E]">
              <div className="flex items-center gap-2">
                <Table className="w-4 h-4 text-cyan-400" />
                <span className="font-bold text-xs uppercase tracking-wide">
                  MODELO OFICIAL SEDUC-SP / URE TAUBATÉ - PLANO DE ENSINO E CRONOGRAMA
                </span>
              </div>
              <span className="text-[10px] bg-white/15 px-2 py-0.5 rounded font-mono">
                Aba: {sheetName}
              </span>
            </div>

            {/* Column Coordinate Bar (A, B, C, D, E, F, G, H, I, J, K) */}
            <div className="grid grid-cols-12 bg-slate-200 border-b border-slate-300 text-[11px] font-mono font-bold text-slate-600 text-center py-1">
              <div className="col-span-1 bg-slate-300 border-r border-slate-400">LINHA</div>
              <div className="col-span-1 border-r border-slate-300">A</div>
              <div className="col-span-1 border-r border-slate-300">B</div>
              <div className="col-span-1 border-r border-slate-300">C</div>
              <div className="col-span-2 border-r border-slate-300">D (Valores)</div>
              <div className="col-span-2 border-r border-slate-300">E / F</div>
              <div className="col-span-1 border-r border-slate-300">G</div>
              <div className="col-span-2 border-r border-slate-300">H / I</div>
              <div className="col-span-1">J / K</div>
            </div>

            {/* ============================================================ */}
            {/* SEÇÃO 1: CABEÇALHO GOVERNAMENTAL E INSTITUCIONAL (LINHAS 1-6) */}
            {/* ============================================================ */}
            <div className="border-b-2 border-slate-400 bg-slate-50">
              {/* Row 2: Header Gov SP */}
              <div className="grid grid-cols-12 border-b border-slate-200 bg-[#002B49] text-white py-1.5 px-3 items-center">
                <div className="col-span-1 font-mono text-[10px] text-cyan-300 font-bold">L2</div>
                <div className="col-span-11 text-center font-bold text-xs tracking-wider">
                  GOVERNO DO ESTADO DE SÃO PAULO | SECRETARIA DA EDUCAÇÃO DO ESTADO (SEDUC-SP)
                </div>
              </div>

              {/* Row 3: Header Diretoria Taubaté */}
              <div className="grid grid-cols-12 border-b border-slate-300 bg-[#004B87] text-white py-1.5 px-3 items-center">
                <div className="col-span-1 font-mono text-[10px] text-cyan-300 font-bold">L3</div>
                <div className="col-span-11 text-center font-bold text-xs">
                  DIRETORIA DE ENSINO - REGIÃO DE TAUBATÉ (URE) | PLANEJAMENTO DE AULA - 2025
                </div>
              </div>

              {/* Row 4: Unidade Escolar (D4) */}
              <div className="grid grid-cols-12 border-b border-slate-200 py-2 px-3 items-center text-xs hover:bg-blue-50/50 transition-colors">
                <div className="col-span-1 font-mono text-[10px] text-slate-400 font-bold">L4</div>
                <div className="col-span-2 font-bold text-slate-700">Unidade Escolar:</div>
                <div className="col-span-9 flex items-center justify-between bg-white border border-slate-300 rounded px-3 py-1 relative">
                  <span className="font-semibold text-slate-800">
                    {planMetadata?.school || 'E.E. Monteiro Lobato - URE Taubaté'}
                  </span>
                  {/* Badge Marker D4 */}
                  {renderMarkerPill(markerMap.get('D4') || markerMap.get('D3'), selectedAddress, handleMarkerClick, setHoveredMarker)}
                </div>
              </div>

              {/* Row 5: Professor (D5) e Turma/Série (H5 / J4) */}
              <div className="grid grid-cols-12 border-b border-slate-200 py-2 px-3 items-center text-xs hover:bg-blue-50/50 transition-colors">
                <div className="col-span-1 font-mono text-[10px] text-slate-400 font-bold">L5</div>
                <div className="col-span-2 font-bold text-slate-700">Professor(a):</div>
                <div className="col-span-4 flex items-center justify-between bg-white border border-slate-300 rounded px-2.5 py-1">
                  <span className="font-semibold text-slate-800 truncate">
                    {planMetadata?.teacherName || 'Professor(a) Titular - PEI'}
                  </span>
                  {/* Badge Marker D5 */}
                  {renderMarkerPill(markerMap.get('D5'), selectedAddress, handleMarkerClick, setHoveredMarker)}
                </div>
                <div className="col-span-2 text-right pr-2 font-bold text-slate-700">Turma / Série:</div>
                <div className="col-span-3 flex items-center justify-between bg-white border border-slate-300 rounded px-2.5 py-1">
                  <span className="font-semibold text-slate-800 truncate">
                    {planMetadata?.grade || '1ª Série do Ensino Médio'}
                  </span>
                  {/* Badge Marker H5 ou J4 */}
                  {renderMarkerPill(markerMap.get('H5') || markerMap.get('J4'), selectedAddress, handleMarkerClick, setHoveredMarker)}
                </div>
              </div>

              {/* Row 6: Disciplina (D6) e Bimestre (H6 / J3) */}
              <div className="grid grid-cols-12 border-b border-slate-300 py-2 px-3 items-center text-xs hover:bg-blue-50/50 transition-colors">
                <div className="col-span-1 font-mono text-[10px] text-slate-400 font-bold">L6</div>
                <div className="col-span-2 font-bold text-slate-700">Componente / Matéria:</div>
                <div className="col-span-4 flex items-center justify-between bg-white border border-slate-300 rounded px-2.5 py-1">
                  <span className="font-bold text-blue-900 truncate">
                    {planMetadata?.subject || 'Química'}
                  </span>
                  {/* Badge Marker D6 */}
                  {renderMarkerPill(markerMap.get('D6') || markerMap.get('D4_SUB'), selectedAddress, handleMarkerClick, setHoveredMarker)}
                </div>
                <div className="col-span-2 text-right pr-2 font-bold text-slate-700">Bimestre:</div>
                <div className="col-span-3 flex items-center justify-between bg-white border border-slate-300 rounded px-2.5 py-1">
                  <span className="font-bold text-emerald-900 truncate">
                    {planMetadata?.bimestre || '4º Bimestre'}
                  </span>
                  {/* Badge Marker H6 ou J3 */}
                  {renderMarkerPill(markerMap.get('H6') || markerMap.get('J3'), selectedAddress, handleMarkerClick, setHoveredMarker)}
                </div>
              </div>
            </div>

            {/* ============================================================ */}
            {/* SEÇÃO 2: BLOCOS REFLEXIVOS E INSTRUÇÕES PEDAGÓGICAS (L13 - L17) */}
            {/* ============================================================ */}
            <div className="border-b-2 border-purple-300 bg-purple-50/30 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-purple-950 pb-1 border-b border-purple-200">
                <span className="flex items-center gap-1.5 uppercase tracking-wide">
                  <BookOpen className="w-3.5 h-3.5 text-purple-700" />
                  Blocos de Orientações e Reflexões Pedagógicas (Linhas 13 a 17)
                </span>
                <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-mono">
                  Preservados &amp; Injetáveis
                </span>
              </div>

              {/* Row 13: B13 */}
              <div 
                onClick={() => handleCellClick('B13')}
                className="flex items-center justify-between bg-white border border-purple-200 rounded-lg p-2 text-xs hover:border-purple-400 cursor-pointer transition-all hover:shadow-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-purple-900 bg-purple-100 px-1.5 py-0.5 rounded text-[10px]">
                    L13 / B13
                  </span>
                  <span className="text-slate-700 font-medium italic text-[11px]">
                    ⚠️ Instrução Pedagógica: As habilidades devem contemplar estritamente o Currículo Paulista e o Material Digital SEDUC-SP.
                  </span>
                </div>
                {renderMarkerPill(markerMap.get('B13'), selectedAddress, handleMarkerClick, setHoveredMarker, 'B13')}
              </div>

              {/* Row 14: B14 */}
              <div 
                onClick={() => handleCellClick('B14')}
                className="flex items-center justify-between bg-white border border-purple-200 rounded-lg p-2 text-xs hover:border-purple-400 cursor-pointer transition-all hover:shadow-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-purple-900 bg-purple-100 px-1.5 py-0.5 rounded text-[10px]">
                    L14 / B14
                  </span>
                  <span className="text-slate-700 font-medium text-[11px]">
                    Prever metodologias ativas, registros formativos contínuos e atendimento prioritário para estudantes com defasagens em ATPC.
                  </span>
                </div>
                {renderMarkerPill(markerMap.get('B14'), selectedAddress, handleMarkerClick, setHoveredMarker, 'B14')}
              </div>

              {/* Row 15: B15 */}
              <div 
                onClick={() => handleCellClick('B15')}
                className="flex items-center justify-between bg-amber-50/60 border border-amber-300 rounded-lg p-2 text-xs hover:border-amber-500 cursor-pointer transition-all hover:shadow-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-amber-950 bg-amber-200 px-1.5 py-0.5 rounded text-[10px]">
                    L15 / B15
                  </span>
                  <span className="text-amber-950 font-bold text-[11px]">
                    Reserve a Penúltima Semana para Avaliação Oficial (Prova Paulista) e a Última Semana para a SEI (Semana de Estudos Intensivos).
                  </span>
                </div>
                {renderMarkerPill(markerMap.get('B15'), selectedAddress, handleMarkerClick, setHoveredMarker, 'B15')}
              </div>

              {/* Row 17: B17 (se existir) */}
              {markerMap.has('B17') && (
                <div 
                  onClick={() => handleCellClick('B17')}
                  className="flex items-center justify-between bg-white border border-purple-200 rounded-lg p-2 text-xs hover:border-purple-400 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-purple-900 bg-purple-100 px-1.5 py-0.5 rounded text-[10px]">
                      L17 / B17
                    </span>
                    <span className="text-slate-700 font-medium text-[11px]">
                      {markerMap.get('B17')?.label || 'Diretrizes Metodológicas de Alinhamento Curricular'}
                    </span>
                  </div>
                  {renderMarkerPill(markerMap.get('B17'), selectedAddress, handleMarkerClick, setHoveredMarker, 'B17')}
                </div>
              )}
            </div>

            {/* ============================================================ */}
            {/* SEÇÃO 3: CRITÉRIOS DE AVALIAÇÃO E PESOS PERCENTUAIS (L21 - L24) */}
            {/* ============================================================ */}
            <div className="border-b-2 border-amber-300 bg-amber-50/30 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-amber-950 pb-1 border-b border-amber-200">
                <span className="flex items-center gap-1.5 uppercase tracking-wide">
                  <Award className="w-3.5 h-3.5 text-amber-700" />
                  Instrumentos Avaliativos e Pesos (Linhas 21 a 24 - C21 a J24)
                </span>
                <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded font-mono font-bold">
                  Pesos &amp; Prova Paulista
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                {/* Card Instrumento 1: Prova Paulista */}
                <div 
                  onClick={() => handleCellClick('C21')}
                  className="bg-white p-2 rounded-lg border border-amber-200 flex items-center justify-between hover:border-amber-400 cursor-pointer transition-all hover:shadow-xs"
                >
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 block">Instrumento 1:</span>
                    <span className="font-bold text-slate-800">Prova Paulista (30%)</span>
                  </div>
                  {renderMarkerPill(markerMap.get('C21') || markerMap.get('H21'), selectedAddress, handleMarkerClick, setHoveredMarker, 'C21')}
                </div>

                {/* Card Instrumento 2: Avaliação Formativa */}
                <div 
                  onClick={() => handleCellClick('D21')}
                  className="bg-white p-2 rounded-lg border border-amber-200 flex items-center justify-between hover:border-amber-400 cursor-pointer transition-all hover:shadow-xs"
                >
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 block">Instrumento 2:</span>
                    <span className="font-bold text-slate-800">Avaliação Bimestral (30%)</span>
                  </div>
                  {renderMarkerPill(markerMap.get('D21') || markerMap.get('J21'), selectedAddress, handleMarkerClick, setHoveredMarker, 'D21')}
                </div>

                {/* Card Instrumento 3: Produções & Diário de Bordo */}
                <div 
                  onClick={() => handleCellClick('E21')}
                  className="bg-white p-2 rounded-lg border border-amber-200 flex items-center justify-between hover:border-amber-400 cursor-pointer transition-all hover:shadow-xs"
                >
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 block">Instrumento 3:</span>
                    <span className="font-bold text-slate-800">Atividades &amp; Diário (20%)</span>
                  </div>
                  {renderMarkerPill(markerMap.get('E21'), selectedAddress, handleMarkerClick, setHoveredMarker, 'E21')}
                </div>

                {/* Card Instrumento 4: Autoavaliação & SEI */}
                <div 
                  onClick={() => handleCellClick('H21')}
                  className="bg-white p-2 rounded-lg border border-amber-200 flex items-center justify-between hover:border-amber-400 cursor-pointer transition-all hover:shadow-xs"
                >
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 block">Instrumento 4:</span>
                    <span className="font-bold text-slate-800">SEI / Nivelamento (20%)</span>
                  </div>
                  {renderMarkerPill(markerMap.get('H21') || markerMap.get('J24'), selectedAddress, handleMarkerClick, setHoveredMarker, 'H21')}
                </div>
              </div>
            </div>

            {/* ============================================================ */}
            {/* SEÇÃO 4: TABELA SEMANAL DE PLANEJAMENTO (LINHAS 27 A 37+)     */}
            {/* ============================================================ */}
            <div className="overflow-x-auto">
              <div className="bg-slate-900 text-white px-3 py-2 flex items-center justify-between text-xs">
                <span className="font-bold flex items-center gap-1.5 uppercase tracking-wide text-cyan-300">
                  <Calendar className="w-3.5 h-3.5" />
                  Grade Curricular de Aulas Semanais (Colunas B, D, E, F, G, H, I a partir da Linha 28)
                </span>
                <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                  10 Semanas Letivas
                </span>
              </div>

              {/* Table Column Headers (Row 27) */}
              <div className="grid grid-cols-12 bg-[#002B49] text-white text-[11px] font-bold text-center py-2 px-1 border-b border-[#001D33]">
                <div className="col-span-1 border-r border-blue-900/60 font-mono text-cyan-300">LINHA</div>
                <div className="col-span-2 border-r border-blue-900/60 px-1">COL B: Data / Semana</div>
                <div className="col-span-2 border-r border-blue-900/60 px-1">COL D: Habilidade / Objeto</div>
                <div className="col-span-2 border-r border-blue-900/60 px-1">COL E: Objetivos</div>
                <div className="col-span-2 border-r border-blue-900/60 px-1">COL F: Metodologia</div>
                <div className="col-span-1 border-r border-blue-900/60 px-1">COL G: Passo</div>
                <div className="col-span-1 border-r border-blue-900/60 px-1">COL H: Aval.</div>
                <div className="col-span-1 px-1">COL I: SEI</div>
              </div>

              {/* 10 Weekly Rows (Rows 28 to 37) */}
              <div className="divide-y divide-slate-200 text-xs">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(week => {
                  const rowNum = 27 + week;
                  const isSEI = week === 10;
                  const isAval = week === 9;

                  const bMarker = markerMap.get(`B${rowNum}`);
                  const dMarker = markerMap.get(`D${rowNum}`);
                  const eMarker = markerMap.get(`E${rowNum}`);
                  const fMarker = markerMap.get(`F${rowNum}`);
                  const gMarker = markerMap.get(`G${rowNum}`);
                  const hMarker = markerMap.get(`H${rowNum}`);
                  const iMarker = markerMap.get(`I${rowNum}`);

                  const isRowSelected = selectedAddress && (
                    selectedAddress === `B${rowNum}` ||
                    selectedAddress === `D${rowNum}` ||
                    selectedAddress === `E${rowNum}` ||
                    selectedAddress === `F${rowNum}` ||
                    selectedAddress === `G${rowNum}` ||
                    selectedAddress === `H${rowNum}` ||
                    selectedAddress === `I${rowNum}`
                  );

                  return (
                    <div
                      key={week}
                      className={`grid grid-cols-12 py-1.5 px-1 items-center transition-colors ${
                        isRowSelected
                          ? 'bg-amber-50 ring-2 ring-amber-400/50'
                          : isSEI
                          ? 'bg-amber-100/40 hover:bg-amber-100/60'
                          : isAval
                          ? 'bg-blue-50/50 hover:bg-blue-100/50'
                          : week % 2 === 0
                          ? 'bg-slate-50/70 hover:bg-slate-100/70'
                          : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      {/* Row Label */}
                      <div className="col-span-1 text-center font-mono font-bold text-slate-500 text-[10px]">
                        L{rowNum}
                      </div>

                      {/* Col B: Data / Semana */}
                      <div 
                        onClick={() => handleCellClick(`B${rowNum}`)}
                        className="col-span-2 px-1 flex items-center justify-between border-r border-slate-200 cursor-pointer truncate"
                      >
                        <span className="font-semibold text-slate-700 text-[11px] truncate">
                          {bMarker?.value ? bMarker.value.slice(0, 20) : `Semana ${week}`}
                        </span>
                        {renderMarkerPill(bMarker, selectedAddress, handleMarkerClick, setHoveredMarker, `B${rowNum}`)}
                      </div>

                      {/* Col D: Habilidade / Objeto */}
                      <div 
                        onClick={() => handleCellClick(`D${rowNum}`)}
                        className="col-span-2 px-1 flex items-center justify-between border-r border-slate-200 cursor-pointer truncate"
                      >
                        <span className="font-bold text-blue-900 text-[11px] truncate" title={dMarker?.value}>
                          {dMarker?.value ? dMarker.value.slice(0, 24) : `Hab. Sem ${week}`}
                        </span>
                        {renderMarkerPill(dMarker, selectedAddress, handleMarkerClick, setHoveredMarker, `D${rowNum}`)}
                      </div>

                      {/* Col E: Objetivos */}
                      <div 
                        onClick={() => handleCellClick(`E${rowNum}`)}
                        className="col-span-2 px-1 flex items-center justify-between border-r border-slate-200 cursor-pointer truncate"
                      >
                        <span className="text-slate-600 text-[11px] truncate" title={eMarker?.value}>
                          {eMarker?.value ? eMarker.value.slice(0, 22) : 'Objetivo da aula'}
                        </span>
                        {renderMarkerPill(eMarker, selectedAddress, handleMarkerClick, setHoveredMarker, `E${rowNum}`)}
                      </div>

                      {/* Col F: Metodologia */}
                      <div 
                        onClick={() => handleCellClick(`F${rowNum}`)}
                        className="col-span-2 px-1 flex items-center justify-between border-r border-slate-200 cursor-pointer truncate"
                      >
                        <span className="text-slate-600 text-[11px] truncate" title={fMarker?.value}>
                          {fMarker?.value ? fMarker.value.slice(0, 22) : 'Estratégia metodológica'}
                        </span>
                        {renderMarkerPill(fMarker, selectedAddress, handleMarkerClick, setHoveredMarker, `F${rowNum}`)}
                      </div>

                      {/* Col G: Passo a Passo */}
                      <div 
                        onClick={() => handleCellClick(`G${rowNum}`)}
                        className="col-span-1 px-1 flex items-center justify-center border-r border-slate-200 cursor-pointer"
                      >
                        {renderMarkerPill(gMarker, selectedAddress, handleMarkerClick, setHoveredMarker, `G${rowNum}`)}
                      </div>

                      {/* Col H: Avaliação */}
                      <div 
                        onClick={() => handleCellClick(`H${rowNum}`)}
                        className="col-span-1 px-1 flex items-center justify-center border-r border-slate-200 cursor-pointer"
                      >
                        {renderMarkerPill(hMarker, selectedAddress, handleMarkerClick, setHoveredMarker, `H${rowNum}`)}
                      </div>

                      {/* Col I: Recuperação / SEI */}
                      <div 
                        onClick={() => handleCellClick(`I${rowNum}`)}
                        className="col-span-1 px-1 flex items-center justify-center cursor-pointer"
                      >
                        {renderMarkerPill(iMarker, selectedAddress, handleMarkerClick, setHoveredMarker, `I${rowNum}`)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>

        {/* Modal / Quick Action when an unmapped cell is clicked */}
        {clickedCellForAdd && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900 border border-slate-700 text-white p-4 rounded-xl shadow-2xl z-50 animate-in fade-in zoom-in-95 w-80">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="font-mono font-bold text-amber-400 text-sm flex items-center gap-1.5">
                <MapPin className="w-4 h-4" /> Célula {clickedCellForAdd}
              </span>
              <button 
                onClick={() => setClickedCellForAdd(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-300 mt-2 mb-3">
              A coordenada <strong>{clickedCellForAdd}</strong> ainda não está mapeada no perfil atual. Deseja adicioná-la como célula livre?
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setClickedCellForAdd(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleConfirmAddCoord(clickedCellForAdd)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar Célula
              </button>
            </div>
          </div>
        )}

        {/* Floating Tooltip / Popover on Badge Hover */}
        {hoveredMarker && (
          <div className="fixed bottom-6 right-6 max-w-sm bg-slate-950/95 border-2 border-blue-500 text-white p-3.5 rounded-xl shadow-2xl z-50 pointer-events-none backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-sm px-2 py-0.5 rounded bg-blue-600 text-white shadow-xs">
                  {hoveredMarker.address}
                </span>
                <span className="text-xs font-bold text-slate-200 truncate">
                  {hoveredMarker.label}
                </span>
              </div>
              <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded uppercase ${
                hoveredMarker.mode === 'literal'
                  ? 'bg-slate-800 text-slate-300 border border-slate-700'
                  : 'bg-purple-900/80 text-purple-200 border border-purple-700'
              }`}>
                {hoveredMarker.mode === 'literal' ? '[Fixo]' : '[IA]'}
              </span>
            </div>

            <div className="mt-2 space-y-1 text-xs">
              {hoveredMarker.sectionTitle && (
                <div className="text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-500">Seção:</span> {hoveredMarker.sectionTitle}
                </div>
              )}
              {hoveredMarker.value && (
                <div className="text-[11px] text-slate-300 bg-slate-900/80 p-2 rounded border border-slate-800 italic">
                  <span className="font-semibold text-cyan-400 not-italic block mb-0.5">Conteúdo Injetado:</span>
                  "{hoveredMarker.value}"
                </div>
              )}
              {hoveredMarker.sourcePage ? (
                <div className="text-[10px] text-sky-300 bg-sky-950/60 p-1.5 rounded border border-sky-800/80 flex items-center gap-1.5 font-sans not-italic">
                  <span className="font-bold">Origem:</span>
                  <span>📄 Pág. {hoveredMarker.sourcePage} do Guia Priorizado PDF</span>
                </div>
              ) : hoveredMarker.sourceReference ? (
                <div className="text-[10px] text-emerald-300 bg-emerald-950/60 p-1.5 rounded border border-emerald-800/80 flex items-center gap-1.5 font-sans not-italic">
                  <span className="font-bold">Origem:</span>
                  <span>📚 {hoveredMarker.sourceReference}</span>
                </div>
              ) : null}
            </div>

            <div className="mt-2 text-[10px] text-blue-400 font-semibold flex items-center gap-1">
              <MousePointerClick className="w-3 h-3" /> Clique para destacar e editar no formulário
            </div>
          </div>
        )}
      </div>

      {/* Bottom Summary Bar */}
      <div className="bg-slate-950 px-4 py-2.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>
            Total de <strong>{markers.length}</strong> células mapeadas sobre a planilha.
          </span>
        </div>
        <div className="text-[11px]">
          Dica: Clique em qualquer célula vazia para adicionar uma nova coordenada livre ao perfil.
        </div>
      </div>
    </div>
  );
};

// Helper function to render a badge pin inside a cell
function renderMarkerPill(
  marker: VisualMarker | undefined,
  selectedAddress: string | null | undefined,
  onClick: (m: VisualMarker, e?: React.MouseEvent) => void,
  onHover: (m: VisualMarker | null) => void,
  fallbackAddr?: string
) {
  if (!marker) {
    if (fallbackAddr) {
      return (
        <span 
          className="font-mono text-[9px] text-slate-400 hover:text-indigo-600 px-1 py-0.2 rounded hover:bg-slate-100 transition-colors"
          title={`Coordenada ${fallbackAddr} (não mapeada)`}
        >
          {fallbackAddr}
        </span>
      );
    }
    return null;
  }

  const isSelected = selectedAddress === marker.address;

  let colorClasses = 'bg-slate-700 text-white border-slate-600';
  switch (marker.category) {
    case 'header':
      colorClasses = 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700';
      break;
    case 'reflexive':
      colorClasses = 'bg-purple-600 hover:bg-purple-700 text-white border-purple-700';
      break;
    case 'assessment':
      colorClasses = 'bg-amber-600 hover:bg-amber-700 text-white border-amber-700';
      break;
    case 'weekly_grid':
      colorClasses = 'bg-[#002B49] hover:bg-[#003B66] text-white border-[#001D33]';
      break;
    default:
      colorClasses = 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-700';
  }

  if (isSelected) {
    colorClasses = 'bg-amber-400 text-slate-950 font-black border-2 border-amber-600 ring-2 ring-amber-300 shadow-md animate-pulse';
  }

  return (
    <button
      type="button"
      onClick={(e) => onClick(marker, e)}
      onMouseEnter={() => onHover(marker)}
      onMouseLeave={() => onHover(null)}
      className={`font-mono text-[10px] px-1.5 py-0.5 rounded border transition-all cursor-pointer flex items-center gap-1 shrink-0 ${colorClasses}`}
      title={`${marker.address}: ${marker.label}`}
    >
      <span>{marker.address}</span>
      <span className="text-[8px] opacity-75">
        {marker.mode === 'literal' ? '[F]' : '[IA]'}
      </span>
    </button>
  );
}
