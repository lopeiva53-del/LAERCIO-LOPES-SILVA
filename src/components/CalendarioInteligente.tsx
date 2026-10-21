import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Edit2,
  RotateCcw,
  Clock,
  Shield,
  Layers,
  Sparkles
} from 'lucide-react';
import {
  CalendarioEvento,
  EventoTipo,
  gerarCalendarioIA,
  getCalendarioEventos,
  salvarCalendarioEvento,
  excluirCalendarioEvento,
  resetarCalendarioOficial,
  isDataLetiva,
  CalendarioIANativo,
  EVENTO_CORES
} from '../services/calendarioService';

interface CalendarioInteligenteProps {
  isOpen: boolean;
  onClose: () => void;
  anoInicial?: number;
  onCalendarioChange?: (calendarioIA: CalendarioIANativo) => void;
}

type ViewMode = 'mensal' | 'semanal' | 'anual';

export const CalendarioInteligente: React.FC<CalendarioInteligenteProps> = ({
  isOpen,
  onClose,
  anoInicial = 2026,
  onCalendarioChange
}) => {
  const [ano, setAno] = useState<number>(anoInicial);
  const [mesAtual, setMesAtual] = useState<number>(1); // 0-indexed: 1 = Fevereiro (Início do ano letivo)
  const [semanaData, setSemanaData] = useState<Date>(new Date(anoInicial, 1, 2)); // 02/02/2026
  const [viewMode, setViewMode] = useState<ViewMode>('mensal');
  const [eventos, setEventos] = useState<CalendarioEvento[]>(() => getCalendarioEventos(anoInicial));

  // Modal de edição / criação
  const [modalAberto, setModalAberto] = useState<boolean>(false);
  const [eventoSelecionado, setEventoSelecionado] = useState<CalendarioEvento | null>(null);
  const [dataSelecionada, setDataSelecionada] = useState<string>(`${anoInicial}-02-02`);
  const [formTitulo, setFormTitulo] = useState<string>('');
  const [formTipo, setFormTipo] = useState<EventoTipo>('ESCOLA');
  const [formDescricao, setFormDescricao] = useState<string>('');
  const [formDiaLetivo, setFormDiaLetivo] = useState<boolean>(true);
  const [formErro, setFormErro] = useState<string | null>(null);

  // Confirmação para alteração de status letivo de evento oficial
  const [confirmacaoOficialAberta, setConfirmacaoOficialAberta] = useState<boolean>(false);

  // Recarrega eventos
  const recarregar = () => {
    const evs = getCalendarioEventos(ano);
    setEventos([...evs]);
    if (onCalendarioChange) {
      onCalendarioChange(gerarCalendarioIA(ano));
    }
  };

  useEffect(() => {
    const handleUpdate = () => {
      recarregar();
    };
    window.addEventListener('seduc-calendario-updated', handleUpdate);
    return () => window.removeEventListener('seduc-calendario-updated', handleUpdate);
  }, [ano]);

  // Indexação rápida por data
  const eventosPorData = useMemo(() => {
    const map = new Map<string, CalendarioEvento[]>();
    eventos.forEach(ev => {
      if (!map.has(ev.data)) {
        map.set(ev.data, []);
      }
      map.get(ev.data)!.push(ev);
    });
    return map;
  }, [eventos]);

  // Total de dias letivos computado em tempo real
  const totalDiasLetivos = useMemo(() => {
    const res = gerarCalendarioIA(ano);
    return res.totalDiasLetivos;
  }, [eventos, ano]);

  if (!isOpen) return null;

  // Nomes dos meses e dias
  const nomesMeses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  // Navegação
  const handleAnterior = () => {
    if (viewMode === 'mensal') {
      if (mesAtual === 0) {
        setMesAtual(11);
        setAno(ano - 1);
      } else {
        setMesAtual(mesAtual - 1);
      }
    } else if (viewMode === 'semanal') {
      const prev = new Date(semanaData);
      prev.setDate(prev.getDate() - 7);
      setSemanaData(prev);
    } else {
      setAno(ano - 1);
    }
  };

  const handleProximo = () => {
    if (viewMode === 'mensal') {
      if (mesAtual === 11) {
        setMesAtual(0);
        setAno(ano + 1);
      } else {
        setMesAtual(mesAtual + 1);
      }
    } else if (viewMode === 'semanal') {
      const next = new Date(semanaData);
      next.setDate(next.getDate() + 7);
      setSemanaData(next);
    } else {
      setAno(ano + 1);
    }
  };

  const handleHoje = () => {
    const today = new Date();
    setAno(anoInicial);
    setMesAtual(today.getMonth());
    setSemanaData(today);
  };

  // Abre modal para cadastrar novo ou editar
  const handleAbrirData = (dataStr: string, eventoExistente?: CalendarioEvento) => {
    setFormErro(null);
    setDataSelecionada(dataStr);

    if (eventoExistente) {
      setEventoSelecionado(eventoExistente);
      setFormTitulo(eventoExistente.titulo);
      setFormTipo(eventoExistente.tipo);
      setFormDescricao(eventoExistente.descricao || '');
      setFormDiaLetivo(eventoExistente.diaLetivo);
    } else {
      // Novo evento
      const parts = dataStr.split('-').map(Number);
      const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;

      setEventoSelecionado(null);
      setFormTitulo('');
      setFormTipo(isWeekend ? 'ESCOLA' : 'SEDUC');
      setFormDescricao('');
      setFormDiaLetivo(!isWeekend);
    }
    setModalAberto(true);
  };

  // Salvar evento
  const handleSalvarEvento = (confirmouOficial: boolean = false) => {
    setFormErro(null);
    if (!formTitulo.trim()) {
      setFormErro('Por favor, informe o título do evento.');
      return;
    }

    // Se estiver editando um evento oficial da SEDUC e alterando diaLetivo
    if (
      eventoSelecionado &&
      eventoSelecionado.origem === 'SEDUC_OFICIAL' &&
      eventoSelecionado.diaLetivo !== formDiaLetivo &&
      !confirmouOficial
    ) {
      setConfirmacaoOficialAberta(true);
      return;
    }

    const payload: CalendarioEvento = {
      id: eventoSelecionado?.id || `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      data: dataSelecionada,
      tipo: formTipo,
      titulo: formTitulo.trim(),
      descricao: formDescricao.trim() || undefined,
      diaLetivo: formDiaLetivo,
      origem: eventoSelecionado?.origem || 'USUARIO'
    };

    const res = salvarCalendarioEvento(payload, ano);
    if (!res.success) {
      setFormErro(res.error || 'Erro ao salvar evento.');
      return;
    }

    setModalAberto(false);
    setConfirmacaoOficialAberta(false);
    recarregar();
  };

  // Excluir evento
  const handleExcluirEvento = () => {
    if (!eventoSelecionado) return;
    const res = excluirCalendarioEvento(eventoSelecionado.id, ano);
    if (!res.success) {
      setFormErro(res.error || 'Não foi possível excluir.');
      return;
    }
    setModalAberto(false);
    recarregar();
  };

  // Formata data amigável
  const formatarDataBr = (dataStr: string) => {
    const parts = dataStr.split('-');
    if (parts.length !== 3) return dataStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-6xl h-[92vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Top Header estilo Google Calendar */}
        <div className="bg-gradient-to-r from-[#002B49] via-[#003865] to-[#004B87] text-white px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center">
              <CalendarIcon className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight text-white">
                  Calendário Escolar Inteligente
                </h2>
                <span className="text-[10px] uppercase font-mono font-bold bg-amber-400 text-slate-950 px-1.5 py-0.5 rounded shadow-2xs">
                  SEDUC-SP {ano}
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Oficial automatizado • Feriados SP, recessos e bimestres integrados
              </p>
            </div>
          </div>

          {/* Contador de Dias Letivos Canônico */}
          <div className="flex items-center gap-2">
            <div className="bg-white/10 border border-white/20 rounded-xl px-3 py-1.5 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-300 block uppercase font-bold tracking-wider">
                  Dias Letivos Oficiais
                </span>
                <span className="text-sm font-black text-white">
                  {totalDiasLetivos} dias
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                if (window.confirm('Deseja restaurar o calendário oficial padrão da SEDUC-SP (2026)? Alterações manuais serão reiniciadas.')) {
                  resetarCalendarioOficial(ano);
                  recarregar();
                }
              }}
              className="text-xs bg-white/10 hover:bg-white/20 text-slate-200 px-2.5 py-2 rounded-lg border border-white/10 flex items-center gap-1.5 transition-all"
              title="Restaurar grade oficial homologada"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Restaurar Oficial</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
              title="Fechar calendário"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Toolbar de Navegação e Alternância de Visualização */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 sm:px-6 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleHoje}
              className="text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 px-3 py-1.5 rounded-lg transition-all shadow-2xs"
            >
              Hoje
            </button>
            <div className="flex items-center rounded-lg border border-slate-300 bg-white shadow-2xs overflow-hidden">
              <button
                onClick={handleAnterior}
                className="p-1.5 hover:bg-slate-100 text-slate-600 transition-colors"
                title="Período anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleProximo}
                className="p-1.5 hover:bg-slate-100 text-slate-600 transition-colors border-l border-slate-200"
                title="Próximo período"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <h3 className="text-sm sm:text-base font-extrabold text-slate-800 ml-2">
              {viewMode === 'mensal' && `${nomesMeses[mesAtual]} de ${ano}`}
              {viewMode === 'semanal' && `Semana de ${semanaData.toLocaleDateString('pt-BR')} • ${ano}`}
              {viewMode === 'anual' && `Visão Anual Completa • ${ano}`}
            </h3>
          </div>

          {/* Alternância Mensal / Semanal / Anual */}
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-200/80 p-0.5 rounded-lg border border-slate-300 text-xs font-bold">
              <button
                type="button"
                onClick={() => setViewMode('mensal')}
                className={`px-3 py-1 rounded-md transition-all ${
                  viewMode === 'mensal'
                    ? 'bg-[#002B49] text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Mensal
              </button>
              <button
                type="button"
                onClick={() => setViewMode('semanal')}
                className={`px-3 py-1 rounded-md transition-all ${
                  viewMode === 'semanal'
                    ? 'bg-[#002B49] text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Semanal
              </button>
              <button
                type="button"
                onClick={() => setViewMode('anual')}
                className={`px-3 py-1 rounded-md transition-all ${
                  viewMode === 'anual'
                    ? 'bg-[#002B49] text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Anual
              </button>
            </div>

            <button
              onClick={() => handleAbrirData(new Date().toISOString().split('T')[0])}
              className="bg-[#005A9C] hover:bg-[#004B87] text-white font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar Evento</span>
            </button>
          </div>
        </div>

        {/* Legenda de Cores Oficiais */}
        <div className="bg-white border-b border-slate-100 px-4 py-1.5 sm:px-6 flex items-center gap-2 flex-wrap text-[11px] shrink-0 text-slate-600">
          <span className="font-bold text-slate-700 mr-1">Legenda:</span>
          <span className="flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded">
            <span className="w-2 h-2 rounded-full bg-emerald-600"></span> SEDUC
          </span>
          <span className="flex items-center gap-1 bg-rose-50 text-rose-800 border border-rose-200 px-1.5 py-0.5 rounded">
            <span className="w-2 h-2 rounded-full bg-rose-600"></span> FERIADO
          </span>
          <span className="flex items-center gap-1 bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded">
            <span className="w-2 h-2 rounded-full bg-blue-600"></span> ESCOLA
          </span>
          <span className="flex items-center gap-1 bg-purple-50 text-purple-800 border border-purple-200 px-1.5 py-0.5 rounded">
            <span className="w-2 h-2 rounded-full bg-purple-600"></span> PROJETO
          </span>
          <span className="flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded">
            <span className="w-2 h-2 rounded-full bg-amber-600"></span> AVALIAÇÃO
          </span>
          <span className="flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-300 px-1.5 py-0.5 rounded">
            <span className="w-2 h-2 rounded-full bg-slate-400"></span> SÁBADO
          </span>
          <span className="flex items-center gap-1 bg-slate-200 text-slate-800 border border-slate-400 px-1.5 py-0.5 rounded">
            <span className="w-2 h-2 rounded-full bg-slate-600"></span> DOMINGO
          </span>
        </div>

        {/* Área Central: Visualização Selecionada */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 bg-slate-100/60">
          {/* VISÃO MENSAL (Google Calendar Style) */}
          {viewMode === 'mensal' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden h-full flex flex-col">
              {/* Cabeçalho dos Dias da Semana */}
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center font-bold text-xs text-slate-600 py-2">
                {diasSemana.map((dia, idx) => (
                  <div key={dia} className={`${idx === 0 || idx === 6 ? 'text-slate-400' : ''}`}>
                    {dia}
                  </div>
                ))}
              </div>

              {/* Grid dos Dias */}
              <div className="grid grid-cols-7 flex-1 auto-rows-fr divide-x divide-y divide-slate-100">
                {(() => {
                  const primeiroDiaMes = new Date(ano, mesAtual, 1);
                  const primeiroDiaSemana = primeiroDiaMes.getDay(); // 0 a 6
                  const ultimoDiaMes = new Date(ano, mesAtual + 1, 0).getDate();
                  const totalCells = Math.ceil((primeiroDiaSemana + ultimoDiaMes) / 7) * 7;

                  const cells = [];
                  for (let i = 0; i < totalCells; i++) {
                    const diaNum = i - primeiroDiaSemana + 1;
                    const ehMesAtual = diaNum > 0 && diaNum <= ultimoDiaMes;

                    if (!ehMesAtual) {
                      cells.push(
                        <div key={`empty-${i}`} className="bg-slate-50/50 p-1 min-h-[90px] border-slate-100"></div>
                      );
                      continue;
                    }

                    const mm = String(mesAtual + 1).padStart(2, '0');
                    const dd = String(diaNum).padStart(2, '0');
                    const dataStr = `${ano}-${mm}-${dd}`;
                    const curDate = new Date(ano, mesAtual, diaNum, 12, 0, 0);
                    const dayOfWeek = curDate.getDay();
                    const isSaturday = dayOfWeek === 6;
                    const isSunday = dayOfWeek === 0;
                    const evs = eventosPorData.get(dataStr) || [];
                    const letivo = isDataLetiva(dataStr, eventosPorData, ano);

                    cells.push(
                      <div
                        key={dataStr}
                        onClick={() => handleAbrirData(dataStr)}
                        className={`p-1.5 min-h-[95px] flex flex-col cursor-pointer transition-colors relative hover:bg-blue-50/40 ${
                          isSunday
                            ? 'bg-slate-100/60'
                            : isSaturday
                            ? 'bg-slate-50/80'
                            : 'bg-white'
                        }`}
                      >
                        {/* Indicador do Dia e Status Letivo */}
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                              letivo
                                ? 'bg-emerald-100 text-emerald-800'
                                : isSunday
                                ? 'bg-slate-600 text-white'
                                : isSaturday
                                ? 'bg-slate-400 text-white'
                                : 'text-slate-700'
                            }`}
                          >
                            {diaNum}
                          </span>

                          <span
                            className={`text-[9px] font-bold px-1 rounded ${
                              letivo
                                ? 'text-emerald-700 bg-emerald-50'
                                : 'text-slate-400 bg-slate-100'
                            }`}
                          >
                            {letivo ? 'Letivo' : 'Não Letivo'}
                          </span>
                        </div>

                        {/* Badges de Eventos */}
                        <div className="flex-1 space-y-1 overflow-y-auto max-h-[75px]">
                          {evs.map(ev => {
                            const cor = EVENTO_CORES[ev.tipo] || EVENTO_CORES.OUTRO;
                            return (
                              <div
                                key={ev.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAbrirData(dataStr, ev);
                                }}
                                className={`text-[10px] font-semibold truncate rounded px-1.5 py-0.5 cursor-pointer shadow-2xs hover:opacity-90 ${cor.bg} ${cor.text}`}
                                title={`${ev.titulo} (${ev.tipo}) - ${ev.diaLetivo ? 'Dia Letivo' : 'Não Letivo'}`}
                              >
                                {ev.origem === 'SEDUC_OFICIAL' && '★ '}
                                {ev.titulo}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  return cells;
                })()}
              </div>
            </div>
          )}

          {/* VISÃO SEMANAL DETALHADA */}
          {viewMode === 'semanal' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
                {(() => {
                  const startOfWeek = new Date(semanaData);
                  const day = startOfWeek.getDay();
                  const diff = startOfWeek.getDate() - day; // Domingo como início
                  const sunday = new Date(startOfWeek.setDate(diff));

                  const weekDays = [];
                  for (let i = 0; i < 7; i++) {
                    const d = new Date(sunday);
                    d.setDate(sunday.getDate() + i);
                    weekDays.push(d);
                  }

                  return weekDays.map((d) => {
                    const yyyy = d.getFullYear();
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const dd = String(d.getDate()).padStart(2, '0');
                    const dataStr = `${yyyy}-${mm}-${dd}`;
                    const dayOfWeek = d.getDay();
                    const isSaturday = dayOfWeek === 6;
                    const isSunday = dayOfWeek === 0;
                    const evs = eventosPorData.get(dataStr) || [];
                    const letivo = isDataLetiva(dataStr, eventosPorData, ano);

                    return (
                      <div
                        key={dataStr}
                        onClick={() => handleAbrirData(dataStr)}
                        className={`border rounded-xl p-3 min-h-[300px] flex flex-col cursor-pointer transition-all hover:border-[#005A9C] ${
                          isSunday
                            ? 'bg-slate-100/70 border-slate-300'
                            : isSaturday
                            ? 'bg-slate-50 border-slate-300'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="pb-2 border-b border-slate-100 mb-2 flex items-center justify-between">
                          <div>
                            <span className="text-[11px] font-bold text-slate-500 uppercase block">
                              {diasSemana[dayOfWeek]}
                            </span>
                            <span className="text-base font-black text-slate-900">
                              {d.getDate()}/{d.getMonth() + 1}
                            </span>
                          </div>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              letivo
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {letivo ? '✓ Letivo' : 'Não Letivo'}
                          </span>
                        </div>

                        <div className="space-y-2 flex-1 overflow-y-auto">
                          {evs.map((ev) => {
                            const cor = EVENTO_CORES[ev.tipo] || EVENTO_CORES.OUTRO;
                            return (
                              <div
                                key={ev.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAbrirData(dataStr, ev);
                                }}
                                className={`p-2 rounded-lg text-xs shadow-2xs ${cor.bg} ${cor.text}`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] font-bold uppercase tracking-wider opacity-90">
                                    {ev.tipo}
                                  </span>
                                  {ev.origem === 'SEDUC_OFICIAL' && (
                                    <span className="text-[9px] bg-black/20 px-1 rounded">Oficial</span>
                                  )}
                                </div>
                                <h4 className="font-bold mt-0.5 text-xs">{ev.titulo}</h4>
                                {ev.descricao && (
                                  <p className="text-[10px] opacity-85 mt-1 line-clamp-2">
                                    {ev.descricao}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                          {evs.length === 0 && (
                            <p className="text-[11px] text-slate-400 italic text-center py-6">
                              Sem eventos cadastrados
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* VISÃO ANUAL COMPLETA */}
          {viewMode === 'anual' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {nomesMeses.map((nomeMes, mIdx) => {
                const primeiroDia = new Date(ano, mIdx, 1).getDay();
                const totalDias = new Date(ano, mIdx + 1, 0).getDate();

                return (
                  <div key={nomeMes} className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs">
                    <h4 className="text-xs font-black text-slate-800 mb-2 pb-1 border-b border-slate-100 flex items-center justify-between">
                      <span>{nomeMes}</span>
                      <span className="text-[10px] font-normal text-slate-400">
                        {mIdx >= 1 && mIdx <= 3 ? '1º Bim' : mIdx >= 3 && mIdx <= 6 ? '2º Bim' : mIdx >= 6 && mIdx <= 9 ? '3º Bim' : '4º Bim'}
                      </span>
                    </h4>

                    <div className="grid grid-cols-7 gap-1 text-[9px] text-center font-bold text-slate-400 mb-1">
                      {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, idx) => (
                        <span key={idx}>{d}</span>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1 text-[10px] text-center">
                      {Array.from({ length: primeiroDia }).map((_, i) => (
                        <span key={`emp-${i}`} className="p-0.5"></span>
                      ))}

                      {Array.from({ length: totalDias }).map((_, i) => {
                        const dNum = i + 1;
                        const mm = String(mIdx + 1).padStart(2, '0');
                        const dd = String(dNum).padStart(2, '0');
                        const dataStr = `${ano}-${mm}-${dd}`;
                        const curDate = new Date(ano, mIdx, dNum, 12, 0, 0);
                        const isWeekend = curDate.getDay() === 0 || curDate.getDay() === 6;
                        const evs = eventosPorData.get(dataStr) || [];
                        const letivo = isDataLetiva(dataStr, eventosPorData, ano);

                        let badgeColor = '';
                        if (evs.length > 0) {
                          const topEv = evs[0];
                          badgeColor = EVENTO_CORES[topEv.tipo]?.bg || 'bg-blue-600';
                        }

                        return (
                          <div
                            key={dNum}
                            onClick={() => {
                              setMesAtual(mIdx);
                              setViewMode('mensal');
                            }}
                            className={`p-1 rounded cursor-pointer transition-all ${
                              evs.length > 0
                                ? `${badgeColor} text-white font-bold shadow-2xs`
                                : letivo
                                ? 'hover:bg-emerald-100 text-slate-800 font-semibold'
                                : isWeekend
                                ? 'text-slate-400 bg-slate-100/50'
                                : 'hover:bg-slate-100 text-slate-500'
                            }`}
                            title={evs.length > 0 ? evs.map(e => e.titulo).join(', ') : `${dNum}/${mIdx + 1} - ${letivo ? 'Letivo' : 'Não letivo'}`}
                          >
                            {dNum}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer com Ações e Resumo */}
        <div className="bg-white border-t border-slate-200 px-4 py-3 sm:px-6 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span className="flex items-center gap-1 font-semibold text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Sincronizado diretamente com o robô de injeção da IA
            </span>
          </div>

          <button
            onClick={onClose}
            className="bg-[#002B49] hover:bg-[#003B65] text-white font-bold text-xs px-5 py-2 rounded-lg transition-all shadow-2xs"
          >
            Concluir e Voltar ao Planejamento
          </button>
        </div>
      </div>

      {/* Modal Interativo de Criação e Edição de Evento */}
      {modalAberto && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-3 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-[#002B49]" />
                <h3 className="font-extrabold text-sm text-slate-900">
                  {eventoSelecionado ? 'Editar Evento do Calendário' : 'Novo Evento no Calendário'}
                </h3>
              </div>
              <button
                onClick={() => setModalAberto(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formErro && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-2.5 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{formErro}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              {/* Data (somente leitura ou formatada) */}
              <div>
                <label className="block text-slate-600 font-bold mb-1">
                  Data:
                </label>
                <input
                  type="text"
                  readOnly
                  value={`${formatarDataBr(dataSelecionada)} (${dataSelecionada})`}
                  className="w-full bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-mono font-bold cursor-not-allowed"
                />
              </div>

              {/* Título (input text) */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Título do Evento: <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formTitulo}
                  onChange={(e) => setFormTitulo(e.target.value)}
                  placeholder="ex: Prova Bimestral, Reunião de Pais..."
                  className="w-full bg-white border border-slate-300 focus:border-[#005A9C] rounded-lg px-2.5 py-1.5 font-medium text-slate-800 focus:outline-none"
                />
              </div>

              {/* Tipo de Evento */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Tipo:
                </label>
                <select
                  value={formTipo}
                  onChange={(e) => setFormTipo(e.target.value as EventoTipo)}
                  className="w-full bg-white border border-slate-300 focus:border-[#005A9C] rounded-lg px-2.5 py-1.5 font-semibold text-slate-800 focus:outline-none"
                >
                  <option value="SEDUC">SEDUC (Verde Oficial)</option>
                  <option value="FERIADO">FERIADO (Vermelho)</option>
                  <option value="ESCOLA">ESCOLA (Azul)</option>
                  <option value="PROJETO">PROJETO (Roxo)</option>
                  <option value="AVALIAÇÃO">AVALIAÇÃO (Laranja)</option>
                  <option value="PEDAGÓGICO">PEDAGÓGICO (Teal)</option>
                  <option value="CONSELHO DE CLASSE">CONSELHO DE CLASSE (Índigo)</option>
                  <option value="REUNIÃO">REUNIÃO (Ciano)</option>
                  <option value="FORMAÇÃO">FORMAÇÃO (Violeta)</option>
                  <option value="OUTRO">OUTRO (Cinza)</option>
                </select>
              </div>

              {/* Descrição (textarea) */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Descrição (opcional):
                </label>
                <textarea
                  rows={2}
                  value={formDescricao}
                  onChange={(e) => setFormDescricao(e.target.value)}
                  placeholder="Observações complementares ou diretrizes pedagógicas..."
                  className="w-full bg-white border border-slate-300 focus:border-[#005A9C] rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none"
                />
              </div>

              {/* Seletor de Dia Letivo: [Sim / Não] */}
              <div>
                <label className="block text-slate-700 font-bold mb-1.5">
                  Dia Letivo Computado na Célula J7?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormDiaLetivo(true)}
                    className={`py-2 px-3 rounded-lg border font-bold text-center transition-all ${
                      formDiaLetivo
                        ? 'bg-emerald-600 border-emerald-700 text-white shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Sim (Letivo)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormDiaLetivo(false)}
                    className={`py-2 px-3 rounded-lg border font-bold text-center transition-all ${
                      !formDiaLetivo
                        ? 'bg-rose-600 border-rose-700 text-white shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Não (Suspenso / Feriado)
                  </button>
                </div>
              </div>

              {eventoSelecionado?.origem === 'SEDUC_OFICIAL' && (
                <div className="bg-amber-50 border border-amber-200 p-2 rounded text-[11px] text-amber-800 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Evento oficial do calendário SEDUC-SP (protegido contra exclusão acidental).</span>
                </div>
              )}
            </div>

            {/* Ações: Salvar, Editar, Excluir, Cancelar */}
            <div className="border-t border-slate-100 pt-3 flex items-center justify-between gap-2">
              <div>
                {eventoSelecionado && eventoSelecionado.origem !== 'SEDUC_OFICIAL' && (
                  <button
                    type="button"
                    onClick={handleExcluirEvento}
                    className="text-rose-600 hover:text-rose-800 font-bold text-xs p-1.5 rounded hover:bg-rose-50 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModalAberto(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-bold hover:bg-slate-50 transition-all text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleSalvarEvento(false)}
                  className="bg-[#002B49] hover:bg-[#003B65] text-white font-bold px-4 py-1.5 rounded-lg transition-all text-xs shadow-2xs"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação Explícita para Alteração em Data Oficial da SEDUC */}
      {confirmacaoOficialAberta && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-950/80 p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl border-2 border-amber-400 max-w-sm w-full p-5 space-y-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <h3 className="font-extrabold text-sm text-center text-slate-900">
              Confirmação de Alteração Oficial
            </h3>
            <p className="text-xs text-slate-600 text-center">
              Você está prestes a modificar o status de dia letivo de uma data oficial homologada pela SEDUC-SP. Deseja prosseguir com essa alteração na grade escolar?
            </p>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmacaoOficialAberta(false)}
                className="py-1.5 px-3 rounded-lg border border-slate-300 font-bold text-xs text-slate-700 hover:bg-slate-50"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => handleSalvarEvento(true)}
                className="py-1.5 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-2xs"
              >
                Confirmar e Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
