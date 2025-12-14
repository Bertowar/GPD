

export interface Product {
  codigo: number;
  produto: string;
  descricao: string;
  pesoLiquido: number;
  custoUnit: number; // Custo Manual (Legado) ou Referência
  sellingPrice?: number; // Novo: Preço de Venda
  itemsPerHour?: number; // Meta de produção (Peças/Hora)
  type?: 'FINISHED' | 'INTERMEDIATE' | 'COMPONENT'; // Logística / PCP
  category?: string; // Alterado de Enum fixo para string (Dinâmico)
  scrapMaterialId?: string; // ID da MP que este produto gera ao ser refugado (Economia Circular)
  compatibleMachines?: string[]; // Array of Machine Codes
  unit?: string; // NEW: kg, un, mil, cx
  currentStock?: number; // NEW: Estoque Atual do Produto Acabado
}

// NEW: Interface para a View Materializada de Custos
export interface ProductCostSummary {
    productCode: number;
    productName: string;
    sellingPrice: number;
    materialCost: number;
    packagingCost: number;
    operationalCost: number;
    totalCost: number; // Calculado no SQL
    // Margins are calculated in JS or SQL, prefer SQL
}

export interface Operator {
  id: number;
  name: string;
  sector?: string; // Setor vinculado
  defaultShift?: string; // NEW: Turno Padrão (ID do turno)
  role?: string; // Função
  baseSalary?: number;
  admissionDate?: string;
  terminationDate?: string;
  active?: boolean;
}

// Alterado para string para suportar cadastro dinâmico
export type MachineSector = string; 

export interface Sector {
    id: string;
    name: string;
    active: boolean;
}

export interface Machine {
  code: string;
  name: string;
  group?: number;
  acquisitionDate?: string;
  sector?: MachineSector;
  displayOrder?: number; // NEW: Sequence for UI layout
  productionCapacity?: number; // NEW: Capacidade Nominal (kg/h para Extrusoras, etc)
}

export interface MachineStatus {
  status: 'running' | 'stopped' | 'idle';
  productCode?: number;
}

export interface DowntimeType {
  id: string;
  description: string;
  exemptFromOperator?: boolean; // NEW: Flag para permitir salvar sem operador (ex: Falta de Funcionário)
  sector?: string; // NEW: Vincula o motivo a um setor específico (ou null para Global)
}

export interface ScrapReason {
  id: string;
  description: string;
  active: boolean;
}

// NEW: Categoria de Produto Dinâmica
export interface ProductCategory {
    id: string;
    name: string;
}

// ARQUITETURA FLEXÍVEL: Definição de Campos Dinâmicos
export type FieldType = 'text' | 'number' | 'date' | 'time' | 'select' | 'boolean' | 'textarea';

export interface FieldDefinition {
  id?: string;       // ID do banco (UUID)
  key: string;       // Chave no JSON (ex: 'batch_number')
  label: string;     // Rótulo visual (ex: 'Nº do Lote')
  type: FieldType;
  required?: boolean;
  options?: string[]; // Para selects
  placeholder?: string;
  defaultValue?: any;
  section?: 'production' | 'quality' | 'process'; // Agrupamento visual
  active?: boolean;
}

export interface ProductionEntry {
  id: string;
  date: string; // YYYY-MM-DD
  shift?: string; // Manhã, Tarde, Noite (Opcional)
  operatorId: number;
  productCode?: number | null; // Opcional para paradas
  machineId: string;
  startTime?: string; // HH:mm - Opcional para paradas apenas com duração
  endTime?: string; // HH:mm - Opcional para paradas apenas com duração
  qtyOK: number;
  qtyDefect: number;
  scrapReasonId?: string; // NEW: Motivo do Refugo
  observations: string;
  createdAt: number;
  // New fields for Downtime
  downtimeMinutes: number;
  downtimeTypeId?: string;
  
  // FLEXIBILIDADE: Armazena qualquer dado extra definido na configuração
  metaData?: Record<string, any>;
  
  // Link to Production Order (New)
  productionOrderId?: string;
}

// --- NEW: PRODUCTION PLANNING (PCP) ---

export type ProductionOrderStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type ProductionOrderPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface ProductionOrder {
  id: string; // OP Number (e.g., OP-2024-001)
  productCode: number;
  machineId?: string; // Preferred machine
  targetQuantity: number;
  producedQuantity?: number; // Calculated field
  customerName?: string;
  deliveryDate?: string;
  status: ProductionOrderStatus;
  priority: ProductionOrderPriority;
  notes?: string;
  createdAt: string;
  product?: Product; // Join
  metaData?: Record<string, any>; // NEW: To store specific mixes/recipes
}

export interface DashboardMetrics {
  totalProduced: number;
  totalDefects: number;
  defectRate: number;
  entriesCount: number;
  productivity: number; // items per hour
}

// NEW: Interface agregada para o Dashboard v2 (RPC)
export interface DashboardSummary {
    kpis: {
        produced: number;
        defects: number;
        entriesCount: number;
        efficiency: number; 
    };
    products: { name: string; ok: number; defect: number }[];
    operators: { name: string; ok: number; defect: number }[];
    shifts: { name: string; ok: number; defect: number }[];
    machines: any[]; // Polymorphic: Gantt events or Aggregate Stats
    isShortPeriod: boolean;
}

export type AlertType = 'quality' | 'productivity' | 'downtime';

export interface AppAlert {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  createdAt: number;
  isRead: boolean;
  relatedEntryId?: string;
}

export interface AppSettings {
  shiftHours: number;
  efficiencyTarget: number; // %
  maintenanceMode: boolean; 
  // NOVAS REGRAS DE VALIDAÇÃO
  requireScrapReason: boolean;      // Exigir motivo se refugo > 0
  blockExcessProduction: boolean;   // Bloquear se qtd > capacidade teórica
  requireDowntimeNotes: boolean;    // Exigir observação em paradas
  enableProductionOrders: boolean;  // Habilitar módulo de Ordens de Produção
}

export interface WorkShift {
    id: string;
    name: string;
    startTime: string; // HH:mm
    endTime: string;   // HH:mm
    active: boolean;
    sector?: string; // NEW: Vincula o turno a um setor específico (ou null para Global)
}

// --- Auth Types ---

export type UserRole = 'admin' | 'manager' | 'supervisor' | 'operator';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  fullName?: string;
}

// --- ERP NEW MODULES ---

// Changed to string to allow dynamic categories
export type MaterialCategory = string;

export interface RawMaterial {
  id: string;
  code: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  unitCost: number;
  category: MaterialCategory;
  group?: string; // NEW: Agrupamento (Ex: Aparas, Caixas, Resinas)
  active?: boolean; // NEW: Status de Ativo/Inativo
}

export interface ProductBOM {
  id: string;
  productCode: number;
  materialId: string;
  quantityRequired: number; // Qty per unit of product
  material?: RawMaterial; // For display
}

export interface InventoryTransaction {
  id: string;
  materialId: string;
  type: 'IN' | 'OUT' | 'ADJ';
  quantity: number;
  notes?: string;
  relatedEntryId?: string;
  createdAt: string;
  material?: RawMaterial; // For display
}

// --- PURCHASING MODULE (NEW) ---

export interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
}

export type PurchaseStatus = 'DRAFT' | 'PENDING' | 'RECEIVED' | 'CANCELLED';

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  status: PurchaseStatus;
  dateCreated: string;
  dateExpected?: string;
  notes?: string;
  supplier?: Supplier; // Join
  items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  id: string;
  orderId: string;
  materialId: string;
  quantity: number;
  unitCost: number;
  material?: RawMaterial; // Join
}


// --- LOGISTICS MODULE ---

export interface ShippingOrder {
  id: string;
  customerName: string;
  orderNumber: string;
  status: 'PENDING' | 'SEPARATED' | 'SHIPPED';
  scheduledDate: string;
  items?: ShippingItem[];
}

export interface ShippingItem {
  id: string;
  orderId: string;
  productCode: number;
  quantity: number;
  product?: Product;
}