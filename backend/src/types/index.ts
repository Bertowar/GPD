
export interface RawMaterial {
  id?: string;
  code: string;
  name: string;
  unit: string;
  min_stock: number;
  current_stock: number;
  custom_data?: Record<string, any>;
}

export interface StockMovementInput {
  material_id: string;
  type: 'IN' | 'OUT_PROD' | 'OUT_LOSS' | 'ADJ';
  quantity: number;
  lot_number?: string; // Obrigatório para IN
  expiration_date?: Date; // Obrigatório para IN
  supplier?: string;
  unit_price?: number;
  operator_id?: string;
  related_entry_id?: string; // ID do apontamento de produção
}

export interface ProductionData {
  production_entry_id: string;
  product_code: number;
  quantity_produced: number;
  operator_id: string;
  timestamp: Date;
}

export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
