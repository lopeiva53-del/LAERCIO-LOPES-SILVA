/**
 * CONTROLE CENTRAL DE VERSÃO E CONSTANTES IMUTÁVEIS - SEDUC-SP AUTOPLANO
 * Versão Estável Congelada: v2.1.0
 * 
 * Qualquer alteração futura só poderá ser aplicada mediante incremento desta versão,
 * garantindo estabilidade e integridade contra regressões ("freeze" da versão estável).
 */

export const APP_VERSION = "v2.2.9";
export const APP_BUILD = "2026.2.19-freeze";
export const APP_NAME = "SEDUC-SP AutoPlano";
export const APP_VERSION_LABEL = "v2.2.9 (Etapa 3 Minimalista e Limpa)";

/**
 * Textos Literais Fixos Imutáveis para as Células B13, B15 e B17.
 * Impeça terminantemente que a IA tente adivinhar, substituir ou gerar textos dinâmicos.
 */
export const FIXED_IMMUTABLE_CELLS = {
  B13: {
    address: 'B13',
    label: 'Avaliação Diagnóstica e Formativa (B13)',
    text: 'Avaliação diagnóstica escrita com foco nos pré-requisitos essenciais, resolução de problemas contextualizados em grupo e observação formativa contínua da rotina em sala.',
    tag: 'Texto Fixo Imutável'
  },
  B15: {
    address: 'B15',
    label: 'Diagnóstico da Turma e Mediação (B15)',
    text: 'Turma participativa com boa interação em tarefas práticas; apresenta heterogeneidade conceitual nos pré-requisitos e necessidade de mediação no raciocínio abstrato e interpretação.',
    tag: 'Texto Fixo Imutável'
  },
  B17: {
    address: 'B17',
    label: 'Intervenções Pedagógicas e Nivelamento (B17)',
    text: 'Retomada contínua de conceitos-chave, exercícios em níveis graduados, mediação guiada com material digital e apoio pontual para nivelamento das defasagens.',
    tag: 'Texto Fixo Imutável'
  }
} as const;

export type FixedCellKey = keyof typeof FIXED_IMMUTABLE_CELLS;
