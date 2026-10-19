import React from 'react';
import { 
  Sparkles, 
  Calendar, 
  BookOpen, 
  Clock, 
  CheckCircle2, 
  Layers, 
  ShieldCheck, 
  ArrowRight,
  TrendingUp,
  Cpu
} from 'lucide-react';

interface ProcessingProgressProps {
  progressStep: number;
  totalFieldsCount: number;
  calendarSummary?: any;
  progressPercent?: number;
  statusMessage?: string;
  elapsedSeconds?: number;
}

export const ProcessingProgress: React.FC<ProcessingProgressProps> = ({
  progressStep,
  totalFieldsCount,
  calendarSummary,
  progressPercent = 35,
  statusMessage,
  elapsedSeconds = 0
}) => {
  const steps = [
    {
      id: 1,
      title: 'Parsing do Calendário SEDUC-SP & Contabilização de Dias Reais',
      desc: 'Descontando 200 dias regulamentares: feriados estaduais (9 de Julho), Carnaval, Semana Santa, Recesso de Julho e reuniões pedagógicas.',
      icon: Calendar,
      status: progressStep > 1 ? 'completed' : progressStep === 1 ? 'active' : 'pending'
    },
    {
      id: 2,
      title: 'Reserva das Semanas de Avaliação Estadual & SEI',
      desc: 'Bloqueando semanas específicas para Prova Paulista, SARESP formativo e Semanas de Estudos Intensivos (Recuperação e Aprofundamento).',
      icon: Clock,
      status: progressStep > 2 ? 'completed' : progressStep === 2 ? 'active' : 'pending'
    },
    {
      id: 3,
      title: 'Cruzamento Curricular em Lote Único (Batch Gemini / Escopo)',
      desc: 'Cruzamento estruturado de habilidades do Currículo Paulista com semanas letivas úteis (Batch JSON Schema com contingência de 15s).',
      icon: Cpu,
      status: progressStep > 3 ? 'completed' : progressStep === 3 ? 'active' : 'pending'
    },
    {
      id: 4,
      title: 'Preparação do Buffer Binário com Preservação 100% de Formatação',
      desc: 'Mapeando injeção cirúrgica de valores nas células de destino sem alterar fontes, bordas, larguras ou cores de preenchimento.',
      icon: ShieldCheck,
      status: progressStep > 4 ? 'completed' : progressStep === 4 ? 'active' : 'pending'
    }
  ];

  const currentPercent = Math.min(100, Math.max(5, Math.round(progressPercent)));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-5 border-b border-slate-100 gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#002B49] text-white flex items-center justify-center text-xs font-bold">
              4
            </span>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              Processamento Curricular em Lote Único (Batch Generation)
              <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500 animate-pulse" />
            </h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Cruzamento estruturado rápido com proteção de timeout de segurança (máx. 25s).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-50 text-[#002B49] border border-blue-200 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping"></span>
            Processando {totalFieldsCount} células identificadas
          </span>
        </div>
      </div>

      {/* Real Percentage Progress Bar */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-[#002B49] text-sm flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              Progresso do Processamento:
            </span>
            <span className="font-bold text-slate-600">
              {statusMessage || (currentPercent < 30 ? 'Lendo calendário e dias úteis...' : currentPercent < 75 ? 'Cruzando matriz curricular em lote...' : currentPercent < 95 ? 'Montando grade horária semanal...' : 'Finalizando prévia e arquivo...')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {elapsedSeconds > 0 && (
              <span className="text-[11px] text-slate-500 font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                ⏱️ {elapsedSeconds}s (timeout seguro: 25s)
              </span>
            )}
            <span className="font-black text-sm text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full border border-blue-200">
              {currentPercent}%
            </span>
          </div>
        </div>

        {/* Outer Bar */}
        <div className="w-full bg-slate-200 rounded-full h-3.5 p-0.5 overflow-hidden shadow-inner">
          <div 
            className="h-full rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 transition-all duration-300 ease-out shadow-xs relative"
            style={{ width: `${currentPercent}%` }}
          >
            <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full"></div>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>Início do lote</span>
          <span>Cruzamento de habilidades</span>
          <span>100% Conclusão</span>
        </div>
      </div>

      {/* Progress Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        {steps.map((st) => {
          const Icon = st.icon;
          const isActive = st.status === 'active';
          const isDone = st.status === 'completed';

          return (
            <div
              key={st.id}
              className={`p-4 rounded-xl border transition-all ${
                isActive
                  ? 'bg-blue-50/70 border-blue-400 shadow-md ring-2 ring-blue-500/10'
                  : isDone
                  ? 'bg-emerald-50/40 border-emerald-300'
                  : 'bg-slate-50 border-slate-200 opacity-60'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`p-2.5 rounded-lg shrink-0 ${
                    isActive
                      ? 'bg-[#002B49] text-white animate-pulse'
                      : isDone
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-5 h-5 text-white" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">
                      {st.title}
                    </span>
                    {isActive && (
                      <span className="text-[10px] uppercase font-extrabold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                        Em execução
                      </span>
                    )}
                    {isDone && (
                      <span className="text-[10px] uppercase font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        Concluído
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {st.desc}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Educational Rules Summary Panel */}
      <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-4">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1.5 mb-2.5">
          <BookOpen className="w-4 h-4 text-[#002B49]" />
          Parâmetros do Regulamento SEDUC-SP Aplicados:
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-slate-500 block text-[11px]">Ano Letivo Integral:</span>
            <span className="font-bold text-slate-900 text-sm">200 Dias Letivos</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">4 Bimestres equilibrados</span>
          </div>

          <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-slate-500 block text-[11px]">Semanas SEI Reservadas:</span>
            <span className="font-bold text-amber-700 text-sm">Semanas 9 e 10</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Recuperação & Aprofundamento</span>
          </div>

          <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-slate-500 block text-[11px]">Avaliação Oficial:</span>
            <span className="font-bold text-sky-700 text-sm">Prova Paulista & SARESP</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Fechamento formativo de ciclo</span>
          </div>
        </div>
      </div>
    </div>
  );
};
