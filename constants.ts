
import { Product, Operator, Machine, FieldDefinition } from './types';

export const SYSTEM_OPERATOR_ID = 99999;

// ARQUITETURA FLEXÍVEL: Configuração Central dos Campos Extras (Fallback Local)
// Estes campos serão usados caso o banco de dados não retorne configurações
export const DYNAMIC_FIELDS_CONFIG: FieldDefinition[] = [
  {
    key: 'peso_produto',
    label: 'Peso Médio Real (g)',
    type: 'number',
    placeholder: '0.00',
    section: 'process',
    required: false
  }
];

// Data extracted from the provided list + existing bobinas
export const PRODUCTS_DB: Product[] = [
  // --- BOBINAS (Para Extrusoras - Mantido) ---
  { codigo: 1001, produto: 'BOBINA PP CRISTAL', descricao: 'Bobina de Polipropileno Cristal Extrusada', pesoLiquido: 0, custoUnit: 8.50, type: 'INTERMEDIATE', unit: 'kg', category: 'INTERMEDIARIO' },
  { codigo: 1002, produto: 'BOBINA PP BRANCA', descricao: 'Bobina de Polipropileno Branca Extrusada', pesoLiquido: 0, custoUnit: 9.20, type: 'INTERMEDIATE', unit: 'kg', category: 'INTERMEDIARIO' },
  { codigo: 1003, produto: 'BOBINA PP PRETA', descricao: 'Bobina de Polipropileno Preta Extrusada', pesoLiquido: 0, custoUnit: 7.80, type: 'INTERMEDIATE', unit: 'kg', category: 'INTERMEDIARIO' },

  // --- PRODUTOS ACABADOS (Lista Completa Solicitada) ---
  { codigo: 9008, produto: 'P-08', descricao: 'P-08 EMB RET C/TP ARTIC NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 9010, produto: 'P-10', descricao: 'P-10 EMB RET C/TP ARTIC NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 9013, produto: 'P-13', descricao: 'P-13 EMB QUAD C/TP ARTIC NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 9017, produto: 'P-17', descricao: 'P-17 EMB RET C/TP ARTIC NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 9018, produto: 'P-18', descricao: 'P-18 EMB RET C/TP ARTIC NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 9020, produto: 'P-20', descricao: 'P-20 EMB RET C/TP ARTIC NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 903236, produto: 'P-32A', descricao: 'P-32A/BR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 903234, produto: 'P-32A/PR', descricao: 'P-32A/PR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 903216, produto: 'P-32B', descricao: 'P-32B/BR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 903214, produto: 'P-32B/PR', descricao: 'P-32B/PR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 903226, produto: 'P-32M', descricao: 'P-32M/BR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 903224, produto: 'P-32M/PR', descricao: 'P-32M/PR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 903536, produto: 'P-35A', descricao: 'P-35A/BR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 903534, produto: 'P-35A/PR', descricao: 'P-35A/PR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 903516, produto: 'P-35B', descricao: 'P-35B/BR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 903514, produto: 'P-35B/PR', descricao: 'P-35B/PR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 904036, produto: 'P-40A', descricao: 'P-40A/BR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 904034, produto: 'P-40A/PR', descricao: 'P-40A/PR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 904026, produto: 'P-40M', descricao: 'P-40M/BR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 904024, produto: 'P-40M/PR', descricao: 'P-40M/PR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 905036, produto: 'P-50A', descricao: 'P-50A/BR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 905034, produto: 'P-50A/PR', descricao: 'P-50A/PR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 905016, produto: 'P-50B', descricao: 'P-50B/BR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 905014, produto: 'P-50B/PR', descricao: 'P-50B/PR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 905006, produto: 'P-50EX', descricao: 'P-50EX/BR EMB PET CRISTAL BASE/TP NOBR', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 905004, produto: 'P-50EX/PR', descricao: 'P-50EX/PR EMB PET CRISTAL BASE/TP NOBR', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 905026, produto: 'P-50M', descricao: 'P-50M/BR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 905024, produto: 'P-50M/PR', descricao: 'P-50M/PR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 90555, produto: 'P-555', descricao: 'P-555 POTE MOLHO C/ TAMPA 50 ML NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 905636, produto: 'P-56A', descricao: 'P-56A/BR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 905634, produto: 'P-56A/PR', descricao: 'P-56A/PR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 905616, produto: 'P-56B', descricao: 'P-56B/BR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 905614, produto: 'P-56B/PR', descricao: 'P-56B/PR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 905626, produto: 'P-56M', descricao: 'P-56M/BR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 905624, produto: 'P-56M/PR', descricao: 'P-56M/PR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 906036, produto: 'P-60A', descricao: 'P-60A/BR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 906034, produto: 'P-60A/PR', descricao: 'P-60A/PR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 906006, produto: 'P-60EX', descricao: 'P-60EX/BR LISO EMB PET CRISTAL B/T NOB', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 906004, produto: 'P-60EX/PR', descricao: 'P-60EX/PR LISO EMB PET CRISTAL B.NOBR', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 906026, produto: 'P-60M', descricao: 'P-60M/BR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 906024, produto: 'P-60M/PR', descricao: 'P-60M/PR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 90630, produto: 'P-630', descricao: 'P-630 EMB TRIANGULAR FATIA NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 906326, produto: 'P-63M', descricao: 'P-63M/BR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 906324, produto: 'P-63M/PR', descricao: 'P-63M/PR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 90640, produto: 'P-640', descricao: 'P-640 EMB RED C/TP ART 150ML NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 90642, produto: 'P-642', descricao: 'P-642 EMB RED C/TP ART PEQ 120ML NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 90650, produto: 'P-650', descricao: 'P-650 EMB QUAD C/TP ART 150ML NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 906526, produto: 'P-65M', descricao: 'P-65M/BR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 906524, produto: 'P-65M/PR', descricao: 'P-65M/PR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 907016, produto: 'P-70B', descricao: 'P-70B/BR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 907014, produto: 'P-70B/PR', descricao: 'P-70B/PR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 907026, produto: 'P-70M', descricao: 'P-70M/BR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 907024, produto: 'P-70M/PR', descricao: 'P-70M/PR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 91742, produto: 'P-742M', descricao: 'P-742 POTE DIAM RED C/TP ART 250ML NOB', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 90742, produto: 'P-742', descricao: 'P-742 POTE RED C/TP ART 250 ML NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 91750, produto: 'P-750M', descricao: 'P-750 POTE DIAM RED C/TP ART 350ML NOB', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 90750, produto: 'P-750', descricao: 'P-750 POTE RED C/TP ART 350 ML NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 91771, produto: 'P-771M', descricao: 'P-771 POTE DIAM RED C/TP ART 450ML NOB', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 90771, produto: 'P-771', descricao: 'P-771 POTE RED C/TP ART NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 907826, produto: 'P-78M', descricao: 'P-78M/BR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 907824, produto: 'P-78M/PR', descricao: 'P-78M/PR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 908036, produto: 'P-80A', descricao: 'P-80A/BR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 908034, produto: 'P-80A/PR', descricao: 'P-80A/PR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 908026, produto: 'P-80M', descricao: 'P-80M/BR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 908024, produto: 'P-80M/PR', descricao: 'P-80M/PR EMB PET CRISTAL BASE/TP NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 9088, produto: 'P-88', descricao: 'P-88 EMB RET C/TP ARTIC NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 9090, produto: 'P-90', descricao: 'P-90 EMB RET C/TP ARTIC 500 ML NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 9092, produto: 'P-92', descricao: 'P-92 EMB RET C/TP ARTIC 800 ML NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 9094, produto: 'P-94', descricao: 'P-94 EMB RET C/TP ARTIC 900 ML NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 90108, produto: 'PP-08', descricao: 'PP-08 EMB RET C/TP ARTIC NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 90110, produto: 'PP-10', descricao: 'PP-10 EMB RET C/TP ARTIC NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 90118, produto: 'PP-18', descricao: 'PP-18 EMB RET C/TP ARTIC NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 90120, produto: 'PP-20', descricao: 'PP-20 EMB RET C/TP ARTIC NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 901417, produto: 'PRATO P-70', descricao: 'PRATO P-70 PRETO NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
  { codigo: 95551, produto: 'PR-78', descricao: 'PRATO P-78 PRETO NOBRE', pesoLiquido: 0, custoUnit: 0, type: 'FINISHED', unit: 'cx', category: 'ARTICULADO' },
];

export const OPERATORS: Operator[] = [
  { id: 1, name: 'João Silva' },
  { id: 2, name: 'Maria Santos' },
  { id: 3, name: 'Carlos Oliveira' },
  { id: 4, name: 'Ana Pereira' },
  { id: 5, name: 'Roberto Souza' },
];

export const MACHINES_DB: Machine[] = [
  { code: 'EXT-01', name: 'Extrusora-01', group: 0, acquisitionDate: '2010-05-03', sector: 'Extrusão' },
  { code: 'EXT-02', name: 'Extrusora-02', group: 0, acquisitionDate: '2023-01-01', sector: 'Extrusão' },
  { code: 'TF-01', name: 'TermoFormadora-01', group: 0, acquisitionDate: '2010-01-01', sector: 'Termoformagem' },
  { code: 'TF-02', name: 'TermoFormadora-02', group: 0, acquisitionDate: '2010-01-01', sector: 'Termoformagem' },
  { code: 'TF-03', name: 'TermoFormadora-03', group: 0, acquisitionDate: '2010-01-01', sector: 'Termoformagem' },
  { code: 'TF-04', name: 'TermoFormadora-04', group: 0, acquisitionDate: '2010-01-01', sector: 'Termoformagem' },
  { code: 'TF-05', name: 'TermoFormadora-05', group: 0, acquisitionDate: '2010-01-01', sector: 'Termoformagem' },
  { code: 'TF-06', name: 'TermoFormadora-06', group: 0, acquisitionDate: '2010-01-01', sector: 'Termoformagem' },
  { code: 'TF-07', name: 'TermoFormadora-07', group: 0, acquisitionDate: '2010-01-01', sector: 'Termoformagem' },
];
