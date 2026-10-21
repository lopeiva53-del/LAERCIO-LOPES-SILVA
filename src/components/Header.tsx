import React from 'react';
import { ShieldCheck, Sparkles, Building2, Lock, Calendar } from 'lucide-react';
import { APP_VERSION } from '../config/version';

interface HeaderProps {
  currentStep: number;
  onStepClick: (step: number) => void;
  activeProfileName?: string;
  onOpenCalendario?: () => void;
}

const PIPELINE_STEPS = [
  { num: 1, label: '1. Upload' },
  { num: 2, label: '2. Células' },
  { num: 3, label: '3. Grade' },
  { num: 4, label: '4. IA' },
  { num: 5, label: '5. Baixar' },
];

export const Header: React.FC<HeaderProps> = ({
  currentStep,
  onStepClick,
  activeProfileName = 'URE Taubaté',
  onOpenCalendario,
}) => {
  return (
    <header className="bg-gradient-to-r from-[#002B49] via-[#003865] to-[#004B87] text-white shadow-md border-b border-slate-700/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 space-y-2.5">
        {/* Top Header Row: Compact Identity & Profile */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                SEDUC-SP
              </span>
              <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-white flex items-center gap-1.5">
                AutoPlano
              </h1>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                {APP_VERSION}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {onOpenCalendario && (
              <button
                type="button"
                onClick={onOpenCalendario}
                className="px-2 py-1 rounded bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 text-amber-300 text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                title="Abrir Calendário Escolar Inteligente (SEDUC-SP 2026)"
              >
                <Calendar className="w-3 h-3 text-amber-400" />
                <span>Calendário 2026</span>
              </button>
            )}
            <span className="text-[11px] text-slate-300 hidden sm:inline-block">
              Perfil: <strong className="text-white">{activeProfileName}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-medium hidden md:flex items-center gap-1">
              <Lock className="w-3 h-3 text-emerald-400" />
              B13, B15, B17
            </span>
          </div>
        </div>

        {/* Global Pipeline Steps Navigator (Compact 1-word stepper) */}
        <div className="grid grid-cols-5 gap-1.5 pt-1.5 border-t border-white/10">
          {PIPELINE_STEPS.map((step) => {
            const isCurrent = currentStep === step.num;
            const isPast = currentStep > step.num;

            return (
              <button
                key={step.num}
                type="button"
                onClick={() => {
                  if (isPast) onStepClick(step.num);
                }}
                className={`py-1.5 px-2 rounded-md border text-center transition-all flex items-center justify-center gap-1.5 text-xs font-bold ${
                  isCurrent
                    ? 'bg-amber-400/25 border-amber-400 text-white shadow-xs ring-1 ring-amber-400/50'
                    : isPast
                    ? 'bg-white/10 border-emerald-400/50 text-emerald-200 cursor-pointer hover:bg-white/20'
                    : 'bg-white/5 border-white/10 text-white/40 cursor-default'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-extrabold shrink-0 ${
                    isCurrent
                      ? 'bg-amber-400 text-slate-950 font-bold'
                      : isPast
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : 'bg-white/20 text-white/70'
                  }`}
                >
                  {isPast ? '✓' : step.num}
                </span>
                <span className="truncate">{step.label.replace(/^\d+\.\s*/, '')}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
