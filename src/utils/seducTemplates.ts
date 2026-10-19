import ExcelJS from 'exceljs';
import { CalendarSummary, ScopeSkill } from '../types/plan';
import { FIXED_IMMUTABLE_CELLS } from '../config/version';

export const SAMPLE_SCOPE_SKILLS: ScopeSkill[] = [
  // 1º Bimestre
  {
    id: 's1',
    bimestre: 1,
    week: 1,
    code: 'EF09MA01',
    description: 'Reconhecer a necessidade dos números reais para medir qualquer segmento de reta; identificar números irracionais na reta.',
    objectOfKnowledge: 'Necessidade dos números reais: segmentos incomensuráveis e reta real',
    estimatedClasses: 6,
    unit: 'Números'
  },
  {
    id: 's2',
    bimestre: 1,
    week: 2,
    code: 'EF09MA02',
    description: 'Reconhecer um número irracional como um número real cuja representação decimal é infinita e não periódica.',
    objectOfKnowledge: 'Números irracionais: aproximações e localização na reta',
    estimatedClasses: 6,
    unit: 'Números'
  },
  {
    id: 's3',
    bimestre: 1,
    week: 3,
    code: 'EF09MA03',
    description: 'Efetuar cálculos com números reais, inclusive potências com expoentes fracionários.',
    objectOfKnowledge: 'Potenciação e radicais: propriedades e simplificações',
    estimatedClasses: 6,
    unit: 'Números'
  },
  {
    id: 's4',
    bimestre: 1,
    week: 4,
    code: 'EF09MA04',
    description: 'Resolver e elaborar problemas com números reais, inclusive em notação científica, envolvendo diferentes operações.',
    objectOfKnowledge: 'Notação científica em contextos científicos e tecnológicos',
    estimatedClasses: 6,
    unit: 'Números'
  },
  {
    id: 's5',
    bimestre: 1,
    week: 5,
    code: 'EF09MA06',
    description: 'Compreender as funções como relações de dependência unívoca entre duas variáveis e suas representações numérica, algébrica e gráfica.',
    objectOfKnowledge: 'Funções: relações de dependência e conceito preliminar',
    estimatedClasses: 6,
    unit: 'Álgebra'
  },
  {
    id: 's6',
    bimestre: 1,
    week: 6,
    code: 'EF09MA07',
    description: 'Resolver problemas que envolvam a razão entre duas grandezas de espécies diferentes, de modo a construir o significado de grandezas derivadas.',
    objectOfKnowledge: 'Razão entre grandezas: velocidade média, densidade demográfica',
    estimatedClasses: 6,
    unit: 'Álgebra'
  },
  {
    id: 's7',
    bimestre: 1,
    week: 7,
    code: 'EF09MA08',
    description: 'Resolver e elaborar situações-problema que envolvam relações de proporcionalidade direta e inversa entre duas grandezas.',
    objectOfKnowledge: 'Grandezas diretamente e inversamente proporcionais',
    estimatedClasses: 6,
    unit: 'Álgebra'
  },
  {
    id: 's8',
    bimestre: 1,
    week: 8,
    code: 'AVAL-01',
    description: 'Avaliação Diagnóstica de Acompanhamento das Aprendizagens e Prova Paulista SEDUC-SP 1º Bimestre.',
    objectOfKnowledge: 'Consolidação e verificação formativa das habilidades essenciais',
    estimatedClasses: 6,
    unit: 'Avaliação da Aprendizagem'
  },
  {
    id: 's9',
    bimestre: 1,
    week: 9,
    code: 'SEI-01',
    description: 'Semana de Estudos Intensivos (SEI): Retomada, recuperação e aprofundamento das habilidades EF09MA01, EF09MA02 e EF09MA03.',
    objectOfKnowledge: 'Recuperação contínua e nivelamento com suporte do Material Digital SEDUC',
    estimatedClasses: 6,
    unit: 'Recuperação e Aprofundamento'
  },
  // 2º Bimestre
  {
    id: 's10',
    bimestre: 2,
    week: 1,
    code: 'EF09MA09',
    description: 'Compreender os processos de fatoração de expressões algébricas com base em suas relações com os produtos notáveis.',
    objectOfKnowledge: 'Expressões algébricas: produtos notáveis e fatoração',
    estimatedClasses: 6,
    unit: 'Álgebra'
  },
  {
    id: 's11',
    bimestre: 2,
    week: 2,
    code: 'EF09MA10',
    description: 'Demonstrar relações métricas do triângulo retângulo, entre elas o teorema de Pitágoras, utilizando inclusive semelhança.',
    objectOfKnowledge: 'Relações métricas no triângulo retângulo e Teorema de Pitágoras',
    estimatedClasses: 6,
    unit: 'Geometria'
  },
  {
    id: 's12',
    bimestre: 2,
    week: 3,
    code: 'EF09MA11',
    description: 'Resolver e elaborar problemas de aplicação do teorema de Pitágoras ou das relações de proporcionalidade envolvendo retas paralelas cortadas por secantes.',
    objectOfKnowledge: 'Teorema de Tales e aplicações geométricas práticas',
    estimatedClasses: 6,
    unit: 'Geometria'
  },
  {
    id: 's13',
    bimestre: 2,
    week: 4,
    code: 'EF09MA12',
    description: 'Reconhecer as condições necessárias e suficientes para que dois triângulos sejam congruentes ou semelhantes.',
    objectOfKnowledge: 'Congruência e semelhança de triângulos',
    estimatedClasses: 6,
    unit: 'Geometria'
  },
  {
    id: 's14',
    bimestre: 2,
    week: 8,
    code: 'AVAL-02',
    description: 'Avaliação de Fechamento do 2º Bimestre - Prova Paulista / SARESP Formativo.',
    objectOfKnowledge: 'Monitoramento de aprendizagem do 1º Semestre',
    estimatedClasses: 6,
    unit: 'Avaliação da Aprendizagem'
  },
  {
    id: 's15',
    bimestre: 2,
    week: 9,
    code: 'SEI-02',
    description: 'Semana de Estudos Intensivos (SEI): Recuperação semestral e preparação para o recesso escolar.',
    objectOfKnowledge: 'Aprofundamento de Geometria e Álgebra básica',
    estimatedClasses: 6,
    unit: 'Recuperação e Aprofundamento'
  }
];

import { getOfficialSeducHolidays, getSeducBimestreDetails } from './seducCalendarMetrics';

export function createDynamicCalendarData(targetYear: number = new Date().getFullYear()): CalendarSummary {
  const holidays = getOfficialSeducHolidays(targetYear);
  const bimestres = ([1, 2, 3, 4] as const).map(bNum => {
    const details = getSeducBimestreDetails(bNum, targetYear);
    return {
      bimestre: bNum,
      periodo: details.periodText,
      diasLetivos: details.diasLetivosJ7,
      feriadosRecessos: details.feriadosERecessos.length,
      semanaSEI: bNum === 3 
        ? '25 a 29 de Agosto (Semana 6 - SEI / Fechamento)' 
        : bNum === 4 
        ? '08 a 12 de Dezembro (Semana 10)' 
        : bNum === 2 
        ? '30 de Junho a 04 de Julho (Semana 10)' 
        : '07 a 11 de Abril (Semana 9)',
      semanaAvaliacao: bNum === 3
        ? '15 a 19 de Setembro (Semana 9 - Avaliação Formativa)'
        : bNum === 4
        ? '01 a 05 de Dezembro (Semana 9 - SARESP Oficial)'
        : bNum === 2
        ? '23 a 27 de Junho (Semana 9 - Prova Paulista)'
        : '31 de Março a 04 de Abril (Semana 8 - Prova Paulista)'
    };
  });

  const totalSchoolDays = bimestres.reduce((sum, b) => sum + b.diasLetivos, 0);

  return {
    year: targetYear,
    totalSchoolDays,
    bimestres,
    holidaysAndBreaks: holidays
  };
}

export const SAMPLE_CALENDAR_DATA: CalendarSummary = createDynamicCalendarData(new Date().getFullYear());

/**
 * Creates an authentic SEDUC-SP official Excel template with 100% genuine styles,
 * colors, borders and blank cells ready to be filled.
 */
export async function createOfficialSeducExcelTemplate(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SEDUC-SP - Secretaria da Educação do Estado de São Paulo';
  workbook.lastModifiedBy = 'AutoPlano SEDUC-SP';
  workbook.created = new Date();
  workbook.modified = new Date();

  // Official SEDUC-SP Brand Palette
  const NAVY_HEADER = '002B49'; // SEDUC Dark Navy
  const BLUE_ACCENT = '005A9C'; // Paulista Blue
  const GOLD_SEI = 'FEF3C7';    // Amber/Gold for SEI
  const GOLD_BORDER = 'D97706';
  const LIGHT_ROW = 'F8FAFC';   // Soft Slate alternating row
  const WHITE = 'FFFFFF';
  const BORDER_GRAY = 'CBD5E1';

  const bimestresConfig = [
    { num: 1, name: '1º Bimestre', weeks: 9, startMonth: 'Fev/Abr' },
    { num: 2, name: '2º Bimestre', weeks: 10, startMonth: 'Abr/Jul' },
    { num: 3, name: '3º Bimestre', weeks: 9, startMonth: 'Ago/Out' },
    { num: 4, name: '4º Bimestre', weeks: 10, startMonth: 'Out/Dez' },
  ];

  for (const bim of bimestresConfig) {
    const sheet = workbook.addWorksheet(bim.name, {
      views: [{ showGridLines: true }]
    });

    // Column widths
    sheet.columns = [
      { key: 'periodo', width: 18 },       // Col A
      { key: 'diasLetivos', width: 16 },    // Col B
      { key: 'codigo', width: 15 },         // Col C
      { key: 'habilidade', width: 44 },     // Col D
      { key: 'objeto', width: 34 },         // Col E
      { key: 'metodologia', width: 40 },    // Col F
      { key: 'avaliacao', width: 36 },      // Col G
    ];

    // Row 1: Header Governo do Estado de São Paulo
    sheet.mergeCells('A1:G1');
    const r1 = sheet.getCell('A1');
    r1.value = 'GOVERNO DO ESTADO DE SÃO PAULO | SECRETARIA DA EDUCAÇÃO DO ESTADO (SEDUC-SP)';
    r1.font = { name: 'Calibri', size: 12, bold: true, color: { argb: WHITE } };
    r1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_HEADER } };
    r1.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 28;

    // Row 2: Subtitle
    sheet.mergeCells('A2:G2');
    const r2 = sheet.getCell('A2');
    r2.value = `PLANO DE ENSINO E CRONOGRAMA BIMESTRAL - CURRÍCULO PAULISTA (${bim.name.toUpperCase()} - ${new Date().getFullYear()})`;
    r2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } };
    r2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_ACCENT } };
    r2.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(2).height = 24;

    // Rows 3-5: Metadata Box
    sheet.mergeCells('A3:B3');
    sheet.getCell('A3').value = 'Diretoria de Ensino:';
    sheet.getCell('A3').font = { bold: true, size: 10 };
    sheet.mergeCells('C3:D3');
    sheet.getCell('C3').value = 'DE Região Centro / Leste / Campinas';
    sheet.mergeCells('E3:E3');
    sheet.getCell('E3').value = 'Componente:';
    sheet.getCell('E3').font = { bold: true, size: 10 };
    sheet.mergeCells('F3:G3');
    sheet.getCell('F3').value = 'Matemática';

    sheet.mergeCells('A4:B4');
    sheet.getCell('A4').value = 'Unidade Escolar:';
    sheet.getCell('A4').font = { bold: true, size: 10 };
    sheet.mergeCells('C4:D4');
    sheet.getCell('C4').value = 'E.E. Professora Estadual Modelo';
    sheet.mergeCells('E4:E4');
    sheet.getCell('E4').value = 'Ano / Turma:';
    sheet.getCell('E4').font = { bold: true, size: 10 };
    sheet.mergeCells('F4:G4');
    sheet.getCell('F4').value = '9º Ano A / B (Ensino Fundamental)';

    sheet.mergeCells('A5:B5');
    sheet.getCell('A5').value = 'Professor(a) Responsável:';
    sheet.getCell('A5').font = { bold: true, size: 10 };
    sheet.mergeCells('C5:D5');
    sheet.getCell('C5').value = 'Docente Titular';
    sheet.mergeCells('E5:E5');
    sheet.getCell('E5').value = 'Carga Horária Bimestral:';
    sheet.getCell('E5').font = { bold: true, size: 10 };
    sheet.mergeCells('F5:G5');
    sheet.getCell('F5').value = '50 a 55 Horas-Aula (5 aulas semanais)';

    for (let r = 3; r <= 5; r++) {
      sheet.getRow(r).height = 20;
      sheet.getRow(r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
    }

    // Row 6: Empty spacer
    sheet.getRow(6).height = 10;

    // Row 7: Table Headers
    const headers = [
      'Semana / Período',
      'Dias Letivos Reais',
      'Código Habilidade',
      'Descrição da Habilidade (Currículo Paulista)',
      'Objeto de Conhecimento',
      'Metodologia & Situação de Aprendizagem',
      'Avaliação / SEI - Recuperação e Aprofundamento'
    ];

    const headerRow = sheet.getRow(7);
    headerRow.height = 32;
    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_HEADER } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'medium', color: { argb: '001A2E' } },
        bottom: { style: 'medium', color: { argb: '001A2E' } },
        left: { style: 'thin', color: { argb: BORDER_GRAY } },
        right: { style: 'thin', color: { argb: BORDER_GRAY } }
      };
    });

    // Planning Table Rows (Rows 8 to 8 + weeks)
    for (let w = 1; w <= bim.weeks; w++) {
      const rowNum = 7 + w;
      const row = sheet.getRow(rowNum);
      row.height = 42; // spacious for multi-line text

      const isSEI = (w === bim.weeks);
      const isAval = (w === bim.weeks - 1);

      for (let c = 1; c <= 7; c++) {
        const cell = row.getCell(c);
        // We leave data cells blank for the application to detect and map!
        cell.value = '';

        // Preserved font styling
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: (c === 1 || c === 3 || isSEI),
          color: { argb: isSEI ? '92400E' : '0F172A' }
        };

        // Preserved cell background fill:
        // Highlights SEI week with gold banner, Avaliação with light sky, others alternating
        if (isSEI) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: GOLD_SEI }
          };
        } else if (isAval) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'E0F2FE' } // light blue
          };
        } else {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: (w % 2 === 0 ? LIGHT_ROW : WHITE) }
          };
        }

        // Preserved cell borders
        cell.border = {
          top: { style: isSEI ? 'medium' : 'thin', color: { argb: isSEI ? GOLD_BORDER : BORDER_GRAY } },
          bottom: { style: isSEI ? 'medium' : 'thin', color: { argb: isSEI ? GOLD_BORDER : BORDER_GRAY } },
          left: { style: 'thin', color: { argb: BORDER_GRAY } },
          right: { style: 'thin', color: { argb: BORDER_GRAY } },
        };

        cell.alignment = {
          vertical: 'top',
          horizontal: (c === 1 || c === 2 || c === 3) ? 'center' : 'left',
          wrapText: true
        };
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

/**
 * Creates authentic "Planejamento de Aula URE Taubaté" template
 * with strict coordinates: Header in D4/D5/D6/H5/H6, instructions in B13-B15,
 * and weekly planning table starting at Row 16 (Columns B, D, E, F, G, H, I).
 */
export async function createUreTaubateExcelTemplate(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SEDUC-SP - Diretoria de Ensino Região de Taubaté (URE)';
  workbook.created = new Date();

  const NAVY = '002B49';
  const BLUE = '005A9C';
  const GOLD = 'FEF3C7';
  const LIGHT_ROW = 'F8FAFC';
  const WHITE = 'FFFFFF';
  const GRAY_BORDER = 'CBD5E1';

  const sheet = workbook.addWorksheet('Planejamento Preenchido', {
    views: [{ showGridLines: true }]
  });

  // Column widths
  sheet.columns = [
    { key: 'A', width: 6 },
    { key: 'B', width: 18 },  // Data / Semana
    { key: 'C', width: 6 },
    { key: 'D', width: 36 },  // Habilidade / AE / Aula
    { key: 'E', width: 32 },  // Objetivos de Aprendizagem
    { key: 'F', width: 32 },  // Metodologia
    { key: 'G', width: 44 },  // Desenvolvimento da Aula
    { key: 'H', width: 28 },  // Avaliação
    { key: 'I', width: 28 },  // Ajustes / Recuperação
    { key: 'J', width: 16 },  // Metadados (J7, J8, J9)
  ];

  // Header Banner
  sheet.mergeCells('B2:J2');
  const h1 = sheet.getCell('B2');
  h1.value = 'GOVERNO DO ESTADO DE SÃO PAULO | SECRETARIA DA EDUCAÇÃO DO ESTADO (SEDUC-SP)';
  h1.font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } };
  h1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  h1.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(2).height = 24;

  sheet.mergeCells('B3:J3');
  const h2 = sheet.getCell('B3');
  h2.value = `DIRETORIA DE ENSINO - REGIÃO DE TAUBATÉ (URE) | PLANEJAMENTO DE AULA - ${new Date().getFullYear()}`;
  h2.font = { name: 'Calibri', size: 10, bold: true, color: { argb: WHITE } };
  h2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
  h2.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(3).height = 22;

  // Header Box (Rows 4 to 6)
  sheet.getCell('B4').value = 'Unidade Escolar:';
  sheet.getCell('B4').font = { bold: true, size: 9 };
  sheet.mergeCells('D4:F4');
  sheet.getCell('D4').value = 'E.E. Monteiro Lobato - URE Taubaté';

  sheet.getCell('B5').value = 'Professor(a):';
  sheet.getCell('B5').font = { bold: true, size: 9 };
  sheet.mergeCells('D5:F5');
  sheet.getCell('D5').value = 'Professor(a) Titular - PEI';

  sheet.getCell('G5').value = 'Turma / Série:';
  sheet.getCell('G5').font = { bold: true, size: 9 };
  sheet.mergeCells('H5:I5');
  sheet.getCell('H5').value = '1ª Série EM (Ensino Médio)';

  sheet.getCell('B6').value = 'Componente / Disciplina:';
  sheet.getCell('B6').font = { bold: true, size: 9 };
  sheet.mergeCells('D6:F6');
  sheet.getCell('D6').value = 'Química';

  sheet.getCell('G6').value = 'Bimestre:';
  sheet.getCell('G6').font = { bold: true, size: 9 };
  sheet.mergeCells('H6:I6');
  sheet.getCell('H6').value = '4º Bimestre';

  for (let r = 4; r <= 6; r++) {
    sheet.getRow(r).height = 20;
    sheet.getRow(r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
  }

  // Header Box for Curricular Metadata (Rows 7 to 9: Células J7, J8 e J9)
  sheet.getCell('B7').value = 'Dias Letivos do Bimestre:';
  sheet.getCell('B7').font = { bold: true, size: 9 };
  sheet.mergeCells('D7:F7');
  sheet.getCell('D7').value = 'Calendário Escolar Oficial SEDUC-SP (descontados feriados e recessos)';
  sheet.getCell('D7').font = { italic: true, size: 8.5, color: { argb: '475569' } };
  sheet.mergeCells('H7:I7');
  sheet.getCell('H7').value = 'Dias Letivos (J7):';
  sheet.getCell('H7').font = { bold: true, size: 9 };
  sheet.getCell('J7').value = 51;
  sheet.getCell('J7').font = { name: 'Calibri', size: 11, bold: true, color: { argb: '002B49' } };
  sheet.getCell('J7').alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.getCell('B8').value = 'Aulas Curriculares Previstas:';
  sheet.getCell('B8').font = { bold: true, size: 9 };
  sheet.mergeCells('D8:F8');
  sheet.getCell('D8').value = 'Carga Horária Bimestral (Teto Curricular - 12 a 18 aulas)';
  sheet.getCell('D8').font = { italic: true, size: 8.5, color: { argb: '475569' } };
  sheet.mergeCells('H8:I8');
  sheet.getCell('H8').value = 'Aulas Previstas (J8):';
  sheet.getCell('H8').font = { bold: true, size: 9 };
  sheet.getCell('J8').value = 18;
  sheet.getCell('J8').font = { name: 'Calibri', size: 11, bold: true, color: { argb: '002B49' } };
  sheet.getCell('J8').alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.getCell('B9').value = 'Dias Letivos Efetivos:';
  sheet.getCell('B9').font = { bold: true, size: 9 };
  sheet.mergeCells('D9:F9');
  sheet.getCell('D9').value = 'Saldo com desconto de Planejamento, Conselhos, SARESP e SEI';
  sheet.getCell('D9').font = { italic: true, size: 8.5, color: { argb: '475569' } };
  sheet.mergeCells('H9:I9');
  sheet.getCell('H9').value = 'Dias Efetivos (J9):';
  sheet.getCell('H9').font = { bold: true, size: 9 };
  sheet.getCell('J9').value = 47;
  sheet.getCell('J9').font = { name: 'Calibri', size: 11, bold: true, color: { argb: '002B49' } };
  sheet.getCell('J9').alignment = { horizontal: 'center', vertical: 'middle' };

  for (let r = 7; r <= 9; r++) {
    sheet.getRow(r).height = 20;
    sheet.getRow(r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
    sheet.getCell(`J${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E0F2FE' } };
    sheet.getCell(`J${r}`).border = {
      top: { style: 'thin', color: { argb: '94A3B8' } },
      bottom: { style: 'thin', color: { argb: '94A3B8' } },
      left: { style: 'thin', color: { argb: '94A3B8' } },
      right: { style: 'thin', color: { argb: '94A3B8' } }
    };
  }

  // Row 10-12 Table Headers
  const colHeaders: { col: string; title: string }[] = [
    { col: 'B', title: 'Data / Semana' },
    { col: 'D', title: 'Habilidade / AE / Aula' },
    { col: 'E', title: 'Objetivos de Aprendizagem' },
    { col: 'F', title: 'Metodologia' },
    { col: 'G', title: 'Desenvolvimento da Aula (Passo a Passo)' },
    { col: 'H', title: 'Avaliação da Aprendizagem' },
    { col: 'I', title: 'Ajustes Pedagógicos / Recuperação (SEI)' },
  ];

  const headerRow = sheet.getRow(12);
  headerRow.height = 30;
  colHeaders.forEach(({ col, title }) => {
    const cell = sheet.getCell(`${col}12`);
    cell.value = title;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'medium', color: { argb: '001A2E' } },
      bottom: { style: 'medium', color: { argb: '001A2E' } },
      left: { style: 'thin', color: { argb: GRAY_BORDER } },
      right: { style: 'thin', color: { argb: GRAY_BORDER } },
    };
  });

  // Rows 13, 15, 17: Células Fixas Imutáveis
  sheet.mergeCells('B13:I13');
  const inst13 = sheet.getCell('B13');
  inst13.value = FIXED_IMMUTABLE_CELLS.B13.text;
  inst13.font = { name: 'Calibri', size: 9, bold: true, color: { argb: '002B49' } };
  inst13.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
  inst13.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  sheet.getRow(13).height = 36;

  sheet.mergeCells('B15:I15');
  const inst15 = sheet.getCell('B15');
  inst15.value = FIXED_IMMUTABLE_CELLS.B15.text;
  inst15.font = { name: 'Calibri', size: 9, bold: true, color: { argb: '002B49' } };
  inst15.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C7' } };
  inst15.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  sheet.getRow(15).height = 36;

  sheet.mergeCells('B17:J17');
  const inst17 = sheet.getCell('B17');
  inst17.value = FIXED_IMMUTABLE_CELLS.B17.text;
  inst17.font = { name: 'Calibri', size: 9, bold: true, color: { argb: '002B49' } };
  inst17.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E0F2FE' } };
  inst17.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  sheet.getRow(17).height = 36;

  // Rows 21 to 24: Instrumentos e Pesos de Avaliação
  const evalDefaults = [
    { row: 21, inst: 'Prova Paulista', peso: '30%' },
    { row: 22, inst: 'Atividades em Sala e Caderno', peso: '30%' },
    { row: 23, inst: 'Trabalhos e Práticas em Grupo', peso: '20%' },
    { row: 24, inst: 'Avaliação Formativa e SEI', peso: '20%' },
  ];
  evalDefaults.forEach(({ row, inst, peso }) => {
    sheet.getCell(`C${row}`).value = inst;
    sheet.getCell(`C${row}`).font = { name: 'Calibri', size: 9.5, bold: true };
    sheet.getCell(`J${row}`).value = peso;
    sheet.getCell(`J${row}`).font = { name: 'Calibri', size: 9.5, bold: true };
    sheet.getCell(`J${row}`).alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Row 27: Table Header da Grade Semanal
  const headerRow27 = sheet.getRow(27);
  headerRow27.height = 30;
  colHeaders.forEach(({ col, title }) => {
    const cell = sheet.getCell(`${col}27`);
    cell.value = title;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'medium', color: { argb: '001A2E' } },
      bottom: { style: 'medium', color: { argb: '001A2E' } },
      left: { style: 'thin', color: { argb: GRAY_BORDER } },
      right: { style: 'thin', color: { argb: GRAY_BORDER } },
    };
  });

  // Data Rows: Linhas 28 a 38 da Grade Semanal (11 semanas de seg a sex)
  for (let w = 1; w <= 11; w++) {
    const rowNum = 27 + w;
    const row = sheet.getRow(rowNum);
    row.height = 42;

    const isSEI = (w === 10);
    const isClosing = (w === 11);
    const isAval = (w === 9);

    colHeaders.forEach(({ col }) => {
      const cell = sheet.getCell(`${col}${rowNum}`);
      cell.value = ''; // Empty for injection

      cell.font = {
        name: 'Calibri',
        size: 9.5,
        bold: isSEI || col === 'B' || col === 'D',
        color: { argb: isSEI ? '92400E' : '0F172A' }
      };

      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {
          argb: isSEI ? GOLD : isAval ? 'E0F2FE' : (w % 2 === 0 ? LIGHT_ROW : WHITE)
        }
      };

      cell.border = {
        top: { style: isSEI ? 'medium' : 'thin', color: { argb: isSEI ? 'D97706' : GRAY_BORDER } },
        bottom: { style: isSEI ? 'medium' : 'thin', color: { argb: isSEI ? 'D97706' : GRAY_BORDER } },
        left: { style: 'thin', color: { argb: GRAY_BORDER } },
        right: { style: 'thin', color: { argb: GRAY_BORDER } },
      };

      cell.alignment = {
        vertical: 'middle',
        horizontal: (col === 'B') ? 'center' : 'left',
        wrapText: true
      };
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

/**
 * Creates downloadable Scope & Sequence CSV
 */
export function createScopeSequenceCsv(): string {
  const headers = ['Bimestre', 'Semana_Prevista', 'Codigo_Habilidade', 'Descricao_Habilidade', 'Objeto_de_Conhecimento', 'Aulas_Previstas', 'Unidade_Tematica'];
  const rows = SAMPLE_SCOPE_SKILLS.map(s => [
    s.bimestre,
    s.week,
    `"${s.code}"`,
    `"${s.description.replace(/"/g, '""')}"`,
    `"${s.objectOfKnowledge.replace(/"/g, '""')}"`,
    s.estimatedClasses,
    `"${s.unit}"`
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

/**
 * Creates downloadable SEDUC Calendar CSV
 */
export function createSeducCalendarCsv(targetYear: number = new Date().getFullYear()): string {
  const cal = createDynamicCalendarData(targetYear);
  const headers = ['Data', 'Descricao_Evento', 'Tipo_Evento', 'Bimestre'];
  const rows = cal.holidaysAndBreaks.map(h => [
    `"${h.date}"`,
    `"${h.name.replace(/"/g, '""')}"`,
    `"${h.name.toLowerCase().includes('feriado') ? 'feriado' : h.name.toLowerCase().includes('recesso') ? 'recesso' : 'planejamento'}"`,
    h.date.includes('/02') || h.date.includes('/03') || h.date.includes('/04') ? 1 : h.date.includes('/05') || h.date.includes('/06') || h.date.includes('/07') ? 2 : h.date.includes('/08') || h.date.includes('/09') ? 3 : 4
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}
