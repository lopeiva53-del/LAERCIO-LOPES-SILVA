import React from 'react';
import { ShieldCheck, Sparkles, Building2, Lock, Calendar } from 'lucide-react';
import { APP_VERSION } from '../config/version';

interface HeaderProps {
  currentStep: number;
  onStepClick: (step: number) => void;
  activeProfileName?: string;
}

const PIPELINE_STEPS = [
  { num: 1, label: '1. Upload dos 3 Slots', desc: 'Formulário, Escopo e Calendário' },
  { num: 2, label: '2. Treinamento de Células', desc: 'Configuração do Perfil URE Taubaté' },
  { num: 3, label: '3. Validação da Grade', desc: 'Conferência estrita das coordenadas' },
  { num: 4, label: '4. Processamento Gemini', desc: 'Cruzamento com 200 dias e SEI' },
  { num: 5, label: '5. Exportação & Download', desc: 'Preservação de 100% das cores e texto' },
];

export const Header: React.FC<HeaderProps> = ({
  currentStep,
  onStepClick,
  activeProfileName = 'URE Taubaté (Padrão)',
}) => {
  return (
    <header className="bg-gradient-to-r from-[#002B49] via-[#003865] to-[#004B87] text-white shadow-lg border-b border-slate-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-4">
        {/* Top Header Row: Identity & System Badges */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Logo & Identity */}
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner shrink-0">
              <Building2 className="w-7 h-7 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <span className="text-xs font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  SEDUC-SP
                </span>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  {APP_VERSION}
                </span>
                <span className="text-xs text-slate-300 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Treinamento & Injeção por Coordenadas
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white flex items-center gap-2 mt-0.5 flex-wrap">
                AutoPlano <span className="text-amber-400 font-semibold text-lg sm:text-xl">| Cell-Map Profile</span>
                <span className="text-xs font-mono font-semibold text-emerald-300 bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-0.5 rounded-full">
                  {APP_VERSION}
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-200">
                Injeção estrita nas coordenadas do modelo (URE Taubaté) com células fixas B13, B15 e B17 imutáveis
              </p>
            </div>
          </div>

          {/* Status Badges (Informational, No Action Buttons) */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-slate-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Perfil Padrão: <strong className="text-white">{activeProfileName}</strong></span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              <span>B13, B15, B17 Protegidas</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-sky-200 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-sky-300" />
              <span>200 Dias Letivos (Seg-Sex)</span>
            </div>
          </div>
        </div>

        {/* Global Pipeline Steps Navigator (5 Steps) - Reorganized right below Title */}
        <div className="pt-2 border-t border-white/10">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {PIPELINE_STEPS.map((step) => {
              const isCurrent = currentStep === step.num;
              const isPast = currentStep > step.num;

              return (
                <div
                  key={step.num}
                  onClick={() => {
                    if (isPast) onStepClick(step.num);
                  }}
                  className={`p-2.5 rounded-lg border transition-all ${
                    isCurrent
                      ? 'bg-amber-400/20 border-amber-400/80 text-white shadow-md ring-1 ring-amber-400/40'
                      : isPast
                      ? 'bg-white/10 border-emerald-400/50 text-emerald-100 cursor-pointer hover:bg-white/20'
                      : 'bg-white/5 border-white/10 text-white/50 opacity-70'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0 ${
                        isCurrent
                          ? 'bg-amber-400 text-slate-950 font-bold'
                          : isPast
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : 'bg-white/20 text-white/70'
                      }`}
                    >
                      {isPast ? '✓' : step.num}
                    </span>
                    <span className="text-xs font-bold truncate">
                      {step.label}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-300 mt-1 truncate pl-7">
                    {step.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
};
